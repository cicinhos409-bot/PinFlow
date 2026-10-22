"use strict";

/**
 * Análises: métricas da Pinterest por pin e por conta, com cache no banco.
 *
 * Por que cache: a Pinterest limita chamadas (Trial: 1.000/dia por app, para todos os usuários
 * juntos). Então cada pin tem suas métricas guardadas por período (7/14/30/90 dias) e só são
 * buscadas de novo quando envelhecem (ANALYTICS_CACHE_MS) ou quando a pessoa pede para atualizar,
 * sempre com um orçamento de chamadas por carregamento.
 *
 * Privacidade: tudo é consultado por user_id. Cada pessoa só vê os pins publicados por ela.
 */

const config = require("./config");
const pinterest = require("./pinterest");
const { randomId } = require("./crypto");

const STANDARD_METRICS = ["IMPRESSION", "SAVE", "PIN_CLICK", "OUTBOUND_CLICK", "TOTAL_COMMENTS", "TOTAL_REACTIONS"];
const VIDEO_METRICS = STANDARD_METRICS.concat(["VIDEO_MRC_VIEW", "VIDEO_10S_VIEW", "QUARTILE_95_PERCENT_VIEW", "VIDEO_V50_WATCH_TIME", "VIDEO_START", "VIDEO_AVG_WATCH_TIME"]);
const ACCOUNT_METRICS = ["IMPRESSION", "ENGAGEMENT", "SAVE", "PIN_CLICK", "OUTBOUND_CLICK"];

function isoDay(d) {
  return d.toISOString().slice(0, 10);
}

// Janela do período: termina ontem (os dados de hoje ainda estão sendo processados).
function dateRange(days) {
  const end = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return { start: isoDay(start), end: isoDay(end) };
}

function validPeriod(days) {
  const n = Number(days);
  return config.ANALYTICS_PERIODS.includes(n) ? n : 30;
}

function isFresh(row, nowMs) {
  return row && row.fetched_at && nowMs - new Date(row.fetched_at).getTime() < config.ANALYTICS_CACHE_MS && !row.error;
}

