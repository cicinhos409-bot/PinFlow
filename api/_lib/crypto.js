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

/* ---------- Criptografia dos tokens da Pinterest (AES-256-GCM) ----------
 * Os tokens de acesso ficam no banco só criptografados. A chave vem de
 * TOKEN_ENCRYPTION_KEY (32 bytes em base64 ou 64 caracteres hex).
 * Sem a chave, na Vercel, o sistema se recusa a guardar tokens.
 */

function encryptionKey() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (raw) {
    const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (buf.length !== 32) {
      const e = new Error("TOKEN_ENCRYPTION_KEY precisa ter 32 bytes (base64) ou 64 caracteres hex");
      e.code = "CONFIG";
      throw e;
    }
    return buf;
  }
  if (process.env.VERCEL) {
    const e = new Error("TOKEN_ENCRYPTION_KEY ausente");
    e.code = "CONFIG";
    throw e;
  }
  // Só para desenvolvimento local
  return crypto.createHash("sha256").update("chave-somente-para-desenvolvimento").digest();
}

function encrypt(text) {
  if (text === null || text === undefined) return null;
  const key = encryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(":");
}

function decrypt(payload) {
  if (!payload) return null;
  const parts = String(payload).split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    const e = new Error("Token guardado em formato desconhecido");
    e.code = "DECRYPT";
    throw e;
  }
  const key = encryptionKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(parts[1], "base64"));
  decipher.setAuthTag(Buffer.from(parts[2], "base64"));
  return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64")), decipher.final()]).toString("utf8");
}

function hmac(secret, value) {
  return crypto.createHmac("sha256", secret).update(String(value)).digest("hex");
}

module.exports = { hashPassword, verifyPassword, dummyHash, randomToken, randomId, publicId, sha256, hmac, encrypt, decrypt };
