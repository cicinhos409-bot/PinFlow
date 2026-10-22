"use strict";

const config = require("../config");
const router = require("../router");
const { send, fail } = require("../http");
const { randomId, publicId } = require("../crypto");
const { cleanText, validLink, isIsoDate, clampInt } = require("../validate");
const pinterest = require("../pinterest");
const activity = require("../activity");
const { publicMedia } = require("./media");

const STATUSES = ["scheduled", "publishing", "published", "failed", "canceled"];
const EDITABLE_WHEN = ["scheduled", "failed", "canceled"];

/* ---------- Apresentação ---------- */

function publicPin(p, maps) {
  const account = maps.accounts.get(p.account_id);
  const board = p.board_id ? maps.boards.get(p.board_id) : null;
  const media = p.media_id ? maps.media.get(p.media_id) : null;
  const cover = p.cover_media_id ? maps.media.get(p.cover_media_id) : null;
  return {
    id: p.public_id,
    status: p.status,
    title: p.title || "",
    description: p.description || "",
    link: p.link || "",
    alt_text: p.alt_text || "",
    scheduled_at: p.scheduled_at,
    next_attempt_at: p.next_attempt_at,
    attempts: p.attempts || 0,
    published_at: p.published_at,
    canceled_at: p.canceled_at,
    pinterest_pin_id: p.pinterest_pin_id || null,
    pinterest_url: p.pinterest_url || null,
    error_code: p.error_code || null,
    error_message: p.error_message || null,
    created_at: p.created_at,
    updated_at: p.updated_at,
    account: account ? { id: account.public_id, username: account.username || "", display_name: account.display_name || "", status: account.status, profile_image: account.profile_image || "" } : null,
    board: board ? { id: board.id, name: board.name, privacy: board.privacy || "PUBLIC" } : null,
    media: media ? publicMedia(media) : null,
    cover: cover ? publicMedia(cover) : null,
    editable: EDITABLE_WHEN.includes(p.status),
  };
}

async function buildMaps(db, user, pins) {
  const accountIds = [...new Set(pins.map((p) => p.account_id))];
  const boardIds = [...new Set(pins.map((p) => p.board_id).filter(Boolean))];
  const mediaIds = [...new Set(pins.flatMap((p) => [p.media_id, p.cover_media_id]).filter(Boolean))];
  const [accounts, boards, media] = await Promise.all([
    accountIds.length ? db.findMany("pinterest_accounts", { id: { in: accountIds }, user_id: user.id }, { limit: 1000 }) : [],
    boardIds.length ? db.findMany("boards", { id: { in: boardIds }, user_id: user.id }, { limit: 5000 }) : [],
    mediaIds.length ? db.findMany("media", { id: { in: mediaIds }, user_id: user.id }, { limit: 5000 }) : [],
  ]);
  return {
    accounts: new Map(accounts.map((a) => [a.id, a])),
    boards: new Map(boards.map((b) => [b.id, b])),
    media: new Map(media.map((m) => [m.id, m])),
  };
}

async function present(db, user, pins) {
  const maps = await buildMaps(db, user, pins);
  return pins.map((p) => publicPin(p, maps));
}

async function ownedPin(db, user, id) {
  return db.findOne("pins", { public_id: id, user_id: user.id, deleted_at: null });
}

/* ---------- Validação dos campos do pin ---------- */

function textFields(body, res) {
  const out = {};
  if (body.title !== undefined) {
    out.title = cleanText(body.title, config.PIN_TITLE_MAX + 1);
    if (out.title.length > config.PIN_TITLE_MAX) return fail(res, 422, "title_too_long", "O título pode ter até " + config.PIN_TITLE_MAX + " caracteres.", "title"), null;
  }
  if (body.description !== undefined) {
    out.description = cleanText(body.description, config.PIN_DESCRIPTION_MAX + 1);
    if (out.description.length > config.PIN_DESCRIPTION_MAX) return fail(res, 422, "description_too_long", "A descrição pode ter até " + config.PIN_DESCRIPTION_MAX + " caracteres.", "description"), null;
  }
  if (body.alt_text !== undefined) {
    out.alt_text = cleanText(body.alt_text, config.PIN_ALT_TEXT_MAX + 1);
    if (out.alt_text.length > config.PIN_ALT_TEXT_MAX) return fail(res, 422, "alt_too_long", "O texto alternativo pode ter até " + config.PIN_ALT_TEXT_MAX + " caracteres.", "alt_text"), null;
  }
  if (body.link !== undefined) {
    const link = cleanText(body.link, config.PIN_LINK_MAX + 1);
    if (link && !validLink(link)) return fail(res, 422, "invalid_link", "O link precisa começar com http:// ou https://.", "link"), null;
    out.link = link || null;
  }
  return out;
}

