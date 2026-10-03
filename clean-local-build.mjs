import { rm } from "node:fs/promises";
import { resolve } from "node:path";

await rm(resolve(".cache/local-build"), { recursive: true, force: true });
