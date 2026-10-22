"use strict";

const config = require("../config");
const router = require("../router");
const { getDb } = require("../db");
const { send, fail, redirect, appUrl, buildCookie, appendCookie, parseCookies, isSecure } = require("../http");
const { randomId, randomToken, publicId, hmac } = require("../crypto");
const { currentSession, secret } = require("../auth");
const { cleanText } = require("../validate");
const pinterest = require("../pinterest");
const activity = require("../activity");

/* ---------- Apresentação ---------- */

function publicAccount(a, extra) {
  return Object.assign(
    {
      id: a.public_id,
      username: a.username || "",
      display_name: a.display_name || "",
      profile_image: a.profile_image || "",
      account_type: a.account_type || "",
      website_url: a.website_url || "",
      status: a.status,
      daily_limit: a.daily_limit || config.ACCOUNT_DAILY_LIMIT_DEFAULT,
      label: a.label || "",
      last_synced_at: a.last_synced_at,
      last_error: a.last_error || "",
      token_expires_at: a.token_expires_at,
      refresh_expires_at: a.refresh_expires_at,
      is_business: String(a.account_type || "").toUpperCase() === "BUSINESS",
      created_at: a.created_at,
    },
    extra || {}
  );
}

function publicBoard(b) {
  return {
    id: b.id,
    pinterest_board_id: b.pinterest_board_id,
    name: b.name,
    description: b.description || "",
    privacy: b.privacy || "PUBLIC",
    pin_count: b.pin_count || 0,
    image_cover_url: b.image_cover_url || "",
    synced_at: b.synced_at,
  };
}

async function ownedAccount(db, user, id) {
  return db.findOne("pinterest_accounts", { public_id: id, user_id: user.id, deleted_at: null });
}

/* ---------- Sincronização de pastas ---------- */

async function syncBoards(db, account) {
  const remote = await pinterest.withAccount(db, account, (token) => pinterest.api.listAllBoards(token));
  const now = new Date().toISOString();
  const existing = await db.findMany("boards", { account_id: account.id }, { limit: 5000 });
  const byRemote = new Map(existing.map((b) => [b.pinterest_board_id, b]));
  const seen = new Set();
  for (const r of remote) {
    seen.add(r.id);
    const fields = {
      name: r.name || "(sem nome)",
      description: r.description || null,
      privacy: r.privacy || "PUBLIC",
      pin_count: typeof r.pin_count === "number" ? r.pin_count : null,
      image_cover_url: (r.media && r.media.image_cover_url) || null,
      is_ads_only: Boolean(r.is_ads_only),
      synced_at: now,
      updated_at: now,
    };
    const local = byRemote.get(r.id);
    if (local) await db.update("boards", { id: local.id }, fields);
    else await db.insert("boards", Object.assign({ id: randomId(), account_id: account.id, user_id: account.user_id, pinterest_board_id: r.id, created_at: now }, fields));
  }
  // Pastas que sumiram na Pinterest saem daqui também (pins ficam com board_id nulo).
  for (const b of existing) if (!seen.has(b.pinterest_board_id)) await db.remove("boards", { id: b.id });
  await db.update("pinterest_accounts", { id: account.id }, { last_synced_at: now, updated_at: now });
  return db.findMany("boards", { account_id: account.id }, { orderBy: [["name", "asc"]], limit: 5000 });
}

/* ---------- Login oficial da Pinterest (OAuth) ---------- */

function stateCookieValue(state, userId) {
  return state + "." + hmac(secret(), state + ":" + userId).slice(0, 32);
}

// GET /api/pinterest/connect -> manda para a tela de autorização da Pinterest
router.add("GET", "/pinterest/connect", async ({ req, res }) => {
  const db = getDb();
  const current = await currentSession(db, req);
  if (!current) return redirect(res, "/app/login");
  const user = current.user;
  if (!pinterest.isConfigured()) return redirect(res, "/app/contas/" + user.public_id + "?erro=pinterest_not_configured");
  const total = await db.count("pinterest_accounts", { user_id: user.id, deleted_at: null });
  if (total >= config.MAX_ACCOUNTS_PER_USER) return redirect(res, "/app/contas/" + user.public_id + "?erro=limite_contas");

  const state = randomToken();
  appendCookie(res, buildCookie(config.OAUTH_STATE_COOKIE, stateCookieValue(state, user.id), { maxAge: config.OAUTH_STATE_MINUTES * 60, secure: isSecure(req) }));
  const url = pinterest.authUrl({ redirectUri: appUrl(req) + "/api/pinterest/callback", state });
  redirect(res, url);
}, { raw: true });