function parseSchedule(body, res) {
  if (body.publish_now === true) return new Date().toISOString();
  if (!isIsoDate(body.scheduled_at)) return fail(res, 422, "invalid_date", "Escolha a data e a hora da publicação.", "scheduled_at"), null;
  const when = new Date(body.scheduled_at).getTime();
  const now = Date.now();
  if (when < now - 10 * 60 * 1000) return fail(res, 422, "date_in_past", "A data escolhida já passou.", "scheduled_at"), null;
  if (when > now + config.SCHEDULE_MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000) {
    return fail(res, 422, "date_too_far", "Programe no máximo " + config.SCHEDULE_MAX_DAYS_AHEAD + " dias à frente.", "scheduled_at"), null;
  }
  return new Date(Math.max(when, now)).toISOString();
}

async function resolveMedia(db, user, body, res, required) {
  let media = null;
  let cover = null;
  if (body.media_id !== undefined || required) {
    media = body.media_id ? await db.findOne("media", { public_id: String(body.media_id), user_id: user.id, deleted_at: null }) : null;
    if (!media) return fail(res, 422, "media_required", "Escolha uma imagem ou um vídeo.", "media_id"), null;
  }
  if (body.cover_media_id) {
    cover = await db.findOne("media", { public_id: String(body.cover_media_id), user_id: user.id, deleted_at: null, kind: "image" });
    if (!cover) return fail(res, 422, "invalid_cover", "A capa precisa ser uma imagem da sua biblioteca.", "cover_media_id"), null;
  }
  return { media, cover };
}

/* ---------- Listar ---------- */

router.add("GET", "/pins", async ({ res, query, user, db }) => {
  const where = { user_id: user.id, deleted_at: null };
  if (query.status && STATUSES.includes(query.status)) where.status = query.status;
  if (query.account) {
    const a = await db.findOne("pinterest_accounts", { public_id: query.account, user_id: user.id });
    if (!a) return send(res, 200, { ok: true, pins: [], total: 0 });
    where.account_id = a.id;
  }
  if (isIsoDate(query.from) || isIsoDate(query.to)) {
    where.scheduled_at = {};
    if (isIsoDate(query.from)) where.scheduled_at.gte = new Date(query.from).toISOString();
    if (isIsoDate(query.to)) where.scheduled_at.lte = new Date(query.to).toISOString();
  }
  const limit = clampInt(query.limit, 1, 500, 100);
  const offset = clampInt(query.offset, 0, 100000, 0);
  const order = query.order === "asc" ? "asc" : "desc";
  const [rows, total] = await Promise.all([
    db.findMany("pins", where, { orderBy: [["scheduled_at", order], ["created_at", order]], limit, offset }),
    db.count("pins", where),
  ]);
  send(res, 200, { ok: true, pins: await present(db, user, rows), total });
}, { auth: true });

/* ---------- Criar (uma ou várias contas de uma vez) ---------- */

