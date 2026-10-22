"use strict";

const config = require("../_lib/config");
const { getDb } = require("../_lib/db");
const { route, send, fail } = require("../_lib/http");
const { hashPassword, randomId } = require("../_lib/crypto");
const { normalizeEmail, validEmail, validatePassword, cleanName } = require("../_lib/validate");
const { ipHash, publicUser, startSession } = require("../_lib/auth");

module.exports = route(["POST"], async ({ req, res, body }) => {
  const db = getDb();

  // Campo isca: pessoas não veem este campo; robôs costumam preencher.
  if (typeof body.website === "string" && body.website !== "") {
    return fail(res, 400, "invalid", "Não foi possível concluir o cadastro.");
  }

  const email = normalizeEmail(body.email);
  if (!validEmail(email)) return fail(res, 422, "invalid_email", "Digite um e-mail válido.", "email");

  const password = typeof body.password === "string" ? body.password : "";
  const passwordError = validatePassword(password, email);
  if (passwordError) return fail(res, 422, "weak_password", passwordError, "password");

  if (body.acceptTerms !== true) {
    return fail(res, 422, "terms_required", "Aceite os Termos de Uso e a Política de Privacidade para continuar.", "acceptTerms");
  }

  // Limite de contas criadas por IP (conta só o que passou na validação).
  const key = "register:" + ipHash(req);
  const since = Date.now() - config.REGISTER_WINDOW_MS;
  if ((await db.countAttempts(key, since)) >= config.REGISTER_MAX_PER_IP) {
    return fail(res, 429, "rate_limited", "Muitas tentativas de cadastro. Tente novamente mais tarde.");
  }
  await db.recordAttempt(key, Date.now());

  if (await db.findUserByEmail(email)) {
    return fail(res, 409, "email_taken", "Já existe uma conta com este e-mail. Entre ou use outro e-mail.", "email");
  }

  const now = new Date().toISOString();
  let user;
  try {
    user = await db.createUser({
      id: randomId(),
      email,
      password_hash: await hashPassword(password),
      name: cleanName(body.name),
      timezone: "America/Sao_Paulo",
      locale: "pt-BR",
      role: "user",
      status: "active",
      email_verified_at: null,
      terms_version: config.TERMS_VERSION,
      privacy_version: config.PRIVACY_VERSION,
      last_login_at: now,
      deleted_at: null,
      created_at: now,
      updated_at: now,
    });
  } catch (e) {
    if (e && e.code === "EMAIL_TAKEN") {
      return fail(res, 409, "email_taken", "Já existe uma conta com este e-mail. Entre ou use outro e-mail.", "email");
    }
    throw e;
  }

  await startSession(db, req, res, user);
  send(res, 201, { ok: true, user: publicUser(user) });
});
