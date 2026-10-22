"use strict";

/**
 * Fila de publicação. Publica na Pinterest os pins cuja hora chegou.
 *
 * Quem chama: POST /api/worker/run (navegador de quem está com a plataforma aberta, ou um
 * agendador externo) e o cron diário da Vercel. Pode ser chamado por qualquer um e a qualquer
 * momento: só publica o que já venceu, e cada pin é "reivindicado" de forma atômica, então duas
 * execuções ao mesmo tempo não publicam o mesmo pin duas vezes.
 */

const config = require("./config");
const pinterest = require("./pinterest");
const storage = require("./storage");
const activity = require("./activity");
const mailer = require("./mailer");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pinUrl(id) {
  return "https://www.pinterest.com/pin/" + id + "/";
}

async function publishedToday(db, account, nowMs) {
  const since = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();
  return db.count("pins", { account_id: account.id, status: "published", published_at: { gte: since } });
}

async function lastPublishedAt(db, account) {
  const rows = await db.findMany("pins", { account_id: account.id, status: "published", published_at: { notNull: true } }, { orderBy: [["published_at", "desc"]], limit: 1 });
  return rows[0] ? new Date(rows[0].published_at).getTime() : 0;
}

async function postpone(db, pin, untilIso, reason) {
  await db.update("pins", { id: pin.id }, { status: "scheduled", next_attempt_at: untilIso, publish_started_at: null, updated_at: new Date().toISOString(), error_code: null, error_message: reason || null });
}

async function failPin(db, pin, user, info, nowMs) {
  const attempts = (pin.attempts || 0) + 1;
  const now = new Date(nowMs).toISOString();
  const canRetry = info.retryable && attempts < config.PUBLISH_MAX_ATTEMPTS;
  const delay = config.PUBLISH_RETRY_DELAYS_MS[Math.min(attempts - 1, config.PUBLISH_RETRY_DELAYS_MS.length - 1)];
  await db.update("pins", { id: pin.id }, {
    status: canRetry ? "scheduled" : "failed",
    attempts,
    next_attempt_at: canRetry ? new Date(nowMs + delay).toISOString() : null,
    publish_started_at: null,
    error_code: info.code,
    error_message: info.message,
    updated_at: now,
  });
  await activity.log(db, {
    user_id: pin.user_id,
    account_id: pin.account_id,
    pin_id: pin.id,
    kind: canRetry ? "pin_retry" : "pin_failed",
    message: canRetry
      ? "Falha ao publicar \"" + (pin.title || "pin") + "\" (tentativa " + attempts + "). Nova tentativa em " + Math.round(delay / 60000) + " min. Motivo: " + info.message
      : "Não foi possível publicar \"" + (pin.title || "pin") + "\": " + info.message,
    data: { code: info.code, attempts },
  });
  if (!canRetry && user && user.notify_failures !== false && mailer.isConfigured()) {
    mailer
      .send({
        to: user.email,
        subject: "Um pin não foi publicado",
        title: "Um pin não foi publicado",
        lines: ["O pin \"" + (pin.title || "sem título") + "\" não pôde ser publicado.", "Motivo: " + info.message, "Abra a plataforma para corrigir e tentar de novo."],
      })
      .catch((e) => console.error("[worker] e-mail de falha:", e.message));
  }
}

async function ensureVideoMedia(db, pin, media, token, baseUrl) {
  let mediaId = pin.pinterest_media_id;
  if (!mediaId) {
    const reg = await pinterest.api.registerMedia(token);
    mediaId = reg.media_id;
    const bytes = await storage.fetchBytes(media.url, baseUrl);
    await pinterest.api.uploadMedia(reg.upload_url, reg.upload_parameters, bytes, media.filename || "video.mp4", media.content_type || "video/mp4");
    await db.update("pins", { id: pin.id }, { pinterest_media_id: mediaId, updated_at: new Date().toISOString() });
  }
  const started = Date.now();
  while (true) {
    const info = await pinterest.api.getMedia(token, mediaId);
    if (info.status === "succeeded") return mediaId;
    if (info.status === "failed") {
      await db.update("pins", { id: pin.id }, { pinterest_media_id: null });
      throw new pinterest.PinterestError(400, "A Pinterest não conseguiu processar o vídeo. Confira o formato (MP4/MOV, H.264) e tente de novo.");
    }
    if (Date.now() - started > config.MEDIA_POLL_MAX_MS) {
      // Ainda processando: tenta de novo mais tarde sem reenviar o arquivo
      throw new pinterest.PinterestError(503, "O vídeo ainda está sendo processado pela Pinterest.");
    }
    await sleep(config.MEDIA_POLL_INTERVAL_MS);
  }
}

