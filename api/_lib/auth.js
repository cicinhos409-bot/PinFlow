"use strict";

const config = require("./config");
const { randomToken, randomId, sha256, hmac } = require("./crypto");
const { parseCookies, buildCookie, isSecure, clientIp } = require("./http");

function secret() {
  const value = process.env.SESSION_SECRET;
  if (value) return value;
  if (process.env.VERCEL) {
    const e = new Error("SESSION_SECRET ausente");
    e.code = "CONFIG";
    throw e;
  }
  return "segredo-somente-para-desenvolvimento";
}

// IP "embaralhado": serve para limitar tentativas sem guardar o IP puro.
function ipHash(req) {
  return hmac(secret(), clientIp(req));
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name || "" };
}

async function startSession(db, req, res, user) {
  const token = randomToken();
  const now = new Date();
  const expires = new Date(now.getTime() + config.SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.createSession({
    id: randomId(),
    user_id: user.id,
    token_hash: sha256(token), // o token em si nunca é guardado
    user_agent: String(req.headers["user-agent"] || "").slice(0, 255),
    ip_hash: ipHash(req),
    expires_at: expires.toISOString(),
    revoked_at: null,
    created_at: now.toISOString(),
  });
  res.setHeader(
    "Set-Cookie",
    buildCookie(config.COOKIE_NAME, token, { maxAge: config.SESSION_DAYS * 24 * 60 * 60, secure: isSecure(req) })
  );
}

function clearSessionCookie(req, res) {
  res.setHeader("Set-Cookie", buildCookie(config.COOKIE_NAME, "", { maxAge: 0, secure: isSecure(req) }));
}

function readToken(req) {
  const token = parseCookies(req.headers.cookie)[config.COOKIE_NAME];
  return typeof token === "string" && token.length >= 20 && token.length <= 200 ? token : null;
}

// Devolve { user, session } se houver sessão válida; senão, null.
async function currentSession(db, req) {
  const token = readToken(req);
  if (!token) return null;
  const session = await db.findSessionByTokenHash(sha256(token));
  if (!session || session.revoked_at) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) return null;
  const user = await db.findUserById(session.user_id);
  if (!user || user.status !== "active") return null;
  return { user, session };
}

module.exports = { ipHash, publicUser, startSession, clearSessionCookie, readToken, currentSession };
