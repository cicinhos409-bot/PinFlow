"use strict";

const crypto = require("crypto");
const { promisify } = require("util");

const scrypt = promisify(crypto.scrypt);

// Parâmetros do scrypt (custo de memória/tempo). Ficam gravados dentro do próprio hash,
// então dá para aumentar o custo no futuro sem quebrar senhas já salvas.
const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAX_N = 1 << 17; // teto aceito ao verificar (protege contra hash adulterado)

function memLimit(n, r) {
  return 128 * n * r * 2;
}

function prepare(password) {
  return String(password).normalize("NFKC");
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(prepare(password), salt, KEYLEN, { N, r: R, p: P, maxmem: memLimit(N, R) });
  return ["scrypt", N, R, P, salt.toString("base64"), hash.toString("base64")].join("$");
}

async function verifyPassword(password, stored) {
  try {
    const parts = String(stored || "").split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const n = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
    if (n < 2 || n > MAX_N || r < 1 || r > 16 || p < 1 || p > 4) return false;
    const salt = Buffer.from(parts[4], "base64");
    const expected = Buffer.from(parts[5], "base64");
    if (expected.length < 16) return false;
    const actual = await scrypt(prepare(password), salt, expected.length, { N: n, r, p, maxmem: memLimit(n, r) });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch (e) {
    return false;
  }
}

// Hash "de mentira" para gastar o mesmo tempo quando o e-mail não existe
// (evita descobrir, pela demora da resposta, quais e-mails têm conta).
let dummyPromise = null;
function dummyHash() {
  if (!dummyPromise) dummyPromise = hashPassword("senha-falsa-apenas-para-igualar-o-tempo");
  return dummyPromise;
}

function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function randomId() {
  return crypto.randomUUID();
}

// Id curto e aleatório que aparece nas URLs (/app/dashboard/<id>). Não é sequencial:
// ninguém consegue "adivinhar" o id de outra conta mudando um número.
const PUBLIC_ID_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // sem l, o, 0, 1 (parecidos)
function publicId(length = 12) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += PUBLIC_ID_ALPHABET[bytes[i] % PUBLIC_ID_ALPHABET.length];
  return out;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function hmac(secret, value) {
  return crypto.createHmac("sha256", secret).update(String(value)).digest("hex");
}

module.exports = { hashPassword, verifyPassword, dummyHash, randomToken, randomId, publicId, sha256, hmac };
