"use strict";

const config = require("../_lib/config");
const { getDb } = require("../_lib/db");
const { route, send, fail } = require("../_lib/http");
const { hashPassword, verifyPassword } = require("../_lib/crypto");
const { validatePassword } = require("../_lib/validate");
const { currentSession } = require("../_lib/auth");

// Troca de senha de quem está conectado. Exige a senha atual e encerra as outras sessões.
module.exports = route(["POST"], async ({ req, res, body }) => {
  const db = getDb();
  const current = await currentSession(db, req);
  if (!current) return fail(res, 401, "unauthenticated", "Você não está conectado.");

  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (!currentPassword || currentPassword.length > config.PASSWORD_MAX) {
    return fail(res, 422, "invalid_current_password", "Digite a sua senha atual.", "currentPassword");
  }

  const passwordError = validatePassword(newPassword, current.user.email);
  if (passwordError) return fail(res, 422, "weak_password", passwordError, "newPassword");
  if (newPassword === currentPassword) {
    return fail(res, 422, "same_password", "A nova senha precisa ser diferente da atual.", "newPassword");
  }

  if (!(await verifyPassword(currentPassword, current.user.password_hash))) {
    return fail(res, 403, "wrong_password", "A senha atual está incorreta.", "currentPassword");
  }

  const now = new Date().toISOString();
  await db.updateUser(current.user.id, { password_hash: await hashPassword(newPassword) }, now);
  // Quem estiver conectado em outro aparelho com a senha antiga perde o acesso.
  await db.revokeOtherSessions(current.user.id, current.session.id, now);
  send(res, 200, { ok: true });
});
