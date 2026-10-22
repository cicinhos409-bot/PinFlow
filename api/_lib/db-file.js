"use strict";

/**
 * Armazenamento em arquivo JSON, só para desenvolvimento e testes locais.
 * Não use em produção: na Vercel o disco não é permanente.
 * O arquivo fica em .data/dev-db.json (ignorado pelo Git).
 */

const fs = require("fs/promises");
const path = require("path");

function filePath() {
  return process.env.AUTH_FILE_PATH || path.join(process.cwd(), ".data", "dev-db.json");
}

function empty() {
  return { users: [], sessions: [], attempts: [] };
}

async function load() {
  try {
    return Object.assign(empty(), JSON.parse(await fs.readFile(filePath(), "utf8")));
  } catch (e) {
    if (e.code === "ENOENT") return empty();
    throw e;
  }
}

async function save(data) {
  const file = filePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + "." + process.pid + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  await fs.rename(tmp, file);
}

// Fila: uma operação por vez, para não corromper o arquivo.
let queue = Promise.resolve();
function run(fn, write) {
  const job = queue.then(async () => {
    const data = await load();
    const out = await fn(data);
    if (write) await save(data);
    return out;
  });
  queue = job.catch(() => {});
  return job;
}

module.exports = {
  kind: "file",

  findUserByEmail: (email) => run((d) => d.users.find((u) => u.email === email && !u.deleted_at) || null),

  findUserById: (id) => run((d) => d.users.find((u) => u.id === id && !u.deleted_at) || null),

  createUser: (user) =>
    run((d) => {
      if (d.users.some((u) => u.email === user.email)) {
        const e = new Error("E-mail já cadastrado");
        e.code = "EMAIL_TAKEN";
        throw e;
      }
      d.users.push(user);
      return user;
    }, true),

  updateUser: (id, fields, iso) =>
    run((d) => {
      const u = d.users.find((x) => x.id === id);
      if (!u) return null;
      Object.assign(u, fields, { updated_at: iso });
      return u;
    }, true),

  revokeOtherSessions: (userId, keepSessionId, iso) =>
    run((d) => {
      for (const s of d.sessions) {
        if (s.user_id === userId && s.id !== keepSessionId && !s.revoked_at) s.revoked_at = iso;
      }
    }, true),

  touchLogin: (id, iso) =>
    run((d) => {
      const u = d.users.find((x) => x.id === id);
      if (u) {
        u.last_login_at = iso;
        u.updated_at = iso;
      }
    }, true),

  createSession: (session) =>
    run((d) => {
      d.sessions.push(session);
      return session;
    }, true),

  findSessionByTokenHash: (hash) => run((d) => d.sessions.find((s) => s.token_hash === hash) || null),

  revokeSession: (id, iso) =>
    run((d) => {
      const s = d.sessions.find((x) => x.id === id);
      if (s && !s.revoked_at) s.revoked_at = iso;
    }, true),

  recordAttempt: (key, ms) =>
    run((d) => {
      d.attempts.push({ key, at: ms });
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      d.attempts = d.attempts.filter((a) => a.at >= cutoff);
    }, true),

  countAttempts: (key, sinceMs) => run((d) => d.attempts.filter((a) => a.key === key && a.at >= sinceMs).length),
};
