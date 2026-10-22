"use strict";

/**
 * Cliente da API oficial da Pinterest (v5) e do login oficial (OAuth 2.0).
 * Referência: https://developers.pinterest.com/docs/api/v5/ e o OpenAPI oficial (pinterest/api-description).
 *
 * Regras que a Pinterest impõe e este arquivo respeita:
 *  - Login só pelo OAuth (nunca pedimos a senha da Pinterest).
 *  - Token de acesso dura 30 dias; o de renovação (contínuo) 60 dias e é trocado a cada renovação.
 *  - Credenciais do app vão em Basic auth no endpoint de token.
 *  - Vídeo: registrar (POST /media) -> enviar para upload_url -> esperar "succeeded" -> criar o pin.
 */

const config = require("./config");
const { encrypt, decrypt } = require("./crypto");

function isConfigured() {
  return Boolean(process.env.PINTEREST_APP_ID && process.env.PINTEREST_APP_SECRET);
}

function requireConfig() {
  if (!isConfigured()) {
    const e = new Error("PINTEREST_APP_ID/PINTEREST_APP_SECRET ausentes");
    e.code = "PINTEREST_NOT_CONFIGURED";
    throw e;
  }
}

class PinterestError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = "PinterestError";
    this.status = status;
    this.details = details || null;
  }
}

/* ---------- Tradução dos erros para português ---------- */

function describeError(e) {
  const status = e && e.status;
  const raw = String((e && e.message) || "");
  if (status === 401) {
    return { code: "token_invalid", message: "A Pinterest não aceitou mais o acesso desta conta. Reconecte a conta.", retryable: false, reconnect: true };
  }
  if (status === 403) {
    if (/PINNER_DATA_ACCESS_DENIED/i.test(raw)) {
      return {
        code: "pinner_access_denied",
        message: "A Pinterest só libera pastas e pins pela API para contas Business. Converta a conta em Business na Pinterest e reconecte.",
        retryable: false,
        reconnect: false,
      };
    }
    return { code: "forbidden", message: "A Pinterest recusou esta ação para a conta (" + raw.slice(0, 160) + ").", retryable: false, reconnect: false };
  }
  if (status === 429) {
    return { code: "rate_limited", message: "Limite de chamadas da Pinterest atingido. Vamos tentar de novo mais tarde.", retryable: true, reconnect: false };
  }
  if (status === 404) {
    return { code: "not_found", message: "A Pinterest não encontrou o recurso (pasta ou pin pode ter sido apagado).", retryable: false, reconnect: false };
  }
  if (status === 400 || status === 422) {
    return { code: "rejected", message: "A Pinterest rejeitou o pin: " + (raw.slice(0, 300) || "dados inválidos") + ".", retryable: false, reconnect: false };
  }
  if (status >= 500 || status === 0 || !status) {
    return { code: "pinterest_unavailable", message: "A Pinterest está instável agora. Vamos tentar de novo mais tarde.", retryable: true, reconnect: false };
  }
  return { code: "pinterest_error", message: "Erro na Pinterest: " + raw.slice(0, 300), retryable: false, reconnect: false };
}

/* ---------- OAuth ---------- */

function authUrl({ redirectUri, state, scopes }) {
  requireConfig();
  const u = new URL(config.PINTEREST_OAUTH_URL);
  u.searchParams.set("client_id", process.env.PINTEREST_APP_ID);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", (scopes || config.PINTEREST_SCOPES).split(/[\s,]+/).filter(Boolean).join(","));
  u.searchParams.set("state", state);
  return u.toString();
}

async function tokenRequest(form) {
  requireConfig();
  const basic = Buffer.from(process.env.PINTEREST_APP_ID + ":" + process.env.PINTEREST_APP_SECRET).toString("base64");
  const res = await fetch(config.PINTEREST_API_BASE + "/oauth/token", {
    method: "POST",
    headers: { Authorization: "Basic " + basic, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new PinterestError(res.status, data.message || data.error_description || data.error || "Falha no token", data);
  return normalizeTokens(data);
}

function normalizeTokens(data) {
  const now = Date.now();
  const refreshExpiresAt = data.refresh_token_expires_at
    ? new Date(Number(data.refresh_token_expires_at) * 1000).toISOString()
    : data.refresh_token_expires_in
    ? new Date(now + Number(data.refresh_token_expires_in) * 1000).toISOString()
    : null;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || null,
    token_expires_at: new Date(now + Number(data.expires_in || 2592000) * 1000).toISOString(),
    refresh_expires_at: refreshExpiresAt,
    scope: data.scope || "",
  };
}

function exchangeCode({ code, redirectUri }) {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri, continuous_refresh: "true" });
}

function refreshTokens(refreshToken) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

/* ---------- Chamadas à API ---------- */

async function request(accessToken, method, path, opts) {
  const o = opts || {};
  const url = new URL(config.PINTEREST_API_BASE + path);
  if (o.query) Object.keys(o.query).forEach((k) => o.query[k] !== undefined && url.searchParams.set(k, o.query[k]));
  const headers = { Authorization: "Bearer " + accessToken, Accept: "application/json" };
  let body;
  if (o.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(o.body);
  }
  let res;
  try {
    res = await fetch(url, { method, headers, body });
  } catch (e) {
    throw new PinterestError(0, "Sem resposta da Pinterest: " + e.message);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    data = { message: text.slice(0, 300) };
  }
  if (!res.ok) throw new PinterestError(res.status, (data && (data.message || data.error)) || "HTTP " + res.status, data);
  return data;
}

