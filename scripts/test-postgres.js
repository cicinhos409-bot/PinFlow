"use strict";

/**
 * Testa o adaptador Postgres de verdade (SQL, migração automática, filtros, trava da fila)
 * usando um Postgres embutido (PGlite) que fala o protocolo do Postgres numa porta local.
 * Depois roda a MESMA bateria de testes da API (test-api.js) em cima dele.
 *
 *   npm run test:postgres
 */

const path = require("path");
const { spawn } = require("child_process");

async function main() {
  // Guarda contra travamentos (ex.: porta ocupada): falha em vez de esperar para sempre.
  setTimeout(() => {
    console.error("\nTempo esgotado no teste do Postgres.");
    process.exit(1);
  }, 180 * 1000).unref();

  const { PGlite } = require("@electric-sql/pglite");
  const { PGLiteSocketServer } = require("@electric-sql/pglite-socket");
  const db = await PGlite.create();
  const port = 54000 + Math.floor(Math.random() * 1000);
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 20 });
  await server.start();
  const url = "postgres://postgres:postgres@127.0.0.1:" + port + "/postgres";
  console.log("Postgres embutido em " + url + "\n");

  let passed = 0;
  let failed = 0;
  function check(name, cond, extra) {
    if (cond) {
      passed++;
      console.log("  ok   " + name);
    } else {
      failed++;
      console.log("  FALHA " + name + (extra ? "  -> " + extra : ""));
    }
  }

  // 1) Adaptador direto
  process.env.DATABASE_URL = url;
  process.env.DATABASE_SSL = "disable";
  const pg = require("../api/_lib/db-postgres");
  console.log("Adaptador Postgres");
  const now = new Date().toISOString();
  const u = await pg.insert("users", { id: "u1", public_id: "abcdefghijkm", email: "a@b.com", password_hash: "x", created_at: now, updated_at: now });
  check("insert devolve a linha com datas em ISO", u.id === "u1" && u.created_at === now && u.notify_failures === true);
  let dup = null;
  try {
    await pg.insert("users", { id: "u2", public_id: "zzzzzzzzzzzz", email: "a@b.com", password_hash: "x", created_at: now, updated_at: now });
  } catch (e) {
    dup = e;
  }
  check("e-mail duplicado -> UNIQUE_VIOLATION", dup && dup.code === "UNIQUE_VIOLATION");
  check("findOne com IS NULL", (await pg.findOne("users", { email: "a@b.com", deleted_at: null })).id === "u1");
  check("count com operador", (await pg.count("users", { created_at: { lte: now } })) === 1);
  check("findMany com in e orderBy", (await pg.findMany("users", { id: { in: ["u1", "nada"] } }, { orderBy: [["created_at", "desc"]], limit: 5 })).length === 1);
  check("in vazio não quebra", (await pg.findMany("users", { id: { in: [] } })).length === 0);
  check("like", (await pg.count("users", { email: { like: "a@%" } })) === 1);
  const upd = await pg.updateOne("users", { id: "u1" }, { name: "Ana", updated_at: now });
  check("updateOne devolve a linha", upd.name === "Ana");
  check("jsonb (activity.data) grava objeto", (await pg.insert("activity", { id: "ac1", user_id: "u1", kind: "x", message: "m", data: { a: 1 }, created_at: now })).data.a === 1);

  await pg.insert("pinterest_accounts", { id: "acc1", public_id: "acc1acc1acc1", user_id: "u1", pinterest_user_id: "1", created_at: now, updated_at: now });
  for (let i = 0; i < 3; i++) {
    await pg.insert("pins", { id: "p" + i, public_id: "pin" + i + "pinpinpi", user_id: "u1", account_id: "acc1", scheduled_at: now, status: "scheduled", next_attempt_at: now, created_at: now, updated_at: now });
  }
  const [a, b] = await Promise.all([pg.claimDuePins(now, 2), pg.claimDuePins(now, 2)]);
  check("claimDuePins atômico (sem pegar o mesmo pin duas vezes)", a.length + b.length === 3 && new Set(a.concat(b).map((p) => p.id)).size === 3, a.length + "/" + b.length);
  check("pins reivindicados ficam em publishing", (await pg.count("pins", { status: "publishing" })) === 3);
  const stale = new Date(Date.now() + 1000).toISOString();
  check("releaseStalePins devolve à fila", (await pg.releaseStalePins(stale, now)) === 3);
  check("tryAcquireSetting: primeira vez pega", (await pg.tryAcquireSetting("worker_last_run_at", now, new Date(Date.now() - 20000).toISOString())) === true);
  check("tryAcquireSetting: logo depois não pega", (await pg.tryAcquireSetting("worker_last_run_at", new Date().toISOString(), new Date(Date.now() - 20000).toISOString())) === false);
  check("remove com cascata", (await pg.remove("users", { id: "u1" })) === 1 && (await pg.count("pins", {})) === 0);
  await pg.close();

  // 2) Bateria completa da API em cima do Postgres
  console.log("\nBateria da API no Postgres");
  // spawn assíncrono: o Postgres embutido roda neste processo e precisa continuar respondendo.
  const r = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, "test-api.js")], {
      env: Object.assign({}, process.env, { DATABASE_URL: url, DATABASE_SSL: "disable", AUTH_STORE: "" }),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
  const lines = r.stdout.split("\n");
  const summary = lines.filter((l) => /com falha/.test(l)).pop() || "";
  lines.filter((l) => /FALHA|Erro/.test(l)).forEach((l) => console.log(l));
  check("test-api.js passou no Postgres (" + summary.trim() + ")", r.status === 0, r.stderr.slice(0, 500));

  await server.stop();
  await db.close();
  console.log("\n" + passed + " ok, " + failed + " com falha");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("Erro no teste:", e);
  process.exit(1);
});
