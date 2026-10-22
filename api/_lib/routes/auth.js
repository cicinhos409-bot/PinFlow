"use strict";

const config = require("../config");
const router = require("../router");
const { getDb } = require("../db");
const { send, fail, httpError, appUrl } = require("../http");
const { hashPassword, verifyPassword, dummyHash, sha256, randomId, randomToken, publicId } = require("../crypto");
const { normalizeEmail, validEmail, validatePassword, cleanName, validTimezone } = require("../validate");
const { ipHash, publicUser, startSession, clearSessionCookie, readToken } = require("../auth");
const mailer = require("../mailer");
const activity = require("../activity");
const storage = require("../storage");

const INVALID = "E-mail ou senha incorretos.";

async function tooMany(db, key, windowMs, max) {
  const since = new Date(Date.now() - windowMs).toISOString();
  return (await db.count("auth_attempts", { key, at: { gte: since } })) >= max;
}

function recordAttempt(db, key) {
  return db.insert("auth_attempts", { key, at: new Date().toISOString() });
}

/* ---------- Cadastro ---------- */

router.add("POST", "/auth/register", async ({ req, res, body }) => {
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

  const key = "register:" + ipHash(req);
  if (await tooMany(db, key, config.REGISTER_WINDOW_MS, config.REGISTER_MAX_PER_IP)) {
    return fail(res, 429, "rate_limited", "Muitas tentativas de cadastro. Tente novamente mais tarde.");
  }
  await recordAttempt(db, key);

  if (await db.findOne("users", { email })) {
    return fail(res, 409, "email_taken", "Já existe uma conta com este e-mail. Entre ou use outro e-mail.", "email");
  }

  const now = new Date().toISOString();
  let user;
  try {
    user = await db.insert("users", {
      id: randomId(),
      public_id: publicId(),
      email,
      password_hash: await hashPassword(password),
      name: cleanName(body.name),
      timezone: validTimezone(body.timezone) ? body.timezone : "America/Sao_Paulo",
      locale: "pt-BR",
      role: "user",
      status: "active",
      email_verified_at: null,
      terms_version: config.TERMS_VERSION,
      privacy_version: config.PRIVACY_VERSION,
      notify_failures: true,
      notify_token_expiry: true,
      last_login_at: now,
      deleted_at: null,
      created_at: now,
      updated_at: now,
    });
  } catch (e) {
    if (e && e.code === "UNIQUE_VIOLATION") {
      return fail(res, 409, "email_taken", "Já existe uma conta com este e-mail. Entre ou use outro e-mail.", "email");
    }
    throw e;
  }

  await startSession(db, req, res, user);
  await activity.log(db, { user_id: user.id, kind: "account_created", message: "Conta criada." });
  sendVerification(db, req, user).catch(() => {});
  send(res, 201, { ok: true, user: publicUser(user) });
});

/* ---------- Entrar ---------- */

router.add("POST", "/auth/login", async ({ req, res, body }) => {
  const db = getDb();

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return fail(res, 400, "missing_fields", "Informe o e-mail e a senha.");
  if (email.length > 254 || password.length > config.PASSWORD_MAX) {
    return fail(res, 401, "invalid_credentials", INVALID);
  }

  const ip = ipHash(req);
  const keyAccount = "login:" + ip + ":" + sha256(email);
  const keyIp = "login-ip:" + ip;
  const [lockedAccount, lockedIp] = await Promise.all([
    tooMany(db, keyAccount, config.LOGIN_WINDOW_MS, config.LOGIN_MAX_FAILS_PER_ACCOUNT),
    tooMany(db, keyIp, config.LOGIN_WINDOW_MS, config.LOGIN_MAX_FAILS_PER_IP),
  ]);
  if (lockedAccount || lockedIp) {
    return fail(res, 429, "rate_limited", "Muitas tentativas de entrada. Aguarde alguns minutos e tente de novo.");
  }

  const user = await db.findOne("users", { email, deleted_at: null });
  let ok = false;
  if (user) {
    ok = await verifyPassword(password, user.password_hash);
  } else {
    await verifyPassword(password, await dummyHash()); // mesmo tempo de resposta
  }

  if (!ok) {
    await Promise.all([recordAttempt(db, keyAccount), recordAttempt(db, keyIp)]);
    return fail(res, 401, "invalid_credentials", INVALID);
  }

  if (user.status !== "active") {
    return fail(res, 403, "account_unavailable", "Esta conta está indisponível. Fale com o suporte.");
  }

  const now = new Date().toISOString();
  await db.update("users", { id: user.id }, { last_login_at: now, updated_at: now });
  await startSession(db, req, res, user);
  send(res, 200, { ok: true, user: publicUser(user) });
});