// GET /api/pinterest/callback?code=...&state=... -> troca o código pelos tokens e salva a conta
router.add("GET", "/pinterest/callback", async ({ req, res, query }) => {
  const db = getDb();
  const current = await currentSession(db, req);
  if (!current) return redirect(res, "/app/login");
  const user = current.user;
  const back = "/app/contas/" + user.public_id;

  appendCookie(res, buildCookie(config.OAUTH_STATE_COOKIE, "", { maxAge: 0, secure: isSecure(req) }));
  const cookie = parseCookies(req.headers.cookie)[config.OAUTH_STATE_COOKIE] || "";
  const state = String(query.state || "");
  if (!state || !cookie || cookie !== stateCookieValue(state, user.id)) return redirect(res, back + "?erro=estado_invalido");
  if (query.error) return redirect(res, back + "?erro=recusado");
  const code = String(query.code || "");
  if (!code) return redirect(res, back + "?erro=sem_codigo");

  try {
    const tokens = await pinterest.exchangeCode({ code, redirectUri: appUrl(req) + "/api/pinterest/callback" });
    const info = await pinterest.api.userAccount(tokens.access_token);
    const now = new Date().toISOString();
    const base = {
      username: info.username || null,
      display_name: info.business_name || info.username || null,
      profile_image: info.profile_image || null,
      account_type: info.account_type || null,
      website_url: info.website_url || null,
      status: "active",
      last_error: null,
      updated_at: now,
      deleted_at: null,
    };
    const fields = Object.assign(base, pinterest.tokenFields(tokens));
    // Mesma conta reconectada (inclusive se tinha sido desconectada): atualiza em vez de duplicar.
    let account = await db.findOne("pinterest_accounts", { user_id: user.id, pinterest_user_id: String(info.id) });
    if (account) {
      account = await db.updateOne("pinterest_accounts", { id: account.id }, fields);
      await activity.log(db, { user_id: user.id, account_id: account.id, kind: "account_reconnected", message: "Conta @" + (account.username || "") + " reconectada." });
    } else {
      account = await db.insert(
        "pinterest_accounts",
        Object.assign({ id: randomId(), public_id: publicId(), user_id: user.id, pinterest_user_id: String(info.id), daily_limit: config.ACCOUNT_DAILY_LIMIT_DEFAULT, label: null, last_synced_at: null, created_at: now }, fields)
      );
      await activity.log(db, { user_id: user.id, account_id: account.id, kind: "account_connected", message: "Conta @" + (account.username || "") + " conectada pelo login oficial da Pinterest." });
    }
    try {
      await syncBoards(db, account);
    } catch (e) {
      const info2 = pinterest.describeError(e);
      await db.update("pinterest_accounts", { id: account.id }, { last_error: info2.message });
    }
    redirect(res, back + "/" + account.public_id + "?conectada=1");
  } catch (e) {
    const info = pinterest.describeError(e);
    console.error("[pinterest] callback:", e && e.message);
    redirect(res, back + "?erro=" + encodeURIComponent(info.code) + "&msg=" + encodeURIComponent(info.message));
  }
}, { raw: true });

/* ---------- Contas ---------- */

router.add("GET", "/accounts", async ({ res, user, db }) => {
  const rows = await db.findMany("pinterest_accounts", { user_id: user.id, deleted_at: null }, { orderBy: [["created_at", "asc"]], limit: 100 });
  const out = [];
  for (const a of rows) {
    const [boards, scheduled, published] = await Promise.all([
      db.count("boards", { account_id: a.id }),
      db.count("pins", { account_id: a.id, status: "scheduled", deleted_at: null }),
      db.count("pins", { account_id: a.id, status: "published", deleted_at: null }),
    ]);
    out.push(publicAccount(a, { boards_count: boards, scheduled_count: scheduled, published_count: published }));
  }
  send(res, 200, { ok: true, accounts: out, max: config.MAX_ACCOUNTS_PER_USER, pinterest_configured: pinterest.isConfigured() });
}, { auth: true });

