"use strict";

/**
 * Servidor local de desenvolvimento: entrega o site e a API (/api/*).
 * Usa banco em arquivo (.data/dev-db.json) e mídia em pasta (.data/media), só para
 * testar na sua máquina. Na Vercel esses modos são recusados.
 *
 *   npm run dev:local        ->  http://localhost:3000
 *   AUTH_STORE=none          ->  simula o site sem banco (modo de visualização)
 */

process.env.AUTH_STORE = process.env.AUTH_STORE || "file"; // AUTH_STORE=none simula o site sem banco
process.env.MEDIA_STORE = process.env.MEDIA_STORE || (process.env.AUTH_STORE === "file" ? "file" : "");

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const api = require(path.join(ROOT, "api", "index.js"));
const storage = require(path.join(ROOT, "api", "_lib", "storage.js"));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".ico": "image/x-icon",
};

// Mesmas regras do vercel.json: endereços antigos -> novos.
const REDIRECTS = { "/entrar": "/app/login", "/cadastro": "/app/cadastro", "/painel": "/app/dashboard", "/app": "/app/dashboard" };

// Páginas da plataforma: /app/<página>[/<id>[/<sub>]]  (mesma ordem do vercel.json)
const APP_PAGES = [
  [/^\/app\/(login|cadastro|esqueci-senha)(?:\/[^/]+)?$/, (m) => m[1]],
  [/^\/app\/(redefinir|confirmar)\/[^/]+$/, (m) => m[1]],
  [/^\/app\/dashboard(?:\/[^/]+)?$/, () => "dashboard"],
  [/^\/app\/contas\/[^/]+\/[^/]+$/, () => "conta"],
  [/^\/app\/contas(?:\/[^/]+)?$/, () => "contas"],
  [/^\/app\/pins\/[^/]+\/novo$/, () => "pin-novo"],
  [/^\/app\/pins\/[^/]+\/[^/]+$/, () => "pin"],
  [/^\/app\/pins(?:\/[^/]+)?$/, () => "pins"],
  [/^\/app\/historico(?:\/[^/]+)?$/, () => "historico"],
  [/^\/app\/(configuracoes|configurações)(?:\/[^/]+)?$/, () => "configuracoes"],
];

function staticFileFor(pathname) {
  if (pathname === "/") return path.join(ROOT, "index.html");
  if (pathname === "/favicon.svg") return path.join(ROOT, "favicon.svg");
  if (/^\/(css|js)\/[A-Za-z0-9._\/-]+$/.test(pathname) && !pathname.includes("..")) return path.join(ROOT, pathname);
  for (const [re, page] of APP_PAGES) {
    const m = re.exec(pathname);
    if (m) return path.join(ROOT, "app", page(m) + ".html");
  }
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

    if (pathname === "/api" || pathname.startsWith("/api/")) return api(req, res);

    if (pathname.startsWith("/media-local/")) {
      const name = pathname.slice("/media-local/".length);
      return storage
        .readLocal(name)
        .then((buf) => {
          res.setHeader("Content-Type", MIME[path.extname(name).toLowerCase()] || "application/octet-stream");
          res.end(buf);
        })
        .catch(() => {
          res.statusCode = 404;
          res.end("Arquivo não encontrado");
        });
    }

    if (REDIRECTS[pathname]) {
      res.statusCode = 302;
      res.setHeader("Location", REDIRECTS[pathname]);
      return res.end();
    }

    const file = staticFileFor(pathname);
    if (!file || !fs.existsSync(file)) {
      const notFound = path.join(ROOT, "404.html");
      res.statusCode = 404;
      if (fs.existsSync(notFound)) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return fs.createReadStream(notFound).pipe(res);
      }
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
    console.log("Pinflow local em http://localhost:" + port);
    console.log("Banco: " + (process.env.AUTH_STORE === "file" ? "arquivo .data/dev-db.json (apenas para testes)" : "nenhum (modo de visualização)"));
  });
}

module.exports = { createServer };