// A resposta da Pinterest vem como { "all": { daily_metrics, summary_metrics, lifetime_metrics } }.
function unwrap(data) {
  if (!data || typeof data !== "object") return {};
  if (data.all) return data.all;
  const first = Object.keys(data)[0];
  return first && typeof data[first] === "object" && (data[first].summary_metrics || data[first].daily_metrics) ? data[first] : data;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* ---------- Buscar e guardar ---------- */

async function fetchPinMetrics(db, pin, media, account, period) {
  const range = dateRange(period);
  const metricTypes = media && media.kind === "video" ? VIDEO_METRICS : STANDARD_METRICS;
  const now = new Date().toISOString();
  let fields;
  try {
    const raw = await pinterest.withAccount(db, account, (token) => pinterest.api.pinAnalytics(token, pin.pinterest_pin_id, { start: range.start, end: range.end, metricTypes }));
    const data = unwrap(raw);
    const daily = (data.daily_metrics || []).map((d) => ({ date: d.date, status: d.data_status, metrics: d.metrics || {} }));
    fields = {
      start_date: range.start,
      end_date: range.end,
      summary: data.summary_metrics || {},
      daily,
      lifetime: data.lifetime_metrics || {},
      data_status: daily.length && daily.every((d) => d.status === "READY") ? "READY" : daily.some((d) => d.status === "PROCESSING") ? "PROCESSING" : daily[0] ? daily[0].status : null,
      error: null,
      fetched_at: now,
    };
  } catch (e) {
    const info = pinterest.describeError(e);
    fields = { start_date: range.start, end_date: range.end, error: info.message, fetched_at: now };
    if (info.code === "rate_limited") {
      const err = new Error(info.message);
      err.code = "RATE_LIMITED";
      err.fields = fields;
      throw err;
    }
  }
  const existing = await db.findOne("pin_metrics", { pin_id: pin.id, period });
  if (existing) return db.updateOne("pin_metrics", { id: existing.id }, fields);
  return db.insert("pin_metrics", Object.assign({ id: randomId(), user_id: pin.user_id, account_id: pin.account_id, pin_id: pin.id, period, summary: null, daily: null, lifetime: null, data_status: null }, fields));
}

async function fetchAccountMetrics(db, account, period) {
  const range = dateRange(period);
  const now = new Date().toISOString();
  let fields;
  try {
    const raw = await pinterest.withAccount(db, account, (token) => pinterest.api.accountAnalytics(token, { start: range.start, end: range.end, metricTypes: ACCOUNT_METRICS }));
    const data = unwrap(raw);
    fields = {
      start_date: range.start,
      end_date: range.end,
      summary: data.summary_metrics || {},
      daily: (data.daily_metrics || []).map((d) => ({ date: d.date, status: d.data_status, metrics: d.metrics || {} })),
      error: null,
      fetched_at: now,
    };
  } catch (e) {
    const info = pinterest.describeError(e);
    fields = { start_date: range.start, end_date: range.end, error: info.message, fetched_at: now };
    if (info.code === "rate_limited") {
      const err = new Error(info.message);
      err.code = "RATE_LIMITED";
      throw err;
    }
  }
  const existing = await db.findOne("account_metrics", { account_id: account.id, period });
  if (existing) return db.updateOne("account_metrics", { id: existing.id }, fields);
  return db.insert("account_metrics", Object.assign({ id: randomId(), user_id: account.user_id, account_id: account.id, period, summary: null, daily: null }, fields));
}

/* ---------- Visão geral do usuário ---------- */

function pinRow(pin, metricsRow, maps) {
  const account = maps.accounts.get(pin.account_id);
  const media = pin.media_id ? maps.media.get(pin.media_id) : null;
  const board = pin.board_id ? maps.boards.get(pin.board_id) : null;
  const s = (metricsRow && metricsRow.summary) || {};
  const lifetime = (metricsRow && metricsRow.lifetime) || {};
  const isVideo = media && media.kind === "video";
  return {
    id: pin.public_id,
    title: pin.title || "",
    published_at: pin.published_at,
    pinterest_url: pin.pinterest_url,
    kind: isVideo ? "video" : "image",
    account: account ? { id: account.public_id, username: account.username || "" } : null,
    board: board ? { name: board.name } : null,
    media: media ? { url: media.url, kind: media.kind } : null,
    metrics: {
      impressions: num(s.IMPRESSION),
      saves: num(s.SAVE),
      pin_clicks: num(s.PIN_CLICK),
      outbound_clicks: num(s.OUTBOUND_CLICK),
      comments: num(lifetime.TOTAL_COMMENTS !== undefined ? lifetime.TOTAL_COMMENTS : s.TOTAL_COMMENTS),
      reactions: num(lifetime.TOTAL_REACTIONS !== undefined ? lifetime.TOTAL_REACTIONS : s.TOTAL_REACTIONS),
      video_views: isVideo ? num(s.VIDEO_MRC_VIEW) : null,
      video_starts: isVideo ? num(s.VIDEO_START) : null,
      video_10s: isVideo ? num(s.VIDEO_10S_VIEW) : null,
      video_95: isVideo ? num(s.QUARTILE_95_PERCENT_VIEW) : null,
      video_total_ms: isVideo ? num(s.VIDEO_V50_WATCH_TIME) : null,
      video_avg_ms: isVideo ? num(s.VIDEO_AVG_WATCH_TIME) : null,
    },
    engagement: num(s.SAVE) + num(s.PIN_CLICK) + num(s.OUTBOUND_CLICK),
    data_status: metricsRow ? metricsRow.data_status : null,
    fetched_at: metricsRow ? metricsRow.fetched_at : null,
    error: metricsRow ? metricsRow.error : null,
    pending: !metricsRow,
  };
}

/**
 * Monta a visão geral: pins publicados do usuário com métricas (do cache; busca na Pinterest
 * o que estiver faltando ou velho, dentro do orçamento).
 * opts: { period, accountId (interno) | null, refresh: bool, budget }
 */
async function overview(db, user, opts) {
  const period = validPeriod(opts.period);
  const nowMs = Date.now();
  const budget = opts.budget === undefined ? config.ANALYTICS_REFRESH_BUDGET : opts.budget;

  const where = { user_id: user.id, status: "published", deleted_at: null, pinterest_pin_id: { notNull: true } };
  if (opts.accountId) where.account_id = opts.accountId;
  const pins = await db.findMany("pins", where, { orderBy: [["published_at", "desc"]], limit: 1000 });

  const accountIds = [...new Set(pins.map((p) => p.account_id))];
  const accounts = await db.findMany("pinterest_accounts", { user_id: user.id, deleted_at: null }, { limit: 100 });
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const mediaIds = [...new Set(pins.map((p) => p.media_id).filter(Boolean))];
  const boardIds = [...new Set(pins.map((p) => p.board_id).filter(Boolean))];
  const [media, boards] = await Promise.all([
    mediaIds.length ? db.findMany("media", { id: { in: mediaIds }, user_id: user.id }, { limit: 5000 }) : [],
    boardIds.length ? db.findMany("boards", { id: { in: boardIds }, user_id: user.id }, { limit: 5000 }) : [],
  ]);
  const maps = { accounts: accountById, media: new Map(media.map((m) => [m.id, m])), boards: new Map(boards.map((b) => [b.id, b])) };

  const cached = pins.length ? await db.findMany("pin_metrics", { user_id: user.id, period, pin_id: { in: pins.map((p) => p.id) } }, { limit: 5000 }) : [];
  const byPin = new Map(cached.map((m) => [m.pin_id, m]));

  // Atualiza o que falta ou envelheceu, dos mais recentes para os mais antigos, até o orçamento.
  let used = 0;
  let rateLimited = false;
  const canFetch = pinterest.isConfigured();
  for (const pin of pins) {
    if (!canFetch || used >= budget || rateLimited) break;
    const row = byPin.get(pin.id);
    const account = accountById.get(pin.account_id);
    if (!account || account.status !== "active") continue;
    if (!opts.refresh && isFresh(row, nowMs)) continue;
    if (opts.refresh && row && nowMs - new Date(row.fetched_at).getTime() < 60 * 1000) continue; // acabou de buscar
    try {
      const updated = await fetchPinMetrics(db, pin, pin.media_id ? maps.media.get(pin.media_id) : null, account, period);
      byPin.set(pin.id, updated);
    } catch (e) {
      if (e.code === "RATE_LIMITED") rateLimited = true;
      else console.error("[analytics] pin", pin.id, e.message);
    }
    used++;
  }

  // Métricas da conta (totais do perfil na Pinterest, incluindo pins feitos fora da plataforma)
  const accountRows = [];
  const targetAccounts = opts.accountId ? accounts.filter((a) => a.id === opts.accountId) : accounts;
  const cachedAccounts = targetAccounts.length ? await db.findMany("account_metrics", { user_id: user.id, period, account_id: { in: targetAccounts.map((a) => a.id) } }, { limit: 200 }) : [];
  const accMetricsById = new Map(cachedAccounts.map((m) => [m.account_id, m]));
  for (const a of targetAccounts) {
    let row = accMetricsById.get(a.id);
    if (canFetch && !rateLimited && used < budget && a.status === "active" && (opts.refresh ? !row || nowMs - new Date(row.fetched_at).getTime() >= 60 * 1000 : !isFresh(row, nowMs))) {
      try {
        row = await fetchAccountMetrics(db, a, period);
      } catch (e) {
        if (e.code === "RATE_LIMITED") rateLimited = true;
      }
      used++;
    }
    const s = (row && row.summary) || {};
    accountRows.push({
      id: a.public_id,
      username: a.username || "",
      label: a.label || "",
      status: a.status,
      is_business: String(a.account_type || "").toUpperCase() === "BUSINESS",
      pins_published: pins.filter((p) => p.account_id === a.id).length,
      metrics: row && !row.error ? { impressions: num(s.IMPRESSION), engagement: num(s.ENGAGEMENT), saves: num(s.SAVE), pin_clicks: num(s.PIN_CLICK), outbound_clicks: num(s.OUTBOUND_CLICK) } : null,
      daily: row && !row.error ? row.daily || [] : [],
      fetched_at: row ? row.fetched_at : null,
      error: row ? row.error : null,
    });
  }

  const rows = pins.map((p) => pinRow(p, byPin.get(p.id), maps));

  // Totais e série diária somando os pins da plataforma
  const totals = { impressions: 0, saves: 0, pin_clicks: 0, outbound_clicks: 0, engagement: 0, video_views: 0, video_pins: 0, image_pins: 0, comments: 0, reactions: 0 };
  const dailyMap = new Map();
  for (const r of rows) {
    totals.impressions += r.metrics.impressions;
    totals.saves += r.metrics.saves;
    totals.pin_clicks += r.metrics.pin_clicks;
    totals.outbound_clicks += r.metrics.outbound_clicks;
    totals.engagement += r.engagement;
    totals.comments += r.metrics.comments;
    totals.reactions += r.metrics.reactions;
    if (r.kind === "video") {
      totals.video_pins++;
      totals.video_views += r.metrics.video_views || 0;
    } else totals.image_pins++;
  }
  for (const p of pins) {
    const m = byPin.get(p.id);
    if (!m || !Array.isArray(m.daily)) continue;
    for (const d of m.daily) {
      const cur = dailyMap.get(d.date) || { date: d.date, impressions: 0, engagement: 0, saves: 0, video_views: 0 };
      const mm = d.metrics || {};
      cur.impressions += num(mm.IMPRESSION);
      cur.saves += num(mm.SAVE);
      cur.engagement += num(mm.SAVE) + num(mm.PIN_CLICK) + num(mm.OUTBOUND_CLICK);
      cur.video_views += num(mm.VIDEO_MRC_VIEW);
      dailyMap.set(d.date, cur);
    }
  }
  const range = dateRange(period);
  const daily = [];
  for (let t = Date.parse(range.start); t <= Date.parse(range.end); t += 24 * 60 * 60 * 1000) {
    const key = isoDay(new Date(t));
    daily.push(dailyMap.get(key) || { date: key, impressions: 0, engagement: 0, saves: 0, video_views: 0 });
  }

  const fetchedAts = rows.map((r) => r.fetched_at).filter(Boolean).sort();
  return {
    period,
    range,
    pins: rows,
    accounts: accountRows,
    totals,
    daily,
    pending: rows.filter((r) => r.pending || (r.fetched_at && !isFresh(byPin.get(pins.find((p) => p.public_id === r.id).id), nowMs))).length,
    rate_limited: rateLimited,
    pinterest_configured: canFetch,
    oldest_fetch: fetchedAts[0] || null,
    newest_fetch: fetchedAts[fetchedAts.length - 1] || null,
  };
}

/* ---------- Um pin ---------- */

// Média dos pins publicados da pessoa no mesmo período (só o que já está em cache; não chama a Pinterest).
async function averageFor(db, user, period, kind, excludePinId) {
  const rows = await db.findMany("pin_metrics", { user_id: user.id, period, error: null }, { limit: 2000 });
  const pinIds = rows.map((r) => r.pin_id).filter((id) => id !== excludePinId);
  if (!pinIds.length) return null;
  const pins = await db.findMany("pins", { id: { in: pinIds }, user_id: user.id, status: "published", deleted_at: null }, { limit: 2000 });
  const mediaIds = [...new Set(pins.map((p) => p.media_id).filter(Boolean))];
  const media = mediaIds.length ? await db.findMany("media", { id: { in: mediaIds } }, { limit: 5000 }) : [];
  const kindOf = new Map(media.map((m) => [m.id, m.kind]));
  const wanted = new Set(pins.filter((p) => !kind || (kindOf.get(p.media_id) || "image") === kind).map((p) => p.id));
  const usable = rows.filter((r) => wanted.has(r.pin_id) && r.summary);
  if (!usable.length) return null;
  const sum = { impressions: 0, saves: 0, pin_clicks: 0, outbound_clicks: 0, engagement: 0, video_views: 0 };
  for (const r of usable) {
    const s = r.summary;
    sum.impressions += num(s.IMPRESSION);
    sum.saves += num(s.SAVE);
    sum.pin_clicks += num(s.PIN_CLICK);
    sum.outbound_clicks += num(s.OUTBOUND_CLICK);
    sum.engagement += num(s.SAVE) + num(s.PIN_CLICK) + num(s.OUTBOUND_CLICK);
    sum.video_views += num(s.VIDEO_MRC_VIEW);
  }
  const n2 = usable.length;
  return { count: n2, impressions: sum.impressions / n2, saves: sum.saves / n2, pin_clicks: sum.pin_clicks / n2, outbound_clicks: sum.outbound_clicks / n2, engagement: sum.engagement / n2, video_views: sum.video_views / n2 };
}

async function forPin(db, user, pin, period, opts) {
  const p = validPeriod(period);
  const account = await db.findOne("pinterest_accounts", { id: pin.account_id, user_id: user.id, deleted_at: null });
  const media = pin.media_id ? await db.findOne("media", { id: pin.media_id }) : null;
  const board = pin.board_id ? await db.findOne("boards", { id: pin.board_id }) : null;
  let row = await db.findOne("pin_metrics", { pin_id: pin.id, period: p });
  let fetchError = null;
  if (pinterest.isConfigured() && account && account.status === "active" && pin.pinterest_pin_id && (!isFresh(row, Date.now()) || (opts && opts.refresh))) {
    try {
      row = await fetchPinMetrics(db, pin, media, account, p);
    } catch (e) {
      fetchError = e.message; // fica com o cache
    }
  }
  const maps = { accounts: new Map(account ? [[account.id, account]] : []), media: new Map(media ? [[media.id, media]] : []), boards: new Map(board ? [[board.id, board]] : []) };
  const out = pinRow(pin, row, maps);
  const mm = (d) => d.metrics || {};
  out.daily = row && Array.isArray(row.daily)
    ? row.daily.map((d) => ({
        date: d.date,
        status: d.status,
        impressions: num(mm(d).IMPRESSION),
        saves: num(mm(d).SAVE),
        pin_clicks: num(mm(d).PIN_CLICK),
        outbound_clicks: num(mm(d).OUTBOUND_CLICK),
        engagement: num(mm(d).SAVE) + num(mm(d).PIN_CLICK) + num(mm(d).OUTBOUND_CLICK),
        video_views: num(mm(d).VIDEO_MRC_VIEW),
        video_starts: num(mm(d).VIDEO_START),
      }))
    : [];
  out.period = p;
  out.range = dateRange(p);
  out.description = pin.description || "";
  out.link = pin.link || "";
  out.cover = pin.cover_media_id ? await db.findOne("media", { id: pin.cover_media_id }).then((c) => (c ? { url: c.url } : null)) : null;
  out.account_status = account ? account.status : null;
  out.fetch_error = fetchError;
  out.pinterest_configured = pinterest.isConfigured();
  out.average = await averageFor(db, user, p, out.kind, pin.id);
  return out;
}

/* ---------- Manutenção diária ---------- */

// Atualiza (dentro do orçamento) as métricas de 30 dias dos pins publicados recentemente,
// para a tela abrir com dados frescos sem gastar chamadas na hora.
async function refreshRecent(db, budget) {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const pins = await db.findMany("pins", { status: "published", deleted_at: null, pinterest_pin_id: { notNull: true }, published_at: { gte: since } }, { orderBy: [["published_at", "desc"]], limit: budget || config.ANALYTICS_DAILY_BUDGET });
  let done = 0;
  for (const pin of pins) {
    const account = await db.findOne("pinterest_accounts", { id: pin.account_id, deleted_at: null, status: "active" });
    if (!account) continue;
    const media = pin.media_id ? await db.findOne("media", { id: pin.media_id }) : null;
    try {
      await fetchPinMetrics(db, pin, media, account, 30);
      done++;
    } catch (e) {
      if (e.code === "RATE_LIMITED") break;
    }
  }
  return done;
}

module.exports = { overview, forPin, averageFor, refreshRecent, dateRange, validPeriod, STANDARD_METRICS, VIDEO_METRICS, ACCOUNT_METRICS };
