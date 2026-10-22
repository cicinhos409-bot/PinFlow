"use strict";

const config = require("./config");

/* ---------- Respostas ---------- */

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function fail(res, status, code, message, field) {
  const error = { code, message };
  if (field) error.field = field;
  send(res, status, { ok: false, error });
}

function codeError(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

/* ---------- Entrada ---------- */

function readJson(req) {
  // Na Vercel o corpo JSON já chega lido em req.body.
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
    try {
      const text = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body);
      return Promise.resolve(JSON.parse(text || "{}"));
    } catch (e) {
      return Promise.reject(codeError("BAD_JSON"));
    }
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on("data", (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > config.BODY_LIMIT_BYTES) {
        done = true;
        reject(codeError("BODY_TOO_LARGE"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (done) return;
      done = true;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (e) {
        reject(codeError("BAD_JSON"));
      }
    });
    req.on("error", (e) => {
      if (done) return;
      done = true;
      reject(e);
    });
  });
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
  const parts = [name + "=" + encodeURIComponent(value), "Path=/", "HttpOnly", "SameSite=Lax"];
  if (typeof o.maxAge === "number") parts.push("Max-Age=" + Math.floor(o.maxAge));
  if (o.secure) parts.push("Secure");
  return parts.join("; ");
}

function isSecure(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  return proto === "https" || Boolean(req.socket && req.socket.encrypted);
}

/* ---------- Origem e IP ---------- */

function sameOrigin(req) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
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

/* ---------- Rota ---------- */

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
      if (req.method !== "GET") {
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
      const code = e && e.code;
      if (code === "DB_NOT_CONFIGURED") {
        return fail(res, 503, "not_configured", "O sistema de contas ainda não está disponível. Volte em breve.");
      }
      if (code === "BODY_TOO_LARGE") return fail(res, 413, "body_too_large", "Dados grandes demais.");
      if (code === "BAD_JSON") return fail(res, 400, "invalid_body", "Dados inválidos.");
      console.error("[auth] erro:", code || "", e && e.message);
      return fail(res, 500, "server_error", "Algo deu errado do nosso lado. Tente de novo em instantes.");
    }
  };
}

module.exports = { send, fail, route, parseCookies, buildCookie, isSecure, clientIp, sameOrigin };
