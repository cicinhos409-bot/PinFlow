"use strict";

const config = require("../config");
const router = require("../router");
const { getDb } = require("../db");
const { send, fail, readJson, readRaw, sameOrigin } = require("../http");
const { randomId, publicId } = require("../crypto");
const { currentSession } = require("../auth");
const { cleanText, clampInt } = require("../validate");
const storage = require("../storage");

function publicMedia(m) {
  return {
    id: m.public_id,
    kind: m.kind,
    url: m.url,
    filename: m.filename || "",
    content_type: m.content_type || "",
    size: m.size || 0,
    width: m.width || null,
    height: m.height || null,
    duration_ms: m.duration_ms || null,
    created_at: m.created_at,
  };
}

function kindFor(contentType) {
  if (config.IMAGE_TYPES.includes(contentType)) return "image";
  if (config.VIDEO_TYPES.includes(contentType)) return "video";
  return null;
}

/* ---------- Token para o navegador enviar direto ao Vercel Blob ---------- */

// O SDK do cliente faz POST aqui com { type: "blob.generate-client-token", payload: {...} }.
router.add("POST", "/media/upload", async ({ req, res }) => {
  const db = getDb();
  if (!sameOrigin(req)) return fail(res, 403, "forbidden_origin", "Requisição não permitida.");
  const current = await currentSession(db, req);
  if (!current) return fail(res, 401, "unauthenticated", "Você não está conectado.");
  const user = current.user;
  const body = await readJson(req);
  if (!body || typeof body !== "object") return fail(res, 400, "invalid_body", "Dados inválidos.");

  const total = await db.count("media", { user_id: user.id, deleted_at: null });
  if (total >= config.MEDIA_PER_USER_MAX) return fail(res, 409, "media_limit", "Você atingiu o limite de arquivos. Apague alguns na biblioteca.");

  const result = await storage.handleClientUpload({
    req,
    body,
    pathnamePrefix: "u/" + user.public_id + "/",
    allowedContentTypes: config.IMAGE_TYPES.concat(config.VIDEO_TYPES),
    maximumSizeInBytes: config.VIDEO_MAX_BYTES,
    tokenPayload: { user: user.public_id },
  });
  send(res, 200, result);
}, { raw: true });

/* ---------- Upload local (só testes, MEDIA_STORE=file) ---------- */

router.add("PUT", "/media/upload-local", async ({ req, res, query }) => {
  const db = getDb();
  if (storage.mode() !== "file") return fail(res, 404, "not_found", "Rota não encontrada.");
  if (!sameOrigin(req)) return fail(res, 403, "forbidden_origin", "Requisição não permitida.");
  const current = await currentSession(db, req);
  if (!current) return fail(res, 401, "unauthenticated", "Você não está conectado.");
  const buf = await readRaw(req, config.VIDEO_MAX_BYTES);
  const saved = await storage.saveLocal(String(query.filename || "arquivo"), buf);
  send(res, 200, { ok: true, url: saved.url, size: saved.size });
}, { raw: true });

/* ---------- Registro no banco (depois do upload) ---------- */

router.add("POST", "/media", async ({ res, body, user, db }) => {
  const url = typeof body.url === "string" ? body.url : "";
  const contentType = String(body.content_type || "").toLowerCase();
  const kind = kindFor(contentType);
  if (!url) return fail(res, 422, "invalid_url", "Arquivo não enviado.");
  if (!kind) return fail(res, 422, "invalid_type", "Formato não aceito. Use JPG, PNG, WEBP, GIF, MP4 ou MOV.");

  let info;
  try {
    info = await storage.describe(url);
  } catch (e) {
    return fail(res, 422, "invalid_url", "Não encontramos esse arquivo no armazenamento.");
  }
  const size = Number(info.size || body.size || 0);
  const max = kind === "video" ? config.VIDEO_MAX_BYTES : config.IMAGE_MAX_BYTES;
  if (size > max) {
    await storage.remove(info.key || url);
    return fail(res, 422, "too_large", kind === "video" ? "Vídeo acima de " + Math.round(max / 1048576) + " MB." : "Imagem acima de " + Math.round(max / 1048576) + " MB.");
  }

  const now = new Date().toISOString();
  const m = await db.insert("media", {
    id: randomId(),
    public_id: publicId(),
    user_id: user.id,
    kind,
    url: info.url || url,
    storage_key: info.key || null,
    filename: cleanText(body.filename, 160) || null,
    content_type: contentType,
    size,
    width: clampInt(body.width, 1, 20000, null),
    height: clampInt(body.height, 1, 20000, null),
    duration_ms: clampInt(body.duration_ms, 1, 24 * 60 * 60 * 1000, null),
    created_at: now,
    deleted_at: null,
  });
  send(res, 201, { ok: true, media: publicMedia(m) });
}, { auth: true });

router.add("GET", "/media", async ({ res, query, user, db }) => {
  const where = { user_id: user.id, deleted_at: null };
  if (query.kind === "image" || query.kind === "video") where.kind = query.kind;
  const limit = clampInt(query.limit, 1, 200, 60);
  const offset = clampInt(query.offset, 0, 100000, 0);
  const [rows, total] = await Promise.all([db.findMany("media", where, { orderBy: [["created_at", "desc"]], limit, offset }), db.count("media", where)]);
  send(res, 200, { ok: true, media: rows.map(publicMedia), total });
}, { auth: true });

router.add("DELETE", "/media/:id", async ({ res, params, user, db }) => {
  const m = await db.findOne("media", { public_id: params.id, user_id: user.id, deleted_at: null });
  if (!m) return fail(res, 404, "not_found", "Arquivo não encontrado.");
  const inUse = await db.count("pins", { media_id: m.id, status: { in: ["scheduled", "publishing"] }, deleted_at: null });
  const inUseCover = await db.count("pins", { cover_media_id: m.id, status: { in: ["scheduled", "publishing"] }, deleted_at: null });
  if (inUse + inUseCover > 0) return fail(res, 409, "media_in_use", "Este arquivo está em " + (inUse + inUseCover) + " pin(s) programado(s). Cancele ou edite esses pins antes.");
  await storage.remove(m.storage_key || m.url);
  await db.update("media", { id: m.id }, { deleted_at: new Date().toISOString() });
  send(res, 200, { ok: true });
}, { auth: true });

module.exports = { publicMedia, kindFor };