router.add("POST", "/pins", async ({ req, res, body, user, db }) => {
  const targets = Array.isArray(body.targets) ? body.targets : [];
  if (!targets.length) return fail(res, 422, "targets_required", "Escolha pelo menos uma conta e uma pasta.", "targets");
  if (targets.length > config.MAX_PINS_PER_CREATE) return fail(res, 422, "too_many_targets", "No máximo " + config.MAX_PINS_PER_CREATE + " contas por vez.", "targets");

  const text = textFields(body, res);
  if (!text) return;
  const scheduledAt = parseSchedule(body, res);
  if (!scheduledAt) return;
  const resolved = await resolveMedia(db, user, body, res, true);
  if (!resolved) return;
  const { media, cover } = resolved;
  if (media.kind === "video" && !cover) return fail(res, 422, "cover_required", "Pins de vídeo precisam de uma imagem de capa.", "cover_media_id");

  // Confere cada destino (conta + pasta) antes de criar qualquer pin.
  const checked = [];
  for (const t of targets) {
    const account = await db.findOne("pinterest_accounts", { public_id: String(t.account || ""), user_id: user.id, deleted_at: null });
    if (!account) return fail(res, 422, "invalid_account", "Uma das contas escolhidas não existe mais.", "targets");
    if (account.status !== "active") return fail(res, 409, "needs_reconnect", "A conta @" + (account.username || "") + " precisa ser reconectada antes de programar pins.", "targets");
    const board = await db.findOne("boards", { id: String(t.board || ""), account_id: account.id });
    if (!board) return fail(res, 422, "invalid_board", "Escolha uma pasta para a conta @" + (account.username || "") + ".", "targets");
    checked.push({ account, board });
  }

  const now = new Date().toISOString();
  const created = [];
  for (const { account, board } of checked) {
    const pin = await db.insert("pins", {
      id: randomId(),
      public_id: publicId(),
      user_id: user.id,
      account_id: account.id,
      board_id: board.id,
      media_id: media.id,
      cover_media_id: cover ? cover.id : null,
      title: text.title || null,
      description: text.description || null,
      link: text.link || null,
      alt_text: text.alt_text || null,
      scheduled_at: scheduledAt,
      status: "scheduled",
      attempts: 0,
      next_attempt_at: scheduledAt,
      pinterest_pin_id: null,
      pinterest_url: null,
      pinterest_media_id: null,
      error_code: null,
      error_message: null,
      publish_started_at: null,
      published_at: null,
      canceled_at: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });
    created.push(pin);
    await activity.log(db, {
      user_id: user.id,
      account_id: account.id,
      pin_id: pin.id,
      kind: "pin_scheduled",
      message: "Pin \"" + (pin.title || "sem título") + "\" programado para " + board.name + " (@" + (account.username || "") + ").",
    });
  }
  send(res, 201, { ok: true, pins: await present(db, user, created) });
}, { auth: true });

/* ---------- Detalhe ---------- */

router.add("GET", "/pins/:id", async ({ res, params, user, db }) => {
  const pin = await ownedPin(db, user, params.id);
  if (!pin) return fail(res, 404, "not_found", "Pin não encontrado.");
  const [presented, events] = await Promise.all([
    present(db, user, [pin]),
    db.findMany("activity", { pin_id: pin.id, user_id: user.id }, { orderBy: [["created_at", "desc"]], limit: 50 }),
  ]);
  send(res, 200, { ok: true, pin: presented[0], events: events.map((e) => ({ id: e.id, kind: e.kind, message: e.message, created_at: e.created_at })) });
}, { auth: true });

/* ---------- Editar ---------- */

