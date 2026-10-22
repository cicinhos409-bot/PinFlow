"use strict";

const config = require("./config");
const { randomToken, randomId, sha256, hmac } = require("./crypto");
const { parseCookies, buildCookie, appendCookie, isSecure, clientIp } = require("./http");

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
  // "id" aqui é o id público (o das URLs). O id interno nunca sai do servidor.
  return {
    id: user.public_id,
    email: user.email,
    name: user.name || "",
    timezone: user.timezone || "America/Sao_Paulo",
    role: user.role || "user",
    email_verified: Boolean(user.email_verified_at),
    notify_failures: user.notify_failures !== false,
    notify_token_expiry: user.notify_token_expiry !== false,
    created_at: user.created_at,
  };
}

async function startSession(db, req, res, user) {
  const token = randomToken();
  const now = new Date();
  const expires = new Date(now.getTime() + config.SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert("sessions", {
    id: randomId(),
    user_id: user.id,
    token_hash: sha256(token), // o token em si nunca é guardado
    user_agent: String(req.headers["user-agent"] || "").slice(0, 255),
    ip_hash: ipHash(req),
    expires_at: expires.toISOString(),
    revoked_at: null,
    last_seen_at: now.toISOString(),
    created_at: now.toISOString(),
  });
  appendCookie(
    res,
    buildCookie(config.COOKIE_NAME, token, { maxAge: config.SESSION_DAYS * 24 * 60 * 60, secure: isSecure(req) })
  );
}

function clearSessionCookie(req, res) {
  appendCookie(res, buildCookie(config.COOKIE_NAME, "", { maxAge: 0, secure: isSecure(req) }));
}

function readToken(req) {
  const token = parseCookies(req.headers.cookie)[config.COOKIE_NAME];
  return typeof token === "string" && token.length >= 20 && token.length <= 200 ? token : null;
}

// Devolve { user, session } se houver sessão válida; senão, null.
async function currentSession(db, req) {
  const token = readToken(req);
  if (!token) return null;
  const session = await db.findOne("sessions", { token_hash: sha256(token) });
  if (!session || session.revoked_at) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) return null;
  const user = await db.findOne("users", { id: session.user_id, deleted_at: null });
  if (!user || user.status !== "active") return null;
  // "visto por último": atualiza no máximo uma vez por hora para não escrever à toa
  const seen = session.last_seen_at ? new Date(session.last_seen_at).getTime() : 0;
  if (Date.now() - seen > 60 * 60 * 1000) {
    db.update("sessions", { id: session.id }, { last_seen_at: new Date().toISOString() }).catch(() => {});
  }
  return { user, session };
}

module.exports = { secret, ipHash, publicUser, startSession, clearSessionCookie, readToken, currentSession };
