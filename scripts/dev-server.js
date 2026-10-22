"use strict";

/**
 * Servidor local de desenvolvimento: entrega o site e as rotas /api/auth/*.
 * Usa armazenamento em arquivo (.data/dev-db.json), só para testar na sua máquina.
 *
 *   npm run dev:local        ->  http://localhost:3000
 */

process.env.AUTH_STORE = process.env.AUTH_STORE || "file";

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// Só estas rotas de API existem.
const API = {
  "/api/auth/register": "../api/auth/register.js",
  "/api/auth/login": "../api/auth/login.js",
  "/api/auth/logout": "../api/auth/logout.js",
  "/api/auth/me": "../api/auth/me.js",
};

function staticFileFor(pathname) {
  if (pathname === "/") return path.join(ROOT, "index.html");
  if (pathname === "/favicon.svg") return path.join(ROOT, "favicon.svg");
  if (/^\/(css|js)\/[A-Za-z0-9._-]+$/.test(pathname)) return path.join(ROOT, pathname);
  if (/^\/[a-z-]+$/.test(pathname)) return path.join(ROOT, pathname.slice(1) + ".html"); // URLs sem .html
  return null;
}

function createServer() {
  return http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch (e) {
      res.statusCode = 400;
      return res.end("Requisição inválida");
    }

    if (pathname.startsWith("/api/")) {
      const file = API[pathname];
      if (!file) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.end(JSON.stringify({ ok: false, error: { code: "not_found", message: "Não encontrado." } }));
      }
      return require(file)(req, res);
    }

    const file = staticFileFor(pathname);
    if (!file || !fs.existsSync(file)) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.end("Página não encontrada");
    }
    res.setHeader("Content-Type", MIME[path.extname(file)] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    fs.createReadStream(file).pipe(res);
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, () => {
    console.log("PinFlow local em http://localhost:" + port);
    console.log("Armazenamento: arquivo .data/dev-db.json (apenas para testes)");
  });
}

module.exports = { createServer };
