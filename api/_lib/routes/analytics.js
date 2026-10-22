"use strict";

const config = require("../config");
const router = require("../router");
const { send, fail } = require("../http");
const analytics = require("../analytics");

// Visão geral: pins publicados do usuário (só os dele) com métricas da Pinterest.
router.add("GET", "/analytics", async ({ res, query, user, db }) => {
  let accountId = null;
  if (query.account) {
    const a = await db.findOne("pinterest_accounts", { public_id: query.account, user_id: user.id, deleted_at: null });
    if (!a) return fail(res, 404, "not_found", "Conta não encontrada.");
    accountId = a.id;
  }
  const data = await analytics.overview(db, user, { period: query.days, accountId, refresh: false });
  send(res, 200, Object.assign({ ok: true, periods: config.ANALYTICS_PERIODS }, data));
}, { auth: true });

// Atualização manual (busca de novo na Pinterest), com espera mínima entre pedidos por usuário.
router.add("POST", "/analytics/refresh", async ({ res, body, user, db }) => {
  const key = "analytics_refresh:" + user.id;
  const last = await db.getSetting(key);
  const cooldown = config.ANALYTICS_MANUAL_COOLDOWN_MS;
  if (last && Date.now() - new Date(last).getTime() < cooldown) {
    const wait = Math.ceil((cooldown - (Date.now() - new Date(last).getTime())) / 60000);
    return fail(res, 429, "cooldown", "Os dados foram atualizados há pouco. Tente de novo em " + wait + " min.");
  }
  await db.setSetting(key, new Date().toISOString());
  let accountId = null;
  if (body.account) {
    const a = await db.findOne("pinterest_accounts", { public_id: String(body.account), user_id: user.id, deleted_at: null });
    if (a) accountId = a.id;
  }
  const data = await analytics.overview(db, user, { period: body.days, accountId, refresh: true, budget: config.ANALYTICS_REFRESH_BUDGET * 2 });
  send(res, 200, Object.assign({ ok: true, periods: config.ANALYTICS_PERIODS }, data));
}, { auth: true });

// Métricas de um pin (detalhe)
router.add("GET", "/analytics/pin/:id", async ({ res, params, query, user, db }) => {
  const pin = await db.findOne("pins", { public_id: params.id, user_id: user.id, deleted_at: null });
  if (!pin) return fail(res, 404, "not_found", "Pin não encontrado.");
  if (pin.status !== "published" || !pin.pinterest_pin_id) return send(res, 200, { ok: true, available: false, reason: "Métricas aparecem depois que o pin é publicado." });
  const data = await analytics.forPin(db, user, pin, query.days, { refresh: query.refresh === "1" });
  send(res, 200, Object.assign({ ok: true, available: true }, data));
}, { auth: true });
