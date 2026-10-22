"use strict";

/**
 * Armazenamento de imagens e vídeos.
 *   - blob: Vercel Blob (BLOB_READ_WRITE_TOKEN). O navegador envia o arquivo direto para o
 *     armazenamento (upload de cliente), porque as funções da Vercel aceitam no máximo ~4,5 MB.
 *   - file: pasta local .data/media (SOMENTE testes; recusado na Vercel).
 */

const fs = require("fs/promises");
const path = require("path");

function mode() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  if (process.env.MEDIA_STORE === "file" && !process.env.VERCEL) return "file";
  return null;
}

function notConfigured() {
  const e = new Error("Armazenamento não configurado");
  e.code = "STORAGE_NOT_CONFIGURED";
  return e;
}

function localDir() {
  return process.env.MEDIA_FILE_DIR || path.join(process.cwd(), ".data", "media");
}

// Nome seguro: só letras, números, ponto, traço e sublinhado.
function safeName(filename) {
  const base = String(filename || "arquivo").split(/[\\/]/).pop();
  return base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "arquivo";
}

/* ---------- Upload de cliente (Vercel Blob) ---------- */

// Gera o token para o navegador enviar o arquivo direto. body é o JSON mandado pelo SDK do cliente.
async function handleClientUpload({ req, body, allowedContentTypes, maximumSizeInBytes, pathnamePrefix, tokenPayload }) {
  if (mode() !== "blob") throw notConfigured();
  const { handleUpload } = require("@vercel/blob/client");
  return handleUpload({
    body,
    request: req,
    onBeforeGenerateToken: async (pathname) => {
      if (!pathname.startsWith(pathnamePrefix)) {
        throw new Error("Caminho de upload não permitido");
      }
      return {
        allowedContentTypes,
        maximumSizeInBytes,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify(tokenPayload || {}),
      };
    },
    onUploadCompleted: async () => {
      /* o registro no banco é feito pelo navegador em POST /api/media (funciona também em localhost) */
    },
  });
}

// Confere que a URL pertence ao nosso armazenamento (evita registrar URLs de terceiros como mídia).
async function describe(url) {
  const m = mode();
  if (m === "blob") {
    const { head } = require("@vercel/blob");
    const info = await head(url); // lança se não existir ou não for da loja
    return { url: info.url, size: info.size, contentType: info.contentType, key: info.pathname };
  }
  if (m === "file") {
    const prefix = "/media-local/";
    if (!url.startsWith(prefix)) throw new Error("URL fora do armazenamento local");
    const name = safeName(url.slice(prefix.length));
    const stat = await fs.stat(path.join(localDir(), name));
    return { url, size: stat.size, contentType: null, key: name };
  }
  throw notConfigured();
}

/* ---------- Upload local (só testes) ---------- */

async function saveLocal(filename, buffer) {
  if (mode() !== "file") throw notConfigured();
  const name = Date.now().toString(36) + "-" + safeName(filename);
  await fs.mkdir(localDir(), { recursive: true });
  await fs.writeFile(path.join(localDir(), name), buffer);
  return { url: "/media-local/" + name, key: name, size: buffer.length };
}

async function readLocal(name) {
  return fs.readFile(path.join(localDir(), safeName(name)));
}

/* ---------- Apagar ---------- */

async function remove(urlOrKey) {
  const m = mode();
  try {
    if (m === "blob") {
      const { del } = require("@vercel/blob");
      await del(urlOrKey);
    } else if (m === "file") {
      const name = safeName(String(urlOrKey).replace(/^\/media-local\//, ""));
      await fs.unlink(path.join(localDir(), name));
    }
  } catch (e) {
    console.error("[storage] não apagou:", e && e.message);
  }
}

/* ---------- Ler o arquivo (para mandar à Pinterest) ---------- */

// Devolve o arquivo como Buffer. Para "file" lê do disco; para "blob" baixa pela URL pública.
async function fetchBytes(url, baseUrl) {
  if (mode() === "file" && url.startsWith("/media-local/")) return readLocal(url.slice("/media-local/".length));
  const abs = url.startsWith("http") ? url : (baseUrl || "") + url;
  const res = await fetch(abs);
  if (!res.ok) throw new Error("Não foi possível ler a mídia (" + res.status + ")");
  return Buffer.from(await res.arrayBuffer());
}

// URL pública que a Pinterest consegue acessar (imagens são buscadas por URL).
function publicUrl(url, baseUrl) {
  return url.startsWith("http") ? url : (baseUrl || "") + url;
}

module.exports = { mode, handleClientUpload, describe, saveLocal, readLocal, remove, fetchBytes, publicUrl, safeName };
