"use strict";

/**
 * Armazenamento em arquivo JSON, só para desenvolvimento e testes locais.
 * Não use em produção: na Vercel o disco não é permanente.
 * O arquivo fica em .data/dev-db.json (ignorado pelo Git).
 *
 * Implementa a mesma interface do db-postgres.js (ver db.js).
 */

const fs = require("fs/promises");
const path = require("path");
const { TABLES, OPERATORS, assertTable, assertColumn } = require("./db");

function filePath() {
  return process.env.AUTH_FILE_PATH || path.join(process.cwd(), ".data", "dev-db.json");
}

function empty() {
  const d = {};
  for (const t of TABLES) d[t] = [];
  return d;
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

// Fila: uma operação por vez, para não corromper o arquivo (e para as operações serem atômicas).
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

/* ---------- Filtro ---------- */

function matches(row, where) {
  for (const col of Object.keys(where || {})) {
    assertColumn(col);
    const cond = where[col];
    const value = row[col] === undefined ? null : row[col];
    if (cond === null) {
      if (value !== null) return false;
      continue;
    }
    if (cond !== null && typeof cond === "object" && !Array.isArray(cond)) {
      for (const op of Object.keys(cond)) {
        if (!OPERATORS.has(op)) throw new Error("Operador inválido: " + op);
        const v = cond[op];
        if (op === "ne" && !(value !== v)) return false;
        if (op === "in" && !(Array.isArray(v) && v.includes(value))) return false;
        if (op === "lt" && !(value !== null && value < v)) return false;
        if (op === "lte" && !(value !== null && value <= v)) return false;
        if (op === "gt" && !(value !== null && value > v)) return false;
        if (op === "gte" && !(value !== null && value >= v)) return false;
        if (op === "notNull" && !(v ? value !== null : value === null)) return false;
        if (op === "like") {
          const re = new RegExp("^" + String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$", "i");
          if (!re.test(String(value === null ? "" : value))) return false;
        }
      }
      continue;
    }
    if (value !== cond) return false;
  }
  return true;
}

function sortRows(rows, orderBy) {
  if (!orderBy || !orderBy.length) return rows;
  const copy = rows.slice();
  copy.sort((a, b) => {
    for (const [col, dir] of orderBy) {
      assertColumn(col);
      const av = a[col] === undefined ? null : a[col];
      const bv = b[col] === undefined ? null : b[col];
      if (av === bv) continue;
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp = av < bv ? -1 : 1;
      return String(dir).toLowerCase() === "desc" ? -cmp : cmp;
    }
    return 0;
  });
  return copy;
}

function clone(row) {
  return row ? JSON.parse(JSON.stringify(row)) : row;
}

/* ---------- Interface ---------- */

const UNIQUE = {
  users: [["email"], ["public_id"]],
  sessions: [["token_hash"]],
  auth_tokens: [["token_hash"]],
  pinterest_accounts: [["public_id"], ["user_id", "pinterest_user_id"]],
  boards: [["account_id", "pinterest_board_id"]],
  media: [["public_id"]],
  pins: [["public_id"]],
  settings: [["key"]],
  pin_metrics: [["pin_id", "period"]],
  account_metrics: [["account_id", "period"]],
};

function checkUnique(d, table, row, ignoreId) {
  for (const cols of UNIQUE[table] || []) {
    if (cols.some((c) => row[c] === undefined || row[c] === null)) continue;
    const dup = d[table].find((r) => r.id !== ignoreId && cols.every((c) => r[c] === row[c]));
    if (dup) {
      const e = new Error("Registro duplicado em " + table + " (" + cols.join(", ") + ")");
      e.code = "UNIQUE_VIOLATION";
      e.columns = cols;
      throw e;
    }
  }
}

let seq = 0;

module.exports = {
  kind: "file",

  insert: (table, row) =>
    run((d) => {
      assertTable(table);
      const copy = clone(row);
      if (table === "auth_attempts" && copy.id === undefined) copy.id = ++seq + "-" + Date.now();
      checkUnique(d, table, copy);
      d[table].push(copy);
      return clone(copy);
    }, true),

  findOne: (table, where) =>
    run((d) => {
      assertTable(table);
      return clone(d[table].find((r) => matches(r, where)) || null);
    }),

  findMany: (table, where, opts) =>
    run((d) => {
      assertTable(table);
      const o = opts || {};
      let rows = d[table].filter((r) => matches(r, where));
      rows = sortRows(rows, o.orderBy);
      const offset = o.offset || 0;
      rows = rows.slice(offset, o.limit ? offset + o.limit : undefined);
      return rows.map(clone);
    }),

  count: (table, where) =>
    run((d) => {
      assertTable(table);
      return d[table].filter((r) => matches(r, where)).length;
    }),

  update: (table, where, fields) =>
    run((d) => {
      assertTable(table);
      let n = 0;
      for (const r of d[table]) {
        if (!matches(r, where)) continue;
        const next = Object.assign({}, r, clone(fields));
        checkUnique(d, table, next, r.id);
        Object.assign(r, clone(fields));
        n++;
      }
      return n;
    }, true),

  updateOne: (table, where, fields) =>
    run((d) => {
      assertTable(table);
      const r = d[table].find((x) => matches(x, where));
      if (!r) return null;
      const next = Object.assign({}, r, clone(fields));
      checkUnique(d, table, next, r.id);
      Object.assign(r, clone(fields));
      return clone(r);
    }, true),

  remove: (table, where) =>
    run((d) => {
      assertTable(table);
      const before = d[table].length;
      d[table] = d[table].filter((r) => !matches(r, where));
      const n = before - d[table].length;
      if (n && table === "users") cascadeUsers(d);
      if (n && table === "pinterest_accounts") cascadeAccounts(d);
      return n;
    }, true),

  claimDuePins: (nowIso, limit) =>
    run((d) => {
      const due = sortRows(
        d.pins.filter((p) => p.status === "scheduled" && !p.deleted_at && p.next_attempt_at && p.next_attempt_at <= nowIso),
        [["next_attempt_at", "asc"]]
      ).slice(0, limit || 10);
      for (const p of due) {
        p.status = "publishing";
        p.publish_started_at = nowIso;
        p.updated_at = nowIso;
      }
      return due.map(clone);
    }, true),

  releaseStalePins: (beforeIso, nowIso) =>
    run((d) => {
      let n = 0;
      for (const p of d.pins) {
        if (p.status === "publishing" && p.publish_started_at && p.publish_started_at < beforeIso) {
          p.status = "scheduled";
          p.next_attempt_at = nowIso;
          p.updated_at = nowIso;
          n++;
        }
      }
      return n;
    }, true),

  cleanupAttempts: (beforeIso) =>
    run((d) => {
      const before = d.auth_attempts.length;
      d.auth_attempts = d.auth_attempts.filter((a) => a.at >= beforeIso);
      return before - d.auth_attempts.length;
    }, true),

  getSetting: (key) =>
    run((d) => {
      const s = d.settings.find((x) => x.key === key);
      return s ? s.value : null;
    }),

  setSetting: (key, value) =>
    run((d) => {
      const now = new Date().toISOString();
      const s = d.settings.find((x) => x.key === key);
      if (s) {
        s.value = value;
        s.updated_at = now;
      } else d.settings.push({ key, value, updated_at: now });
    }, true),

  // Grava value na chave só se o valor atual for mais antigo que notBeforeIso (ou não existir).
  tryAcquireSetting: (key, value, notBeforeIso) =>
    run((d) => {
      const s = d.settings.find((x) => x.key === key);
      if (s && s.value && s.value > notBeforeIso) return false;
      const now = new Date().toISOString();
      if (s) {
        s.value = value;
        s.updated_at = now;
      } else d.settings.push({ key, value, updated_at: now });
      return true;
    }, true),
};

// Simula o ON DELETE CASCADE do Postgres.
function cascadeUsers(d) {
  const ids = new Set(d.users.map((u) => u.id));
  for (const t of ["sessions", "auth_tokens", "pinterest_accounts", "boards", "media", "pins", "activity", "pin_metrics", "account_metrics"]) {
    d[t] = d[t].filter((r) => ids.has(r.user_id));
  }
}
function cascadeAccounts(d) {
  const ids = new Set(d.pinterest_accounts.map((a) => a.id));
  d.boards = d.boards.filter((b) => ids.has(b.account_id));
  d.pins = d.pins.filter((p) => ids.has(p.account_id));
  d.account_metrics = d.account_metrics.filter((m) => ids.has(m.account_id));
  const pinIds = new Set(d.pins.map((p) => p.id));
  d.pin_metrics = d.pin_metrics.filter((m) => pinIds.has(m.pin_id));
}
