"use strict";

const config = require("./config");

/* ---------- Respostas ---------- */

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function fail(res, status, code, message, field, extra) {
  const error = Object.assign({ code, message }, extra || {});
  if (field) error.field = field;
  send(res, status, { ok: false, error });
}

function redirect(res, location, status) {
  res.statusCode = status || 302;
  res.setHeader("Location", location);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

function codeError(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

// Erro "esperado" que vira uma resposta HTTP com status e mensagem (lançado pelos handlers).
class HttpError extends Error {
  constructor(status, code, message, field, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
    this.extra = extra;
  }
}

function httpError(status, code, message, field, extra) {
  return new HttpError(status, code, message, field, extra);
}

/* ---------- Entrada ---------- */

function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on("data", (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        done = true;
        reject(codeError("BODY_TOO_LARGE"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks));
    });
    req.on("error", (e) => {
      if (done) return;
      done = true;
      reject(e);
    });
  });
}

async function readJson(req) {
  // Na Vercel o corpo JSON já chega lido em req.body.
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
    try {
      const text = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body);
      return JSON.parse(text || "{}");
    } catch (e) {
      throw codeError("BAD_JSON");
    }
  }
  const buf = await readRaw(req, config.BODY_LIMIT_BYTES);
  try {
    return JSON.parse(buf.toString("utf8") || "{}");
  } catch (e) {
    throw codeError("BAD_JSON");
  }
}

/* ---------- Cookies ---------- */

function parseCookies(header) {
  const out = {};
  String(header || "")
    .split(";")
    .forEach((part) => {
      const i = part.indexOf("=");
      if (i < 0) return;
      const name = part.slice(0, i).trim();
      if (!name) return;
      try {
        out[name] = decodeURIComponent(part.slice(i + 1).trim());
      } catch (e) {
        out[name] = part.slice(i + 1).trim();
      }
    });
  return out;
}

function buildCookie(name, value, opts) {
  const o = opts || {};
  const parts = [name + "=" + encodeURIComponent(value), "Path=" + (o.path || "/"), "HttpOnly", "SameSite=Lax"];
  if (typeof o.maxAge === "number") parts.push("Max-Age=" + Math.floor(o.maxAge));
  if (o.secure) parts.push("Secure");
  return parts.join("; ");
}

function appendCookie(res, cookie) {
  const prev = res.getHeader("Set-Cookie");
  if (!prev) res.setHeader("Set-Cookie", cookie);
  else res.setHeader("Set-Cookie", (Array.isArray(prev) ? prev : [prev]).concat(cookie));
}

function isSecure(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  return proto === "https" || Boolean(req.socket && req.socket.encrypted);
}

function requestHost(req) {
  return String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
}

// Endereço público do site (para o retorno do login da Pinterest e os links de e-mail).
function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  const host = requestHost(req);
  return (isSecure(req) ? "https://" : "http://") + host;
}

/* ---------- Origem e IP ---------- */

function sameOrigin(req) {
  const host = requestHost(req);
  const origin = req.headers.origin;
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch (e) {
      return false;
    }
  }
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") return false;
  return true;
}

function clientIp(req) {
  const xff = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xff || (req.socket && req.socket.remoteAddress) || "desconhecido";
}

/* ---------- Tratamento padrão de erros ---------- */

function handleError(res, e, scope) {
  if (e instanceof HttpError) return fail(res, e.status, e.code, e.message, e.field, e.extra);
  const code = e && e.code;
  if (code === "DB_NOT_CONFIGURED") {
    return fail(res, 503, "not_configured", "O sistema de contas ainda não está disponível. Volte em breve.");
  }
  if (code === "STORAGE_NOT_CONFIGURED") {
    return fail(res, 503, "storage_not_configured", "O armazenamento de imagens e vídeos ainda não está configurado.");
  }
  if (code === "PINTEREST_NOT_CONFIGURED") {
    return fail(res, 503, "pinterest_not_configured", "A conexão com a Pinterest ainda não está configurada.");
  }
  if (code === "MAIL_NOT_CONFIGURED") {
    return fail(res, 503, "mail_not_configured", "O envio de e-mails ainda não está configurado.");
  }
  if (code === "CONFIG") {
    console.error("[" + (scope || "api") + "] configuração:", e.message);
    return fail(res, 503, "not_configured", "O serviço está com uma configuração pendente. Volte em breve.");
  }
  if (code === "BODY_TOO_LARGE") return fail(res, 413, "body_too_large", "Dados grandes demais.");
  if (code === "BAD_JSON") return fail(res, 400, "invalid_body", "Dados inválidos.");
  console.error("[" + (scope || "api") + "] erro:", code || "", e && e.stack ? e.stack : e);
  return fail(res, 500, "server_error", "Algo deu errado do nosso lado. Tente de novo em instantes.");
}

/* ---------- Rota (handler único) ---------- */

/**
 * Envolve um handler: confere método, origem e formato, lê o JSON e trata erros de forma padrão.
 * O handler recebe { req, res, body }.
 */
function route(methods, handler) {
  return async function (req, res) {
    try {
      if (!methods.includes(req.method)) {
        res.setHeader("Allow", methods.join(", "));
        return fail(res, 405, "method_not_allowed", "Método não permitido.");
      }
      let body = {};
      if (req.method !== "GET" && req.method !== "HEAD") {
        if (!sameOrigin(req)) return fail(res, 403, "forbidden_origin", "Requisição não permitida.");
        const type = String(req.headers["content-type"] || "").toLowerCase();
        if (!type.startsWith("application/json")) {
          return fail(res, 415, "unsupported_media_type", "Envie os dados em JSON.");
        }
        body = await readJson(req);
        if (body === null || typeof body !== "object" || Array.isArray(body)) {
          return fail(res, 400, "invalid_body", "Dados inválidos.");
        }
      }
      await handler({ req, res, body });
    } catch (e) {
      handleError(res, e, "api");
    }
  };
}

module.exports = {
  send,
  fail,
  redirect,
  route,
  HttpError,
  httpError,
  handleError,
  readJson,
  readRaw,
  parseCookies,
  buildCookie,
  appendCookie,
  isSecure,
  requestHost,
  appUrl,
  clientIp,
  sameOrigin,
};
