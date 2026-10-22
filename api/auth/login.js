"use strict";

const config = require("../_lib/config");
const { getDb } = require("../_lib/db");
const { route, send, fail } = require("../_lib/http");
const { verifyPassword, dummyHash, sha256 } = require("../_lib/crypto");
const { normalizeEmail } = require("../_lib/validate");
const { ipHash, publicUser, startSession } = require("../_lib/auth");

const INVALID = "E-mail ou senha incorretos.";

module.exports = route(["POST"], async ({ req, res, body }) => {
  const db = getDb();

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return fail(res, 400, "missing_fields", "Informe o e-mail e a senha.");
  if (email.length > 254 || password.length > config.PASSWORD_MAX) {
    return fail(res, 401, "invalid_credentials", INVALID);
  }

  // Limite de tentativas erradas: por e-mail + IP e por IP.
  const ip = ipHash(req);
  const keyAccount = "login:" + ip + ":" + sha256(email);
  const keyIp = "login-ip:" + ip;
  const since = Date.now() - config.LOGIN_WINDOW_MS;
  const [failsAccount, failsIp] = await Promise.all([db.countAttempts(keyAccount, since), db.countAttempts(keyIp, since)]);
  if (failsAccount >= config.LOGIN_MAX_FAILS_PER_ACCOUNT || failsIp >= config.LOGIN_MAX_FAILS_PER_IP) {
    return fail(res, 429, "rate_limited", "Muitas tentativas de entrada. Aguarde alguns minutos e tente de novo.");
  }

  const user = await db.findUserByEmail(email);
  let ok = false;
  if (user) {
    ok = await verifyPassword(password, user.password_hash);
  } else {
    await verifyPassword(password, await dummyHash()); // mesmo tempo de resposta
  }

  if (!ok) {
    const now = Date.now();
    await Promise.all([db.recordAttempt(keyAccount, now), db.recordAttempt(keyIp, now)]);
    return fail(res, 401, "invalid_credentials", INVALID);
  }

  if (user.status !== "active") {
    return fail(res, 403, "account_unavailable", "Esta conta está indisponível. Fale com o suporte.");
  }

  await db.touchLogin(user.id, new Date().toISOString());
  await startSession(db, req, res, user);
  send(res, 200, { ok: true, user: publicUser(user) });
});
