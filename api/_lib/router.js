"use strict";

/**
 * Roteador da API. Todas as rotas passam por UMA função na Vercel (api/index.js),
 * porque o plano Hobby permite no máximo 12 funções por deploy.
 *
 * Uso:
 *   router.add("GET", "/pins/:id", handler, { auth: true })
 *   handler recebe { req, res, body, params, query, user, session, db }
 *
 * Opções:
 *   auth: true      -> exige sessão válida (401 se não houver)
 *   raw: true       -> não exige JSON nem mesma origem (ex.: retorno do login da Pinterest, uploads)
 *   admin: true     -> exige user.role === "admin"
 */

const { fail, readJson, sameOrigin, handleError } = require("./http");
const { getDb } = require("./db");
const { currentSession } = require("./auth");

const routes = [];

function compile(pattern) {
  const keys = [];
  const re = pattern
    .split("/")
    .map((seg) => {
      if (seg.startsWith(":")) {
        keys.push(seg.slice(1));
        return "([^/]+)";
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return { re: new RegExp("^" + re + "$"), keys };
}

function add(method, pattern, handler, opts) {
  const c = compile(pattern);
  routes.push({ method, pattern, re: c.re, keys: c.keys, handler, opts: opts || {} });
}

// Caminho da API a partir da requisição: /api/auth/login -> "/auth/login".
function apiPath(req) {
  const url = new URL(req.url, "http://localhost");
  let p = url.pathname.replace(/\/+$/, "");
  if (p.startsWith("/api")) p = p.slice(4);
  if (p === "" || p === "/index" || p === "/") {
    // Reescrita da Vercel: /api/qualquer/coisa -> /api/index?__path=qualquer/coisa
    const rewritten = url.searchParams.get("__path");
    p = rewritten ? "/" + rewritten.replace(/^\/+|\/+$/g, "") : "/";
  }
  const query = {};
  url.searchParams.forEach((v, k) => {
    if (k !== "__path") query[k] = v;
  });
  return { path: p, query };
}

async function dispatch(req, res) {
  try {
    const { path, query } = apiPath(req);
    let matched = null;
    let methodMismatch = false;
    for (const r of routes) {
      const m = r.re.exec(path);
      if (!m) continue;
      if (r.method !== req.method && !(r.method === "GET" && req.method === "HEAD")) {
        methodMismatch = true;
        continue;
      }
      matched = { r, m };
      break;
    }
    if (!matched) {
      if (methodMismatch) return fail(res, 405, "method_not_allowed", "Método não permitido.");
      return fail(res, 404, "not_found", "Rota não encontrada.");
    }
    const { r, m } = matched;
    const params = {};
    r.keys.forEach((k, i) => {
      try {
        params[k] = decodeURIComponent(m[i + 1]);
      } catch (e) {
        params[k] = m[i + 1];
      }
    });

    let body = {};
    if (!r.opts.raw && req.method !== "GET" && req.method !== "HEAD") {
      if (!sameOrigin(req)) return fail(res, 403, "forbidden_origin", "Requisição não permitida.");
      const type = String(req.headers["content-type"] || "").toLowerCase();
      const hasBody = type !== "" || Number(req.headers["content-length"] || 0) > 0;
      if (req.method === "DELETE" && !hasBody) {
        body = {};
      } else {
        if (!type.startsWith("application/json")) {
          return fail(res, 415, "unsupported_media_type", "Envie os dados em JSON.");
        }
        body = await readJson(req);
        if (body === null || typeof body !== "object" || Array.isArray(body)) {
          return fail(res, 400, "invalid_body", "Dados inválidos.");
        }
      }
    }

    const ctx = { req, res, body, params, query, user: null, session: null, db: null };
    if (r.opts.auth || r.opts.admin) {
      ctx.db = getDb();
      const current = await currentSession(ctx.db, req);
      if (!current) return fail(res, 401, "unauthenticated", "Você não está conectado.");
      ctx.user = current.user;
      ctx.session = current.session;
      if (r.opts.admin && ctx.user.role !== "admin") return fail(res, 403, "forbidden", "Sem permissão.");
    }
    await r.handler(ctx);
  } catch (e) {
    handleError(res, e, "api");
  }
}

module.exports = { add, dispatch, apiPath, routes };
