import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);
const maxBodyBytes = 5_000;
const files = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/styles.css", "styles.css"],
  ["/app.js", "app.js"],
  ["/assets/ifba-logo-horizontal-completa-branca.png", "assets/ifba-logo-horizontal-completa-branca.png"]
]);
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png"
};

async function loadLocalEnvironment() {
  const fileValues = new Map();

  for (const filename of [".env", ".env.local"]) {
    let content;
    try {
      content = await readFile(resolve(root, filename), "utf8");
    } catch {
      continue;
    }

    for (const line of content.split(/\r?\n/)) {
      let trimmed = line.replace(/^\uFEFF/, "").trim();
      if (trimmed.startsWith("export ")) trimmed = trimmed.slice(7).trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      fileValues.set(key, value);
    }
  }

  for (const [key, value] of fileValues) {
    // A blank inherited shell variable should not suppress a value from .env.
    if (!process.env[key]?.trim()) process.env[key] = value;
  }
  process.env.NODE_ENV ||= "development";
  process.env.APP_ENV = "local";
}

function secureHeaders(res) {
  res.setHeader("Content-Security-Policy", "default-src 'self'; base-uri 'self'; form-action 'self'; img-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none';");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.end(JSON.stringify(body));
}

function attachVercelResponseHelpers(res) {
  res.status = (status) => {
    res.statusCode = status;
    return res;
  };
  res.json = (body) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
    return res;
  };
  return res;
}

async function readLimitedBody(req) {
  const chunks = [];
  let size = 0;
  let tooLarge = false;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      tooLarge = true;
      chunks.length = 0;
      continue;
    }
    if (!tooLarge) chunks.push(chunk);
  }

  return tooLarge ? null : Buffer.concat(chunks);
}

await loadLocalEnvironment();
const databaseUrlForDiagnostics = process.env.DATABASE_URL?.trim() ?? "";
if (!databaseUrlForDiagnostics) {
  console.warn("[config] DATABASE_URL ausente; confirme o arquivo .env/.env.local ao lado de package.json.");
} else if (Buffer.byteLength(databaseUrlForDiagnostics, "utf8") < 32) {
  console.warn("[config] DATABASE_URL encontrada, mas parece incompleta; o valor não será exibido.");
} else {
  console.log("[config] DATABASE_URL carregada; valor oculto.");
}
const { default: signupHandler } = await import("./.cache/local-build/api/inscricoes.js");
const { default: statusHandler } = await import("./.cache/local-build/api/status.js");

const server = createServer(async (req, res) => {
  secureHeaders(res);
  const pathname = new URL(req.url || "/", "http://localhost").pathname;

  if (pathname === "/api/status") {
    attachVercelResponseHelpers(res);
    statusHandler(req, res);
    return;
  }

  if (pathname === "/api/inscricoes") {
    const length = Number(req.headers["content-length"] || 0);
    if (Number.isFinite(length) && length > maxBodyBytes) {
      json(res, 413, { ok: false, message: "Envio muito grande." });
      return;
    }

    let body;
    try {
      body = await readLimitedBody(req);
    } catch {
      json(res, 400, { ok: false, message: "Confira os dados e tente novamente." });
      return;
    }
    if (body === null) {
      json(res, 413, { ok: false, message: "Envio muito grande." });
      return;
    }

    req.body = body;
    attachVercelResponseHelpers(res);
    try {
      await signupHandler(req, res);
    } catch {
      if (!res.writableEnded) json(res, 500, { ok: false, message: "Erro :( Não foi possível enviar agora. Tente novamente." });
    }
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    json(res, 404, { ok: false, message: "Página não encontrada." });
    return;
  }

  const file = files.get(pathname);
  if (!file) {
    json(res, 404, { ok: false, message: "Página não encontrada." });
    return;
  }

  try {
    const path = resolve(root, file);
    const contents = await readFile(path);
    res.statusCode = 200;
    res.setHeader("Content-Type", contentTypes[extname(path)] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Length", String(contents.length));
    if (req.method === "HEAD") res.end();
    else res.end(contents);
  } catch {
    json(res, 500, { ok: false, message: "Não foi possível abrir o site agora." });
  }
});

server.headersTimeout = 10_000;
server.requestTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.listen(port, "0.0.0.0", () => {
  console.log(`Workspace Integrado disponível na porta ${port}.`);
});
