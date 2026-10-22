"use strict";

const { getDb } = require("../_lib/db");
const { route, send } = require("../_lib/http");
const { sha256 } = require("../_lib/crypto");
const { readToken, clearSessionCookie } = require("../_lib/auth");

module.exports = route(["POST"], async ({ req, res }) => {
  // Sair sempre limpa o cookie, mesmo que o banco esteja indisponível.
  const token = readToken(req);
  if (token) {
    try {
      const db = getDb();
      const session = await db.findSessionByTokenHash(sha256(token));
      if (session && !session.revoked_at) await db.revokeSession(session.id, new Date().toISOString());
    } catch (e) {
      if (!e || e.code !== "DB_NOT_CONFIGURED") console.error("[auth] logout:", e && e.message);
    }
  }
  clearSessionCookie(req, res);
  send(res, 200, { ok: true });
});