async function publishOne(db, pin, ctx) {
  const nowMs = ctx.nowMs;
  const account = await db.findOne("pinterest_accounts", { id: pin.account_id, deleted_at: null });
  const user = await db.findOne("users", { id: pin.user_id });
  if (!account) return failPin(db, pin, user, { code: "account_missing", message: "A conta da Pinterest foi desconectada.", retryable: false }, nowMs);
  if (!user || user.status !== "active") return failPin(db, pin, user, { code: "user_inactive", message: "A conta na plataforma está indisponível.", retryable: false }, nowMs);
  if (account.status !== "active") {
    return failPin(db, pin, user, { code: "account_needs_reconnect", message: "A conta da Pinterest precisa ser reconectada.", retryable: false }, nowMs);
  }

  // Proteção contra spam: limite diário por conta e intervalo mínimo entre pins
  const limit = account.daily_limit || config.ACCOUNT_DAILY_LIMIT_DEFAULT;
  if ((await publishedToday(db, account, nowMs)) >= limit) {
    await postpone(db, pin, new Date(nowMs + 60 * 60 * 1000).toISOString(), "Limite diário da conta atingido (" + limit + " pins). Adiado automaticamente.");
    return "postponed";
  }
  const last = await lastPublishedAt(db, account);
  const gapMs = config.MIN_SECONDS_BETWEEN_PINS_SAME_ACCOUNT * 1000;
  if (last && nowMs - last < gapMs) {
    await postpone(db, pin, new Date(last + gapMs).toISOString(), null);
    return "postponed";
  }

  const media = pin.media_id ? await db.findOne("media", { id: pin.media_id, deleted_at: null }) : null;
  if (!media) return failPin(db, pin, user, { code: "media_missing", message: "A imagem ou o vídeo do pin não existe mais.", retryable: false }, nowMs);
  const board = pin.board_id ? await db.findOne("boards", { id: pin.board_id }) : null;
  if (!board) return failPin(db, pin, user, { code: "board_missing", message: "A pasta escolhida não existe mais. Edite o pin e escolha outra.", retryable: false }, nowMs);
  let cover = null;
  if (media.kind === "video") {
    cover = pin.cover_media_id ? await db.findOne("media", { id: pin.cover_media_id, deleted_at: null }) : null;
    if (!cover) return failPin(db, pin, user, { code: "cover_missing", message: "Pins de vídeo precisam de uma imagem de capa. Edite o pin e adicione uma.", retryable: false }, nowMs);
  }

  try {
    const result = await pinterest.withAccount(db, account, async (token) => {
      const body = {
        board_id: board.pinterest_board_id,
        title: pin.title || undefined,
        description: pin.description || undefined,
        link: pin.link || undefined,
        alt_text: pin.alt_text || undefined,
      };
      if (media.kind === "video") {
        const mediaId = await ensureVideoMedia(db, pin, media, token, ctx.baseUrl);
        body.media_source = { source_type: "video_id", media_id: mediaId, cover_image_url: storage.publicUrl(cover.url, ctx.baseUrl) };
      } else {
        body.media_source = { source_type: "image_url", url: storage.publicUrl(media.url, ctx.baseUrl) };
      }
      return pinterest.api.createPin(token, body);
    });
    const now = new Date().toISOString();
    await db.update("pins", { id: pin.id }, {
      status: "published",
      published_at: now,
      pinterest_pin_id: result.id,
      pinterest_url: pinUrl(result.id),
      error_code: null,
      error_message: null,
      publish_started_at: null,
      attempts: (pin.attempts || 0) + 1,
      updated_at: now,
    });
    await activity.log(db, {
      user_id: pin.user_id,
      account_id: pin.account_id,
      pin_id: pin.id,
      kind: "pin_published",
      message: "Pin \"" + (pin.title || "sem título") + "\" publicado em " + (board.name || "pasta") + " (@" + (account.username || "conta") + ").",
      data: { pinterest_pin_id: result.id },
    });
    return "published";
  } catch (e) {
    const info = pinterest.describeError(e);
    if (!(e instanceof pinterest.PinterestError)) console.error("[worker] erro inesperado no pin", pin.id, e);
    await failPin(db, pin, user, info, nowMs);
    return "failed";
  }
}

