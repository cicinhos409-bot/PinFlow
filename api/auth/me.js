"use strict";

const { getDb } = require("../_lib/db");
const { route, send, fail } = require("../_lib/http");
const { currentSession, publicUser } = require("../_lib/auth");

module.exports = route(["GET"], async ({ req, res }) => {
  const db = getDb();
  const current = await currentSession(db, req);
  if (!current) return fail(res, 401, "unauthenticated", "Você não está conectado.");
  send(res, 200, { ok: true, user: publicUser(current.user) });
});