/* ---------- Sair ---------- */

router.add("POST", "/auth/logout", async ({ req, res }) => {
  // Sair sempre limpa o cookie, mesmo que o banco esteja indisponível.
  const token = readToken(req);
  if (token) {
    try {
      const db = getDb();
      await db.update("sessions", { token_hash: sha256(token), revoked_at: null }, { revoked_at: new Date().toISOString() });
    } catch (e) {
      if (!e || e.code !== "DB_NOT_CONFIGURED") console.error("[auth] logout:", e && e.message);
    }
  }
  clearSessionCookie(req, res);
  send(res, 200, { ok: true });
});

/* ---------- Quem sou ---------- */

router.add("GET", "/auth/me", async ({ res, user }) => {
  send(res, 200, { ok: true, user: publicUser(user) });
}, { auth: true });

/* ---------- Perfil e preferências ---------- */

router.add("PATCH", "/auth/profile", async ({ res, body, user, db }) => {
  const fields = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) {
    if (typeof body.name !== "string") return fail(res, 422, "invalid_name", "Digite um nome.", "name");
    fields.name = cleanName(body.name);
  }
  if (body.timezone !== undefined) {
    if (!validTimezone(body.timezone)) return fail(res, 422, "invalid_timezone", "Fuso horário inválido.", "timezone");
    fields.timezone = body.timezone;
  }
  if (body.notify_failures !== undefined) fields.notify_failures = body.notify_failures === true;
  if (body.notify_token_expiry !== undefined) fields.notify_token_expiry = body.notify_token_expiry === true;
  const updated = await db.updateOne("users", { id: user.id }, fields);
  send(res, 200, { ok: true, user: publicUser(updated) });
}, { auth: true });

/* ---------- Trocar senha ---------- */

router.add("POST", "/auth/password", async ({ res, body, user, session, db }) => {
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (!currentPassword || currentPassword.length > config.PASSWORD_MAX) {
    return fail(res, 422, "invalid_current_password", "Digite a sua senha atual.", "currentPassword");
  }
  const passwordError = validatePassword(newPassword, user.email);
  if (passwordError) return fail(res, 422, "weak_password", passwordError, "newPassword");
  if (newPassword === currentPassword) {
    return fail(res, 422, "same_password", "A nova senha precisa ser diferente da atual.", "newPassword");
  }
  if (!(await verifyPassword(currentPassword, user.password_hash))) {
    return fail(res, 403, "wrong_password", "A senha atual está incorreta.", "currentPassword");
  }
  const now = new Date().toISOString();
  await db.update("users", { id: user.id }, { password_hash: await hashPassword(newPassword), updated_at: now });
  // Quem estiver conectado em outro aparelho com a senha antiga perde o acesso.
  await db.update("sessions", { user_id: user.id, id: { ne: session.id }, revoked_at: null }, { revoked_at: now });
  await activity.log(db, { user_id: user.id, kind: "password_changed", message: "Senha alterada. Outros aparelhos foram desconectados." });
  send(res, 200, { ok: true });
}, { auth: true });

/* ---------- Sessões (aparelhos conectados) ---------- */

