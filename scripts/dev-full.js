"use strict";

/**
 * Ambiente local completo para testar no navegador: site + API + banco em arquivo +
 * mídia em pasta + Pinterest SIMULADA (não toca na Pinterest de verdade).
 *
 *   npm run dev:full   ->  http://localhost:3000
 */

const path = require("path");
const fs = require("fs");

const dataDir = process.env.PF_DATA_DIR || path.join(__dirname, "..", ".data");
fs.mkdirSync(dataDir, { recursive: true });
process.env.AUTH_STORE = "file";
process.env.MEDIA_STORE = "file";
process.env.AUTH_FILE_PATH = process.env.AUTH_FILE_PATH || path.join(dataDir, "dev-db.json");
process.env.MEDIA_FILE_DIR = process.env.MEDIA_FILE_DIR || path.join(dataDir, "media");
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "segredo-local-de-desenvolvimento-123";
process.env.TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || "0".repeat(64);
process.env.PINTEREST_APP_ID = process.env.PINTEREST_APP_ID || "app-simulado";
process.env.PINTEREST_APP_SECRET = process.env.PINTEREST_APP_SECRET || "segredo-simulado";
process.env.MAIL_STORE = process.env.MAIL_STORE || "memory";
process.env.CRON_SECRET = process.env.CRON_SECRET || "cron-local";
process.env.PF_MIN_GAP_SECONDS = process.env.PF_MIN_GAP_SECONDS || "0";
process.env.PF_MEDIA_POLL_MS = process.env.PF_MEDIA_POLL_MS || "200";
process.env.PF_WORKER_MIN_INTERVAL_MS = process.env.PF_WORKER_MIN_INTERVAL_MS || "0";

const { createFakePinterest } = require("./fake-pinterest");

async function start(port, fakePort) {
  const fake = createFakePinterest();
  await new Promise((r) => fake.server.listen(fakePort || 0, "127.0.0.1", r));
  const fp = fake.server.address().port;
  process.env.PINTEREST_API_BASE = "http://127.0.0.1:" + fp + "/v5";
  process.env.PINTEREST_OAUTH_URL = "http://127.0.0.1:" + fp + "/oauth/";
  const { createServer } = require("./dev-server");
  const server = createServer();
  await new Promise((r) => server.listen(port || 0, "127.0.0.1", r));
  const p = server.address().port;
  process.env.APP_URL = process.env.APP_URL || "http://localhost:" + p;
  return { server, fake, port: p, fakePort: fp };
}

if (require.main === module) {
  start(Number(process.env.PORT || 3000)).then(({ port, fakePort }) => {
    console.log("Pinflow local (completo) em http://localhost:" + port);
    console.log("Pinterest simulada em http://127.0.0.1:" + fakePort + " (nada vai para a Pinterest de verdade)");
    console.log("Dados em " + dataDir);
  });
}

module.exports = { start };