router.add("GET", "/accounts/:id", async ({ res, params, user, db }) => {
  const a = await ownedAccount(db, user, params.id);
  if (!a) return fail(res, 404, "not_found", "Conta não encontrada.");
  const boards = await db.findMany("boards", { account_id: a.id }, { orderBy: [["name", "asc"]], limit: 5000 });
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [scheduled, publishedToday, failed] = await Promise.all([
    db.count("pins", { account_id: a.id, status: "scheduled", deleted_at: null }),
    db.count("pins", { account_id: a.id, status: "published", published_at: { gte: since } }),
    db.count("pins", { account_id: a.id, status: "failed", deleted_at: null }),
  ]);
  send(res, 200, { ok: true, account: publicAccount(a, { scheduled_count: scheduled, published_today: publishedToday, failed_count: failed }), boards: boards.map(publicBoard) });
}, { auth: true });

router.add("PATCH", "/accounts/:id", async ({ res, params, body, user, db }) => {
  const a = await ownedAccount(db, user, params.id);
  if (!a) return fail(res, 404, "not_found", "Conta não encontrada.");
  const fields = { updated_at: new Date().toISOString() };
  if (body.daily_limit !== undefined) {
    const n = Number(body.daily_limit);
    if (!Number.isInteger(n) || n < 1 || n > config.ACCOUNT_DAILY_LIMIT_MAX) {
      return fail(res, 422, "invalid_limit", "Informe um número de 1 a " + config.ACCOUNT_DAILY_LIMIT_MAX + ".", "daily_limit");
    }
    fields.daily_limit = n;
  }
  if (body.label !== undefined) fields.label = cleanText(body.label, 60) || null;
  const updated = await db.updateOne("pinterest_accounts", { id: a.id }, fields);
  send(res, 200, { ok: true, account: publicAccount(updated) });
}, { auth: true });

router.add("POST", "/accounts/:id/sync", async ({ res, params, user, db }) => {
  const a = await ownedAccount(db, user, params.id);
  if (!a) return fail(res, 404, "not_found", "Conta não encontrada.");
  if (a.status !== "active") return fail(res, 409, "needs_reconnect", "Esta conta precisa ser reconectada.");
  try {
    const boards = await syncBoards(db, a);
    send(res, 200, { ok: true, boards: boards.map(publicBoard) });
  } catch (e) {
    const info = pinterest.describeError(e);
    await db.update("pinterest_accounts", { id: a.id }, { last_error: info.message });
    fail(res, 502, info.code, info.message);
  }
}, { auth: true });

router.add("POST", "/accounts/:id/boards", async ({ res, params, body, user, db }) => {
  const a = await ownedAccount(db, user, params.id);
  if (!a) return fail(res, 404, "not_found", "Conta não encontrada.");
  if (a.status !== "active") return fail(res, 409, "needs_reconnect", "Esta conta precisa ser reconectada.");
  const name = cleanText(body.name, 180);
  if (!name) return fail(res, 422, "invalid_name", "Dê um nome à pasta.", "name");
  const description = cleanText(body.description, 500);
  const privacy = ["PUBLIC", "SECRET", "PROTECTED"].includes(body.privacy) ? body.privacy : "PUBLIC";
  try {
    const created = await pinterest.withAccount(db, a, (token) => pinterest.api.createBoard(token, { name, description: description || undefined, privacy }));
    const now = new Date().toISOString();
    const board = await db.insert("boards", {
      id: randomId(),
      account_id: a.id,
      user_id: user.id,
      pinterest_board_id: String(created.id),
      name: created.name || name,
      description: created.description || description || null,
      privacy: created.privacy || privacy,
      pin_count: 0,
      image_cover_url: null,
      is_ads_only: false,
      synced_at: now,
      created_at: now,
      updated_at: now,
    });
    await activity.log(db, { user_id: user.id, account_id: a.id, kind: "board_created", message: "Pasta \"" + board.name + "\" criada em @" + (a.username || "") + "." });
    send(res, 201, { ok: true, board: publicBoard(board) });
  } catch (e) {
    const info = pinterest.describeError(e);
    fail(res, 502, info.code, info.message);
  }
}, { auth: true });