router.add("PATCH", "/pins/:id", async ({ res, params, body, user, db }) => {
  const pin = await ownedPin(db, user, params.id);
  if (!pin) return fail(res, 404, "not_found", "Pin não encontrado.");
  if (pin.status === "publishing") return fail(res, 409, "publishing", "Este pin está sendo publicado agora. Aguarde.");

  const text = textFields(body, res);
  if (!text) return;
  const fields = Object.assign({}, text, { updated_at: new Date().toISOString() });

  // Pasta (e conta) podem mudar em qualquer estado; mídia e data só antes de publicar.
  let account = await db.findOne("pinterest_accounts", { id: pin.account_id, user_id: user.id });
  if (body.account !== undefined && pin.status !== "published") {
    const a = await db.findOne("pinterest_accounts", { public_id: String(body.account), user_id: user.id, deleted_at: null });
    if (!a) return fail(res, 422, "invalid_account", "Conta não encontrada.", "account");
    fields.account_id = a.id;
    account = a;
  }
  let board = null;
  if (body.board !== undefined) {
    board = await db.findOne("boards", { id: String(body.board), account_id: fields.account_id || pin.account_id });
    if (!board) return fail(res, 422, "invalid_board", "Escolha uma pasta válida para a conta.", "board");
    fields.board_id = board.id;
  } else if (fields.account_id && fields.account_id !== pin.account_id) {
    return fail(res, 422, "board_required", "Ao trocar a conta, escolha também a pasta.", "board");
  }

  if (pin.status === "published") {
    // Já está na Pinterest: atualiza lá também (título, descrição, link, texto alternativo, pasta).
    if (!account || account.status !== "active") return fail(res, 409, "needs_reconnect", "A conta precisa ser reconectada para editar este pin na Pinterest.");
    const remote = {};
    if (text.title !== undefined) remote.title = text.title;
    if (text.description !== undefined) remote.description = text.description;
    if (text.link !== undefined) remote.link = text.link || "";
    if (text.alt_text !== undefined) remote.alt_text = text.alt_text;
    if (board) remote.board_id = board.pinterest_board_id;
    if (Object.keys(remote).length && pin.pinterest_pin_id) {
      try {
        await pinterest.withAccount(db, account, (token) => pinterest.api.updatePin(token, pin.pinterest_pin_id, remote));
      } catch (e) {
        const info = pinterest.describeError(e);
        return fail(res, 502, info.code, "Não foi possível atualizar na Pinterest: " + info.message);
      }
    }
  } else {
    if (body.media_id !== undefined || body.cover_media_id !== undefined) {
      const resolved = await resolveMedia(db, user, body, res, body.media_id !== undefined);
      if (!resolved) return;
      if (resolved.media) fields.media_id = resolved.media.id;
      if (body.cover_media_id !== undefined) fields.cover_media_id = resolved.cover ? resolved.cover.id : null;
      const finalMedia = resolved.media || (await db.findOne("media", { id: pin.media_id }));
      const finalCover = body.cover_media_id !== undefined ? resolved.cover : pin.cover_media_id;
      if (finalMedia && finalMedia.kind === "video" && !finalCover) return fail(res, 422, "cover_required", "Pins de vídeo precisam de uma imagem de capa.", "cover_media_id");
      if (resolved.media && resolved.media.id !== pin.media_id) fields.pinterest_media_id = null;
    }
    if (body.scheduled_at !== undefined || body.publish_now === true) {
      const when = parseSchedule(body, res);
      if (!when) return;
      fields.scheduled_at = when;
      fields.next_attempt_at = when;
      if (pin.status !== "scheduled") {
        fields.status = "scheduled";
        fields.attempts = 0;
        fields.error_code = null;
        fields.error_message = null;
        fields.canceled_at = null;
      }
    }
  }

  const updated = await db.updateOne("pins", { id: pin.id }, fields);
  await activity.log(db, { user_id: user.id, account_id: updated.account_id, pin_id: pin.id, kind: "pin_updated", message: "Pin \"" + (updated.title || "sem título") + "\" editado." + (pin.status === "published" ? " Alterações enviadas à Pinterest." : "") });
  send(res, 200, { ok: true, pin: (await present(db, user, [updated]))[0] });
}, { auth: true });

/* ---------- Ações ---------- */

router.add("POST", "/pins/:id/cancel", async ({ res, params, user, db }) => {
  const pin = await ownedPin(db, user, params.id);
  if (!pin) return fail(res, 404, "not_found", "Pin não encontrado.");
  if (pin.status !== "scheduled") return fail(res, 409, "not_scheduled", "Só pins programados podem ser cancelados.");
  const now = new Date().toISOString();
  const updated = await db.updateOne("pins", { id: pin.id }, { status: "canceled", canceled_at: now, next_attempt_at: null, updated_at: now });
  await activity.log(db, { user_id: user.id, account_id: pin.account_id, pin_id: pin.id, kind: "pin_canceled", message: "Pin \"" + (pin.title || "sem título") + "\" cancelado." });
  send(res, 200, { ok: true, pin: (await present(db, user, [updated]))[0] });
}, { auth: true });

router.add("POST", "/pins/:id/retry", async ({ res, params, user, db }) => {
  const pin = await ownedPin(db, user, params.id);
  if (!pin) return fail(res, 404, "not_found", "Pin não encontrado.");
  if (!["failed", "canceled"].includes(pin.status)) return fail(res, 409, "not_retryable", "Este pin não está com falha nem cancelado.");
  const now = new Date().toISOString();
  const updated = await db.updateOne("pins", { id: pin.id }, { status: "scheduled", scheduled_at: now, next_attempt_at: now, attempts: 0, error_code: null, error_message: null, canceled_at: null, updated_at: now });
  await activity.log(db, { user_id: user.id, account_id: pin.account_id, pin_id: pin.id, kind: "pin_retry", message: "Pin \"" + (pin.title || "sem título") + "\" colocado de volta na fila." });
  send(res, 200, { ok: true, pin: (await present(db, user, [updated]))[0] });
}, { auth: true });