router.add("GET", "/auth/sessions", async ({ res, user, session, db }) => {
  const now = new Date().toISOString();
  const rows = await db.findMany("sessions", { user_id: user.id, revoked_at: null, expires_at: { gt: now } }, { orderBy: [["last_seen_at", "desc"]], limit: 50 });
  send(res, 200, {
    ok: true,
    sessions: rows.map((s) => ({ id: s.id, current: s.id === session.id, user_agent: s.user_agent || "", created_at: s.created_at, last_seen_at: s.last_seen_at || s.created_at })),
  });
}, { auth: true });

router.add("DELETE", "/auth/sessions/:id", async ({ res, params, user, session, db }) => {
  if (params.id === session.id) return fail(res, 400, "current_session", "Para sair deste aparelho, use o botão Sair.");
  const n = await db.update("sessions", { id: params.id, user_id: user.id, revoked_at: null }, { revoked_at: new Date().toISOString() });
  if (!n) return fail(res, 404, "not_found", "Sessão não encontrada.");
  send(res, 200, { ok: true });
}, { auth: true });

router.add("POST", "/auth/sessions/revoke-others", async ({ res, user, session, db }) => {
  await db.update("sessions", { user_id: user.id, id: { ne: session.id }, revoked_at: null }, { revoked_at: new Date().toISOString() });
  send(res, 200, { ok: true });
}, { auth: true });

/* ---------- Esqueci a senha ---------- */

async function createEmailToken(db, user, kind, minutes) {
  const token = randomToken();
  await db.insert("auth_tokens", {
    id: randomId(),
    user_id: user.id,
    kind,
    token_hash: sha256(token),
    expires_at: new Date(Date.now() + minutes * 60 * 1000).toISOString(),
    used_at: null,
    created_at: new Date().toISOString(),
  });
  return token;
}

router.add("POST", "/auth/forgot", async ({ req, res, body }) => {
  const db = getDb();
  const email = normalizeEmail(body.email);
  if (!validEmail(email)) return fail(res, 422, "invalid_email", "Digite um e-mail válido.", "email");
  const key = "forgot:" + ipHash(req);
  if (await tooMany(db, key, config.FORGOT_WINDOW_MS, config.FORGOT_MAX_PER_IP)) {
    return fail(res, 429, "rate_limited", "Muitas tentativas. Aguarde um pouco e tente de novo.");
  }
  await recordAttempt(db, key);
  if (!mailer.isConfigured()) {
    return fail(res, 503, "mail_not_configured", "O envio de e-mails ainda não está configurado. Fale com o suporte para redefinir a senha.");
  }
  const user = await db.findOne("users", { email, deleted_at: null });
  // Resposta igual com ou sem conta (não revela quem tem cadastro).
  if (user && user.status === "active") {
    const token = await createEmailToken(db, user, "reset_password", config.RESET_TOKEN_MINUTES);
    const url = appUrl(req) + "/app/redefinir/" + token;
    await mailer.send({
      to: user.email,
      subject: "Redefinir sua senha",
      title: "Redefinir sua senha",
      lines: ["Recebemos um pedido para redefinir a senha da sua conta.", "O link vale por " + config.RESET_TOKEN_MINUTES + " minutos. Se você não pediu, ignore este e-mail."],
      button: { label: "Criar nova senha", url },
    });
  }
  send(res, 200, { ok: true, message: "Se existir uma conta com este e-mail, enviamos o link para criar uma nova senha." });
});