const api = {
  userAccount: (token) => request(token, "GET", "/user_account"),

  async listAllBoards(token) {
    const items = [];
    let bookmark;
    for (let i = 0; i < 40; i++) {
      const page = await request(token, "GET", "/boards", { query: { page_size: 100, bookmark } });
      items.push(...(page.items || []));
      bookmark = page.bookmark;
      if (!bookmark) break;
    }
    return items;
  },

  createBoard: (token, body) => request(token, "POST", "/boards", { body }),
  updateBoard: (token, id, body) => request(token, "PATCH", "/boards/" + encodeURIComponent(id), { body }),
  deleteBoard: (token, id) => request(token, "DELETE", "/boards/" + encodeURIComponent(id)),

  createPin: (token, body) => request(token, "POST", "/pins", { body }),
  getPin: (token, id) => request(token, "GET", "/pins/" + encodeURIComponent(id)),
  updatePin: (token, id, body) => request(token, "PATCH", "/pins/" + encodeURIComponent(id), { body }),
  deletePin: (token, id) => request(token, "DELETE", "/pins/" + encodeURIComponent(id)),

  registerMedia: (token) => request(token, "POST", "/media", { body: { media_type: "video" } }),
  getMedia: (token, id) => request(token, "GET", "/media/" + encodeURIComponent(id)),

  // Envio do arquivo de vídeo para o endereço que a Pinterest devolveu (sem Bearer; multipart).
  async uploadMedia(uploadUrl, uploadParameters, bytes, filename, contentType) {
    const form = new FormData();
    Object.keys(uploadParameters || {}).forEach((k) => form.append(k, String(uploadParameters[k])));
    form.append("file", new Blob([bytes], { type: contentType || "video/mp4" }), filename || "video.mp4");
    let res;
    try {
      res = await fetch(uploadUrl, { method: "POST", body: form });
    } catch (e) {
      throw new PinterestError(0, "Falha ao enviar o vídeo: " + e.message);
    }
    if (!res.ok && res.status !== 204) {
      const text = await res.text().catch(() => "");
      throw new PinterestError(res.status >= 500 ? res.status : 400, "Falha ao enviar o vídeo (" + res.status + "): " + text.slice(0, 200));
    }
  },
};

/* ---------- Tokens da conta (criptografados no banco) ---------- */

function tokensFromAccount(account) {
  return {
    access: account.access_token_enc ? decrypt(account.access_token_enc) : null,
    refresh: account.refresh_token_enc ? decrypt(account.refresh_token_enc) : null,
  };
}

function tokenFields(tokens) {
  return {
    access_token_enc: encrypt(tokens.access_token),
    refresh_token_enc: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
    token_expires_at: tokens.token_expires_at,
    refresh_expires_at: tokens.refresh_expires_at || undefined,
    scopes: tokens.scope || undefined,
  };
}

// Renova o token de acesso usando o de renovação e grava no banco. Lança se não der.
async function refreshAccount(db, account) {
  const { refresh } = tokensFromAccount(account);
  if (!refresh) throw new PinterestError(401, "Sem token de renovação");
  if (account.refresh_expires_at && new Date(account.refresh_expires_at).getTime() <= Date.now()) {
    throw new PinterestError(401, "Token de renovação vencido");
  }
  const tokens = await refreshTokens(refresh);
  const now = new Date().toISOString();
  const fields = Object.assign(tokenFields(tokens), { status: "active", last_error: null, updated_at: now });
  const updated = await db.updateOne("pinterest_accounts", { id: account.id }, fields);
  return updated || Object.assign({}, account, fields);
}

async function markNeedsReconnect(db, account, message) {
  await db.update("pinterest_accounts", { id: account.id }, { status: "needs_reconnect", last_error: message, updated_at: new Date().toISOString() });
}

/**
 * Executa fn(accessToken) com um token válido: renova antes se estiver perto de vencer e,
 * se a Pinterest responder 401, renova uma vez e tenta de novo. Se a renovação falhar,
 * marca a conta como "precisa reconectar".
 */
async function withAccount(db, account, fn) {
  let acc = account;
  const expires = acc.token_expires_at ? new Date(acc.token_expires_at).getTime() : 0;
  if (!acc.access_token_enc || expires - Date.now() < config.TOKEN_REFRESH_BEFORE_MS) {
    try {
      acc = await refreshAccount(db, acc);
    } catch (e) {
      if (!acc.access_token_enc || expires <= Date.now()) {
        await markNeedsReconnect(db, acc, describeError(e).message);
        throw e;
      }
      // ainda dá para usar o token atual
    }
  }
  try {
    return await fn(tokensFromAccount(acc).access, acc);
  } catch (e) {
    if (!(e instanceof PinterestError) || e.status !== 401) throw e;
    try {
      acc = await refreshAccount(db, acc);
    } catch (e2) {
      await markNeedsReconnect(db, acc, describeError(e2).message);
      throw e2;
    }
    return fn(tokensFromAccount(acc).access, acc);
  }
}

module.exports = {
  isConfigured,
  requireConfig,
  PinterestError,
  describeError,
  authUrl,
  exchangeCode,
  refreshTokens,
  request,
  api,
  tokensFromAccount,
  tokenFields,
  refreshAccount,
  markNeedsReconnect,
  withAccount,
};