router.add("POST", "/pins/:id/publish-now", async ({ res, params, user, db }) => {
  const pin = await ownedPin(db, user, params.id);
  if (!pin) return fail(res, 404, "not_found", "Pin não encontrado.");
  if (!["scheduled", "failed", "canceled"].includes(pin.status)) return fail(res, 409, "not_allowed", "Este pin não pode ser publicado agora.");
  const now = new Date().toISOString();
  const updated = await db.updateOne("pins", { id: pin.id }, { status: "scheduled", scheduled_at: now, next_attempt_at: now, attempts: 0, error_code: null, error_message: null, canceled_at: null, updated_at: now });
  send(res, 200, { ok: true, pin: (await present(db, user, [updated]))[0] });
}, { auth: true });

router.add("POST", "/pins/:id/duplicate", async ({ res, params, body, user, db }) => {
  const pin = await ownedPin(db, user, params.id);
  if (!pin) return fail(res, 404, "not_found", "Pin não encontrado.");
  const when = body.scheduled_at !== undefined || body.publish_now ? parseSchedule(body, res) : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  if (!when) return;
  const now = new Date().toISOString();
  const copy = await db.insert("pins", {
    id: randomId(),
    public_id: publicId(),
    user_id: user.id,
    account_id: pin.account_id,
    board_id: pin.board_id,
    media_id: pin.media_id,
    cover_media_id: pin.cover_media_id,
    title: pin.title,
    description: pin.description,
    link: pin.link,
    alt_text: pin.alt_text,
    scheduled_at: when,
    status: "scheduled",
    attempts: 0,
    next_attempt_at: when,
    pinterest_pin_id: null,
    pinterest_url: null,
    pinterest_media_id: null,
    error_code: null,
    error_message: null,
    publish_started_at: null,
    published_at: null,
    canceled_at: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });
  await activity.log(db, { user_id: user.id, account_id: pin.account_id, pin_id: copy.id, kind: "pin_scheduled", message: "Pin \"" + (copy.title || "sem título") + "\" duplicado e programado." });
  send(res, 201, { ok: true, pin: (await present(db, user, [copy]))[0] });
}, { auth: true });

router.add("DELETE", "/pins/:id", async ({ res, params, query, user, db }) => {
  const pin = await ownedPin(db, user, params.id);
  if (!pin) return fail(res, 404, "not_found", "Pin não encontrado.");
  if (pin.status === "publishing") return fail(res, 409, "publishing", "Este pin está sendo publicado agora. Aguarde.");
  let removedRemote = false;
  if (pin.status === "published" && pin.pinterest_pin_id && query.pinterest === "1") {
    const account = await db.findOne("pinterest_accounts", { id: pin.account_id, user_id: user.id, deleted_at: null });
    if (!account || account.status !== "active") return fail(res, 409, "needs_reconnect", "A conta precisa estar conectada para apagar o pin na Pinterest.");
    try {
      await pinterest.withAccount(db, account, (token) => pinterest.api.deletePin(token, pin.pinterest_pin_id));
      removedRemote = true;
    } catch (e) {
      const info = pinterest.describeError(e);
      if (info.code !== "not_found") return fail(res, 502, info.code, "Não foi possível apagar na Pinterest: " + info.message);
      removedRemote = true;
    }
  }
  const now = new Date().toISOString();
  await db.update("pins", { id: pin.id }, { deleted_at: now, updated_at: now, next_attempt_at: null, status: pin.status === "scheduled" ? "canceled" : pin.status });
  await activity.log(db, { user_id: user.id, account_id: pin.account_id, pin_id: pin.id, kind: "pin_deleted", message: "Pin \"" + (pin.title || "sem título") + "\" apagado" + (removedRemote ? " (também na Pinterest)." : ".") });
  send(res, 200, { ok: true, removed_on_pinterest: removedRemote });
}, { auth: true });

module.exports = { publicPin, present, STATUSES };