/**
 * Processa a fila. Devolve um resumo. baseUrl é o endereço público do site (para a Pinterest
 * buscar as imagens).
 */
async function runWorker(db, opts) {
  const o = opts || {};
  const nowMs = o.nowMs || Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const summary = { released: 0, claimed: 0, published: 0, failed: 0, postponed: 0 };

  summary.released = await db.releaseStalePins(new Date(nowMs - config.WORKER_STALE_PUBLISHING_MS).toISOString(), nowIso);
  const due = await db.claimDuePins(nowIso, o.limit || config.WORKER_BATCH);
  summary.claimed = due.length;

  if (!pinterest.isConfigured() && due.length) {
    for (const pin of due) await postpone(db, pin, new Date(nowMs + 30 * 60 * 1000).toISOString(), "A conexão com a Pinterest ainda não está configurada.");
    summary.postponed = due.length;
    return summary;
  }

  // Um pin por vez por conta (respeita o intervalo mínimo); contas diferentes em sequência também.
  for (const pin of due) {
    const r = await publishOne(db, pin, { nowMs: Date.now(), baseUrl: o.baseUrl });
    if (r === "published") summary.published++;
    else if (r === "postponed") summary.postponed++;
    else summary.failed++;
  }
  return summary;
}

/**
 * Manutenção diária: renova tokens perto de vencer, avisa contas que precisam reconectar,
 * limpa tentativas antigas.
 */
async function runMaintenance(db) {
  const now = Date.now();
  const out = { refreshed: 0, needs_reconnect: 0, warned: 0, cleaned: 0 };
  out.cleaned = await db.cleanupAttempts(new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString());
  if (!pinterest.isConfigured()) return out;

  const accounts = await db.findMany("pinterest_accounts", { deleted_at: null, status: "active" }, { limit: 500 });
  for (const acc of accounts) {
    const tokenExp = acc.token_expires_at ? new Date(acc.token_expires_at).getTime() : 0;
    const refreshExp = acc.refresh_expires_at ? new Date(acc.refresh_expires_at).getTime() : 0;
    // Renova quando o token de acesso está perto de vencer OU o de renovação vence em menos de 14 dias
    if (tokenExp - now < config.TOKEN_REFRESH_BEFORE_MS || (refreshExp && refreshExp - now < 14 * 24 * 60 * 60 * 1000)) {
      try {
        await pinterest.refreshAccount(db, acc);
        out.refreshed++;
      } catch (e) {
        await pinterest.markNeedsReconnect(db, acc, pinterest.describeError(e).message);
        out.needs_reconnect++;
        const user = await db.findOne("users", { id: acc.user_id });
        await activity.log(db, {
          user_id: acc.user_id,
          account_id: acc.id,
          kind: "account_needs_reconnect",
          message: "A conta @" + (acc.username || "") + " precisa ser reconectada: " + pinterest.describeError(e).message,
        });
        if (user && user.notify_token_expiry !== false && mailer.isConfigured()) {
          mailer
            .send({
              to: user.email,
              subject: "Reconecte sua conta da Pinterest",
              title: "Uma conta precisa ser reconectada",
              lines: ["A conta @" + (acc.username || "") + " perdeu a autorização na Pinterest.", "Entre na plataforma e clique em Reconectar para voltar a publicar."],
            })
            .then(() => out.warned++)
            .catch((e2) => console.error("[worker] e-mail de reconexão:", e2.message));
        }
      }
    }
  }
  return out;
}

module.exports = { runWorker, runMaintenance, publishOne };