router.add("POST", "/auth/reset", async ({ req, res, body }) => {
  const db = getDb();
  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!token || token.length < 20 || token.length > 200) return fail(res, 400, "invalid_token", "Link inválido. Peça um novo.");
  const row = await db.findOne("auth_tokens", { token_hash: sha256(token), kind: "reset_password" });
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    return fail(res, 400, "invalid_token", "Este link não vale mais. Peça um novo.");
  }
  const user = await db.findOne("users", { id: row.user_id, deleted_at: null });
  if (!user) return fail(res, 400, "invalid_token", "Este link não vale mais. Peça um novo.");
  const passwordError = validatePassword(password, user.email);
  if (passwordError) return fail(res, 422, "weak_password", passwordError, "password");
  const now = new Date().toISOString();
  await db.update("users", { id: user.id }, { password_hash: await hashPassword(password), updated_at: now, email_verified_at: user.email_verified_at || now });
  await db.update("auth_tokens", { id: row.id }, { used_at: now });
  await db.update("sessions", { user_id: user.id, revoked_at: null }, { revoked_at: now }); // todos os aparelhos saem
  await activity.log(db, { user_id: user.id, kind: "password_reset", message: "Senha redefinida por e-mail. Todos os aparelhos foram desconectados." });
  await startSession(db, req, res, user);
  send(res, 200, { ok: true, user: publicUser(user) });
});

/* ---------- Confirmar e-mail ---------- */

async function sendVerification(db, req, user) {
  if (!mailer.isConfigured() || user.email_verified_at) return false;
  const token = await createEmailToken(db, user, "verify_email", config.VERIFY_TOKEN_HOURS * 60);
  const url = appUrl(req) + "/app/confirmar/" + token;
  await mailer.send({
    to: user.email,
    subject: "Confirme seu e-mail",
    title: "Confirme seu e-mail",
    lines: ["Falta um passo: confirme que este e-mail é seu.", "O link vale por " + config.VERIFY_TOKEN_HOURS + " horas."],
    button: { label: "Confirmar e-mail", url },
  });
  return true;
}

router.add("POST", "/auth/verify/send", async ({ req, res, user, db }) => {
  if (user.email_verified_at) return send(res, 200, { ok: true, already: true });
  if (!mailer.isConfigured()) return fail(res, 503, "mail_not_configured", "O envio de e-mails ainda não está configurado.");
  const key = "verify:" + user.id;
  if (await tooMany(db, key, 60 * 60 * 1000, 5)) return fail(res, 429, "rate_limited", "Já enviamos vários e-mails. Confira a caixa de spam e tente mais tarde.");
  await recordAttempt(db, key);
  await sendVerification(db, req, user);
  send(res, 200, { ok: true });
}, { auth: true });

router.add("POST", "/auth/verify", async ({ res, body }) => {
  const db = getDb();
  const token = typeof body.token === "string" ? body.token : "";
  if (!token || token.length < 20 || token.length > 200) return fail(res, 400, "invalid_token", "Link inválido.");
  const row = await db.findOne("auth_tokens", { token_hash: sha256(token), kind: "verify_email" });
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    return fail(res, 400, "invalid_token", "Este link não vale mais. Peça um novo nas configurações.");
  }
  const now = new Date().toISOString();
  await db.update("users", { id: row.user_id }, { email_verified_at: now, updated_at: now });
  await db.update("auth_tokens", { id: row.id }, { used_at: now });
  send(res, 200, { ok: true });
});

/* ---------- Excluir conta (LGPD) ---------- */

router.add("POST", "/auth/delete-account", async ({ req, res, body, user, db }) => {
  const password = typeof body.password === "string" ? body.password : "";
  if (!password || !(await verifyPassword(password, user.password_hash))) {
    return fail(res, 403, "wrong_password", "Senha incorreta.", "password");
  }
  if (body.confirm !== "EXCLUIR") return fail(res, 422, "confirm_required", "Digite EXCLUIR para confirmar.", "confirm");

  // Apaga os arquivos de mídia do armazenamento (o banco apaga o resto em cascata).
  const media = await db.findMany("media", { user_id: user.id }, { limit: 5000 });
  for (const m of media) await storage.remove(m.storage_key || m.url);

  await db.remove("users", { id: user.id });
  clearSessionCookie(req, res);
  send(res, 200, { ok: true });
}, { auth: true });

module.exports = { sendVerification };
