"use strict";

const config = require("./config");

// Senhas muito usadas. A regra principal é o tamanho; esta lista só barra o óbvio.
const COMMON = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "12345678910",
  "123123123",
  "11111111",
  "00000000",
  "password",
  "password1",
  "password123",
  "senha123",
  "senha1234",
  "senha12345",
  "senhasenha",
  "qwerty123",
  "qwertyuiop",
  "abc12345",
  "abcd1234",
  "iloveyou",
  "brasil123",
  "brasil2026",
  "admin123",
  "mudar123",
  "teste123",
  "1q2w3e4r",
  "pinterest",
  "pinterest123",
  "pinflow123",
]);

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validEmail(email) {
  return (
    email.length >= 5 &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) &&
    !email.includes("..")
  );
}

// Retorna a mensagem de erro, ou null se a senha for aceita.
function validatePassword(password, email) {
  if (password.length < config.PASSWORD_MIN) {
    return "A senha precisa ter pelo menos " + config.PASSWORD_MIN + " caracteres.";
  }
  if (password.length > config.PASSWORD_MAX) {
    return "A senha pode ter no máximo " + config.PASSWORD_MAX + " caracteres.";
  }
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "Essa senha é muito comum. Escolha outra.";
  if (email && (lower === email || lower === email.split("@")[0])) {
    return "A senha não pode ser igual ao seu e-mail.";
  }
  if (/^(.)\1+$/.test(password)) return "Evite repetir o mesmo caractere.";
  return null;
}

function cleanText(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max || 1000);
}

function cleanName(value) {
  return cleanText(value, 80).replace(/\s+/g, " ");
}

function validTimezone(tz) {
  if (typeof tz !== "string" || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: tz });
    return true;
  } catch (e) {
    return false;
  }
}

// Link de destino do pin: só http(s), sem credenciais, tamanho limitado.
function validLink(value) {
  if (typeof value !== "string" || value.length > config.PIN_LINK_MAX) return false;
  try {
    const u = new URL(value);
    return (u.protocol === "https:" || u.protocol === "http:") && !u.username && !u.password && Boolean(u.hostname);
  } catch (e) {
    return false;
  }
}

function isIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

// Id público (12 caracteres de a-z e 2-9, como gerado em crypto.publicId)
function validPublicId(value) {
  return typeof value === "string" && /^[a-z2-9]{6,32}$/.test(value);
}

module.exports = {
  normalizeEmail,
  validEmail,
  validatePassword,
  cleanText,
  cleanName,
  validTimezone,
  validLink,
  isIsoDate,
  clampInt,
  validPublicId,
};
