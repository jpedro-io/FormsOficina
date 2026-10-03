"use strict";

const form = document.querySelector("#registration-form");
const feedback = document.querySelector("#form-feedback");
const submitButton = document.querySelector("#submit-button");
const buttonText = submitButton.querySelector("span:first-child");
const cpfInput = document.querySelector("#cpf");
const phoneInput = document.querySelector("#phone");
const ratingField = document.querySelector("#rating-field");
const setupNote = document.querySelector("#setup-note");
const legalLinks = document.querySelector("#legal-links");
const termsLink = document.querySelector("#terms-link");
const privacyLink = document.querySelector("#privacy-link");
let submissionReady = false;

function digitsOnly(value, maxLength) {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

function formatCpf(value) {
  return digitsOnly(value, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatPhone(value) {
  const digits = digitsOnly(value, 11);
  if (digits.length <= 2) return digits;
  const areaCode = `(${digits.slice(0, 2)})`;
  if (digits.length <= 6) return `${areaCode} ${digits.slice(2)}`;
  if (digits.length <= 10) return `${areaCode} ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `${areaCode} ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function isValidCpf(value) {
  const cpf = digitsOnly(value, 11);
  if (cpf.length !== 11 || /^([0-9])\1{10}$/.test(cpf)) return false;

  for (let position = 9; position < 11; position += 1) {
    let sum = 0;
    for (let index = 0; index < position; index += 1) {
      sum += Number(cpf[index]) * (position + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    const checkDigit = remainder === 10 ? 0 : remainder;
    if (Number(cpf[position]) !== checkDigit) return false;
  }
  return true;
}

function refreshCustomValidity(input) {
  if (input.value.trim() === "") {
    input.setCustomValidity("");
  } else if (input === cpfInput && !isValidCpf(input.value)) {
    input.setCustomValidity("Confira o CPF informado.");
  } else if (input === phoneInput && ![10, 11].includes(digitsOnly(input.value, 11).length)) {
    input.setCustomValidity("Informe um celular com DDD.");
  } else {
    input.setCustomValidity("");
  }
}

function clearFeedback() {
  feedback.hidden = true;
  feedback.textContent = "";
  feedback.classList.remove("error", "success");
  feedback.setAttribute("role", "status");
  feedback.setAttribute("aria-live", "polite");
}

function showFeedback(message, type) {
  feedback.textContent = message;
  feedback.classList.remove("error", "success");
  feedback.classList.add(type);
  feedback.setAttribute("role", type === "error" ? "alert" : "status");
  feedback.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
  feedback.hidden = false;
}

function updateInvalidState(input) {
  refreshCustomValidity(input);
  const invalid = !input.validity.valid;
  input.classList.toggle("is-invalid", invalid);
  input.setAttribute("aria-invalid", String(invalid));
}

async function loadSubmissionStatus() {
  try {
    const response = await fetch("/api/status", {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "same-origin",
      headers: { "Accept": "application/json" }
    });
    const status = await response.json().catch(() => null);
    const hasLegalLinks = Boolean(status
      && typeof status.termsUrl === "string"
      && typeof status.privacyUrl === "string");
    const localDevelopment = status?.localDevelopment === true;

    submissionReady = Boolean(response.ok && status?.ready === true && (localDevelopment || hasLegalLinks));
    if (submissionReady) {
      if (hasLegalLinks) {
        termsLink.href = status.termsUrl;
        privacyLink.href = status.privacyUrl;
        legalLinks.hidden = false;
      } else {
        legalLinks.hidden = true;
      }
      if (localDevelopment) {
        setupNote.textContent = "Modo local de desenvolvimento. Envios válidos serão gravados no banco configurado.";
        setupNote.hidden = false;
      } else {
        setupNote.hidden = true;
      }
      submitButton.disabled = false;
    } else {
      setupNote.textContent = "O envio está indisponível no momento. Nenhum dado foi enviado.";
      setupNote.hidden = false;
      submitButton.disabled = true;
    }
  } catch {
    submissionReady = false;
    setupNote.textContent = "O envio está indisponível no momento. Nenhum dado foi enviado.";
    setupNote.hidden = false;
    submitButton.disabled = true;
  }
}

cpfInput.addEventListener("input", () => {
  cpfInput.value = formatCpf(cpfInput.value);
  if (cpfInput.hasAttribute("aria-invalid")) updateInvalidState(cpfInput);
  if (form.checkValidity()) clearFeedback();
});

phoneInput.addEventListener("input", () => {
  phoneInput.value = formatPhone(phoneInput.value);
  if (phoneInput.hasAttribute("aria-invalid")) updateInvalidState(phoneInput);
  if (form.checkValidity()) clearFeedback();
});

form.querySelectorAll(".text-input").forEach((input) => {
  input.addEventListener("input", () => {
    if (input === cpfInput || input === phoneInput) return;
    if (input.hasAttribute("aria-invalid")) updateInvalidState(input);
    if (form.checkValidity()) clearFeedback();
  });
});

form.querySelectorAll('input[name="rating"]').forEach((input) => {
  input.addEventListener("change", () => {
    ratingField.classList.remove("is-invalid");
    form.querySelectorAll('input[name="rating"]').forEach((radio) => radio.setAttribute("aria-invalid", "false"));
    if (form.checkValidity()) clearFeedback();
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFeedback();

  const textInputs = [...form.querySelectorAll(".text-input")];
  textInputs.forEach(refreshCustomValidity);

  const invalidInputs = textInputs.filter((input) => !input.validity.valid);
  const ratingInvalid = !form.querySelector('input[name="rating"]:checked');

  textInputs.forEach((input) => {
    const invalid = !input.validity.valid;
    input.classList.toggle("is-invalid", invalid);
    input.setAttribute("aria-invalid", String(invalid));
  });
  form.querySelectorAll('input[name="rating"]').forEach((radio) => radio.setAttribute("aria-invalid", String(ratingInvalid)));
  ratingField.classList.toggle("is-invalid", ratingInvalid);

  if (invalidInputs.length > 0 || ratingInvalid) {
    showFeedback("Erro :( Confira os campos destacados e tente novamente.", "error");
    const firstInvalid = invalidInputs[0] || form.querySelector('input[name="rating"]');
    firstInvalid.focus();
    return;
  }

  if (!submissionReady) {
    setupNote.hidden = false;
    return;
  }

  const payload = Object.fromEntries(new FormData(form).entries());
  submitButton.disabled = true;
  submitButton.setAttribute("aria-busy", "true");

  let completed = false;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(form.action, {
      method: "POST",
      credentials: "omit",
      referrerPolicy: "same-origin",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const result = await response.json().catch(() => null);
    if (response.ok && result && result.ok === true) {
      form.reset();
      textInputs.forEach((input) => {
        input.classList.remove("is-invalid");
        input.removeAttribute("aria-invalid");
        input.setCustomValidity("");
      });
      ratingField.classList.remove("is-invalid");
      form.querySelectorAll('input[name="rating"]').forEach((radio) => radio.removeAttribute("aria-invalid"));
      showFeedback("Inscrição enviada com sucesso.", "success");
      buttonText.textContent = "Inscrição enviada";
      completed = true;
      return;
    }

    if (response.status === 409) {
      showFeedback("Este CPF já possui uma resposta registrada.", "error");
    } else if (response.status === 429) {
      showFeedback("Muitas tentativas em pouco tempo. Aguarde e tente novamente.", "error");
    } else {
      showFeedback("Erro :( Não foi possível enviar agora. Tente novamente.", "error");
    }
  } catch {
    showFeedback("Erro :( Não foi possível enviar agora. Tente novamente.", "error");
  } finally {
    window.clearTimeout(timeoutId);
    submitButton.removeAttribute("aria-busy");
    if (!completed) submitButton.disabled = false;
  }
});

function initScrollReveal() {
  if (!("IntersectionObserver" in window)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const targets = document.querySelectorAll("[data-reveal]");
  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.remove("reveal-pending");
      entry.target.classList.add("reveal-visible");
      currentObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12 });

  targets.forEach((target) => {
    target.classList.add("reveal-pending");
    observer.observe(target);
  });
}

initScrollReveal();
loadSubmissionStatus();