router.add("PATCH", "/accounts/:id/boards/:board", async ({ res, params, body, user, db }) => {
  const a = await ownedAccount(db, user, params.id);
  if (!a) return fail(res, 404, "not_found", "Conta não encontrada.");
  const b = await db.findOne("boards", { id: params.board, account_id: a.id });
  if (!b) return fail(res, 404, "not_found", "Pasta não encontrada.");
  const patch = {};
  if (body.name !== undefined) {
    const name = cleanText(body.name, 180);
    if (!name) return fail(res, 422, "invalid_name", "Dê um nome à pasta.", "name");
    patch.name = name;
  }
  if (body.description !== undefined) patch.description = cleanText(body.description, 500);
  if (body.privacy !== undefined && ["PUBLIC", "SECRET", "PROTECTED"].includes(body.privacy)) patch.privacy = body.privacy;
  if (!Object.keys(patch).length) return fail(res, 422, "nothing_to_update", "Nada para alterar.");
  try {
    const updated = await pinterest.withAccount(db, a, (token) => pinterest.api.updateBoard(token, b.pinterest_board_id, patch));
    const now = new Date().toISOString();
    const row = await db.updateOne("boards", { id: b.id }, { name: updated.name || patch.name || b.name, description: updated.description !== undefined ? updated.description : patch.description !== undefined ? patch.description : b.description, privacy: updated.privacy || patch.privacy || b.privacy, updated_at: now, synced_at: now });
    send(res, 200, { ok: true, board: publicBoard(row) });
  } catch (e) {
    const info = pinterest.describeError(e);
    fail(res, 502, info.code, info.message);
  }
}, { auth: true });

router.add("DELETE", "/accounts/:id/boards/:board", async ({ res, params, user, db }) => {
  const a = await ownedAccount(db, user, params.id);
  if (!a) return fail(res, 404, "not_found", "Conta não encontrada.");
  const b = await db.findOne("boards", { id: params.board, account_id: a.id });
  if (!b) return fail(res, 404, "not_found", "Pasta não encontrada.");
  const pending = await db.count("pins", { board_id: b.id, status: { in: ["scheduled", "publishing"] }, deleted_at: null });
  if (pending) return fail(res, 409, "board_in_use", "Há " + pending + " pin(s) programado(s) nesta pasta. Cancele ou mova antes de apagar.");
  try {
    await pinterest.withAccount(db, a, (token) => pinterest.api.deleteBoard(token, b.pinterest_board_id));
    await db.remove("boards", { id: b.id });
    await activity.log(db, { user_id: user.id, account_id: a.id, kind: "board_deleted", message: "Pasta \"" + b.name + "\" apagada na Pinterest (@" + (a.username || "") + ")." });
    send(res, 200, { ok: true });
  } catch (e) {
    const info = pinterest.describeError(e);
    fail(res, 502, info.code, info.message);
  }
}, { auth: true });

// Desconectar: apaga os tokens; pins programados são cancelados; o histórico fica.
router.add("DELETE", "/accounts/:id", async ({ res, params, user, db }) => {
  const a = await ownedAccount(db, user, params.id);
  if (!a) return fail(res, 404, "not_found", "Conta não encontrada.");
  const now = new Date().toISOString();
  const canceled = await db.update("pins", { account_id: a.id, status: { in: ["scheduled", "publishing"] }, deleted_at: null }, { status: "canceled", canceled_at: now, next_attempt_at: null, updated_at: now });
  await db.update("pinterest_accounts", { id: a.id }, { status: "disconnected", access_token_enc: null, refresh_token_enc: null, token_expires_at: null, refresh_expires_at: null, deleted_at: now, updated_at: now });
  await db.remove("boards", { account_id: a.id });
  await activity.log(db, { user_id: user.id, account_id: a.id, kind: "account_disconnected", message: "Conta @" + (a.username || "") + " desconectada." + (canceled ? " " + canceled + " pin(s) programado(s) cancelado(s)." : "") });
  send(res, 200, { ok: true, canceled });
}, { auth: true });

module.exports = { publicAccount, publicBoard, ownedAccount, syncBoards };
