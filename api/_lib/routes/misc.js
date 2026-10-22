"use strict";

const config = require("../config");
const router = require("../router");
const { getDb, isConfigured: dbConfigured } = require("../db");
const { send, fail, appUrl } = require("../http");
const { clampInt } = require("../validate");
const { ipHash } = require("../auth");
const pinterest = require("../pinterest");
const storage = require("../storage");
const mailer = require("../mailer");
const worker = require("../worker");
const { present } = require("./pins");

/* ---------- Estado dos serviços (público, sem segredos) ---------- */

router.add("GET", "/status", async ({ res }) => {
  send(res, 200, {
    ok: true,
    db: dbConfigured(),
    storage: storage.mode(),
    pinterest: pinterest.isConfigured(),
    mail: mailer.isConfigured(),
    limits: {
      image_max_bytes: config.IMAGE_MAX_BYTES,
      video_max_bytes: config.VIDEO_MAX_BYTES,
      image_types: config.IMAGE_TYPES,
      video_types: config.VIDEO_TYPES,
      title_max: config.PIN_TITLE_MAX,
      description_max: config.PIN_DESCRIPTION_MAX,
      alt_text_max: config.PIN_ALT_TEXT_MAX,
      max_targets: config.MAX_PINS_PER_CREATE,
      daily_limit_max: config.ACCOUNT_DAILY_LIMIT_MAX,
    },
  });
});

/* ---------- Dashboard ---------- */

router.add("GET", "/dashboard", async ({ res, user, db }) => {
  const now = Date.now();
  const since7 = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const base = { user_id: user.id, deleted_at: null };
  const [accounts, needsReconnect, scheduled, published7, failed7, next, recent] = await Promise.all([
    db.count("pinterest_accounts", { user_id: user.id, deleted_at: null }),
    db.count("pinterest_accounts", { user_id: user.id, deleted_at: null, status: "needs_reconnect" }),
    db.count("pins", Object.assign({}, base, { status: "scheduled" })),
    db.count("pins", Object.assign({}, base, { status: "published", published_at: { gte: since7 } })),
    db.count("pins", Object.assign({}, base, { status: "failed", updated_at: { gte: since7 } })),
    db.findMany("pins", Object.assign({}, base, { status: "scheduled" }), { orderBy: [["scheduled_at", "asc"]], limit: 5 }),
    db.findMany("activity", { user_id: user.id }, { orderBy: [["created_at", "desc"]], limit: 8 }),
  ]);
  send(res, 200, {
    ok: true,
    stats: { accounts, needs_reconnect: needsReconnect, scheduled, published_7d: published7, failed_7d: failed7 },
    next: await present(db, user, next),
    activity: recent.map((e) => ({ id: e.id, kind: e.kind, message: e.message, created_at: e.created_at, pin_id: e.pin_id })),
  });
}, { auth: true });

/* ---------- Histórico ---------- */

router.add("GET", "/activity", async ({ res, query, user, db }) => {
  const where = { user_id: user.id };
  if (query.kind) where.kind = { like: String(query.kind).replace(/[%_]/g, "") + "%" };
  const limit = clampInt(query.limit, 1, 200, 50);
  const offset = clampInt(query.offset, 0, 100000, 0);
  const [rows, total] = await Promise.all([db.findMany("activity", where, { orderBy: [["created_at", "desc"]], limit, offset }), db.count("activity", where)]);
  const pinIds = [...new Set(rows.map((r) => r.pin_id).filter(Boolean))];
  const pins = pinIds.length ? await db.findMany("pins", { id: { in: pinIds } }, { limit: 500 }) : [];
  const pinPublic = new Map(pins.map((p) => [p.id, p.public_id]));
  send(res, 200, {
    ok: true,
    total,
    activity: rows.map((e) => ({ id: e.id, kind: e.kind, message: e.message, created_at: e.created_at, pin: e.pin_id ? pinPublic.get(e.pin_id) || null : null })),
  });
}, { auth: true });

/* ---------- Fila de publicação ---------- */

// Pode ser chamado por qualquer um (só publica o que já venceu); é limitado a uma execução a
// cada WORKER_MIN_INTERVAL_MS e a poucas chamadas por IP, para ninguém sobrecarregar.
router.add("POST", "/worker/run", async ({ req, res }) => {
  const db = getDb();
  const key = "worker:" + ipHash(req);
  const since = new Date(Date.now() - 60 * 1000).toISOString();
  if ((await db.count("auth_attempts", { key, at: { gte: since } })) >= 6) return fail(res, 429, "rate_limited", "Aguarde um pouco.");
  await db.insert("auth_attempts", { key, at: new Date().toISOString() });

  const now = new Date();
  const notBefore = new Date(now.getTime() - config.WORKER_MIN_INTERVAL_MS).toISOString();
  const acquired = await db.tryAcquireSetting("worker_last_run_at", now.toISOString(), notBefore);
  if (!acquired) return send(res, 200, { ok: true, skipped: true });
  const summary = await worker.runWorker(db, { baseUrl: appUrl(req) });
  send(res, 200, Object.assign({ ok: true }, summary));
});

// Cron diário da Vercel (plano Hobby: uma vez por dia) e agendadores externos com o segredo.
router.add("GET", "/cron/daily", async ({ req, res }) => {
  const auth = String(req.headers.authorization || "");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== "Bearer " + secret) return fail(res, 401, "unauthorized", "Não autorizado.");
  const db = getDb();
  const maintenance = await worker.runMaintenance(db);
  const queue = await worker.runWorker(db, { baseUrl: appUrl(req), limit: 50 });
  send(res, 200, { ok: true, maintenance, queue });
}, { raw: true });

// Agendador externo (ex.: cron-job.org a cada minuto) com o segredo: processa a fila.
router.add("GET", "/cron/queue", async ({ req, res, query }) => {
  const auth = String(req.headers.authorization || "");
  const secret = process.env.CRON_SECRET;
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : String(query.key || "");
  if (!secret || given !== secret) return fail(res, 401, "unauthorized", "Não autorizado.");
  const db = getDb();
  const queue = await worker.runWorker(db, { baseUrl: appUrl(req), limit: 50 });
  send(res, 200, Object.assign({ ok: true }, queue));
}, { raw: true });
