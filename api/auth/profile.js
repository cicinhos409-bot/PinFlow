"use strict";

const { getDb } = require("../_lib/db");
const { route, send, fail } = require("../_lib/http");
const { cleanName } = require("../_lib/validate");
const { currentSession, publicUser } = require("../_lib/auth");

// Altera dados simples do perfil (por enquanto, só o nome).
module.exports = route(["PATCH"], async ({ req, res, body }) => {
  const db = getDb();
  const current = await currentSession(db, req);
  if (!current) return fail(res, 401, "unauthenticated", "Você não está conectado.");

  if (typeof body.name !== "string") return fail(res, 422, "invalid_name", "Digite um nome.", "name");
  const name = cleanName(body.name);

  const user = await db.updateUser(current.user.id, { name }, new Date().toISOString());
  send(res, 200, { ok: true, user: publicUser(user) });
});
