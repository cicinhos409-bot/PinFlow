"use strict";

/**
 * Adaptador Postgres (produção). Usa DATABASE_URL (Neon, Supabase, Railway, etc.).
 * Cria/atualiza as tabelas sozinho na primeira chamada (schema.sql + migrações).
 *
 * Implementa a interface descrita em db.js.
 */

const { Pool, types } = require("pg");
const { OPERATORS, assertTable, assertColumn } = require("./db");

// Datas sempre como texto ISO (igual ao adaptador de arquivo); inteiros grandes como número.
types.setTypeParser(1184, (v) => (v ? new Date(v).toISOString() : v)); // timestamptz
types.setTypeParser(1114, (v) => (v ? new Date(v + "Z").toISOString() : v)); // timestamp
types.setTypeParser(20, (v) => (v === null ? null : Number(v))); // bigint

let pool = null;
let ready = null;

function sslOption() {
  const mode = (process.env.DATABASE_SSL || "").toLowerCase();
  if (mode === "disable" || mode === "false") return false;
  if (mode === "no-verify") return { rejectUnauthorized: false };
  // Padrão: TLS com verificação do certificado (Neon, Supabase e Railway têm certificados válidos).
  return { rejectUnauthorized: true };
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslOption(),
      max: Number(process.env.DATABASE_POOL_MAX || 3),
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    });
    pool.on("error", (e) => console.error("[db] erro no pool:", e.message));
  }
  return pool;
}

// Migrações numeradas: a 1 é o schema.sql; as próximas entram aqui como SQL idempotente.
const MIGRATIONS = [
  { version: 1, sql: () => require("./schema") },
];

async function migrate() {
  const client = await getPool().connect();
  try {
    await client.query("CREATE TABLE IF NOT EXISTS migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const done = new Set((await client.query("SELECT version FROM migrations")).rows.map((r) => r.version));
    for (const m of MIGRATIONS) {
      if (done.has(m.version)) continue;
      await client.query("BEGIN");
      try {
        await client.query(m.sql());
        await client.query("INSERT INTO migrations (version) VALUES ($1) ON CONFLICT DO NOTHING", [m.version]);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    client.release();
  }
}

function ensureReady() {
  if (!ready) {
    ready = migrate().catch((e) => {
      ready = null; // tenta de novo na próxima chamada
      throw e;
    });
  }
  return ready;
}

async function query(text, params) {
  await ensureReady();
  try {
    return await getPool().query(text, params);
  } catch (e) {
    if (e && e.code === "23505") {
      const err = new Error("Registro duplicado");
      err.code = "UNIQUE_VIOLATION";
      err.detail = e.detail;
      throw err;
    }
    throw e;
  }
}

/* ---------- Montagem de SQL ---------- */

function buildWhere(where, params) {
  const parts = [];
  for (const col of Object.keys(where || {})) {
    assertColumn(col);
    const cond = where[col];
    if (cond === null) {
      parts.push(`"${col}" IS NULL`);
      continue;
    }
    if (cond !== null && typeof cond === "object" && !Array.isArray(cond)) {
      for (const op of Object.keys(cond)) {
        if (!OPERATORS.has(op)) throw new Error("Operador inválido: " + op);
        const v = cond[op];
        if (op === "notNull") {
          parts.push(`"${col}" IS ${v ? "NOT " : ""}NULL`);
        } else if (op === "in") {
          if (!Array.isArray(v) || v.length === 0) {
            parts.push("FALSE");
          } else {
            params.push(v);
            parts.push(`"${col}" = ANY($${params.length})`);
          }
        } else {
          const sqlOp = { ne: "<>", lt: "<", lte: "<=", gt: ">", gte: ">=", like: "ILIKE" }[op];
          params.push(v);
          parts.push(`"${col}" ${sqlOp} $${params.length}`);
        }
      }
      continue;
    }
    params.push(cond);
    parts.push(`"${col}" = $${params.length}`);
  }
  return parts.length ? " WHERE " + parts.join(" AND ") : "";
}

function buildOrder(orderBy) {
  if (!orderBy || !orderBy.length) return "";
  return (
    " ORDER BY " +
    orderBy
      .map(([col, dir]) => {
        assertColumn(col);
        return `"${col}" ${String(dir).toLowerCase() === "desc" ? "DESC NULLS LAST" : "ASC NULLS LAST"}`;
      })
      .join(", ")
  );
}

function prepareValue(v) {
  if (v !== null && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v)) return JSON.stringify(v);
  return v;
}

/* ---------- Interface ---------- */

module.exports = {
  kind: "postgres",

  async insert(table, row) {
    assertTable(table);
    const cols = Object.keys(row).filter((c) => row[c] !== undefined);
    cols.forEach(assertColumn);
    const params = cols.map((c) => prepareValue(row[c]));
    const sql = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols
      .map((_, i) => "$" + (i + 1))
      .join(", ")}) RETURNING *`;
    return (await query(sql, params)).rows[0];
  },

  async findOne(table, where) {
    assertTable(table);
    const params = [];
    const sql = `SELECT * FROM "${table}"${buildWhere(where, params)} LIMIT 1`;
    return (await query(sql, params)).rows[0] || null;
  },

  async findMany(table, where, opts) {
    assertTable(table);
    const o = opts || {};
    const params = [];
    let sql = `SELECT * FROM "${table}"${buildWhere(where, params)}${buildOrder(o.orderBy)}`;
    if (o.limit) {
      params.push(Number(o.limit));
      sql += ` LIMIT $${params.length}`;
    }
    if (o.offset) {
      params.push(Number(o.offset));
      sql += ` OFFSET $${params.length}`;
    }
    return (await query(sql, params)).rows;
  },

  async count(table, where) {
    assertTable(table);
    const params = [];
    const sql = `SELECT COUNT(*)::int AS n FROM "${table}"${buildWhere(where, params)}`;
    return (await query(sql, params)).rows[0].n;
  },

  async update(table, where, fields) {
    assertTable(table);
    const params = [];
    const sets = Object.keys(fields)
      .filter((c) => fields[c] !== undefined)
      .map((c) => {
        assertColumn(c);
        params.push(prepareValue(fields[c]));
        return `"${c}" = $${params.length}`;
      });
    if (!sets.length) return 0;
    const sql = `UPDATE "${table}" SET ${sets.join(", ")}${buildWhere(where, params)}`;
    return (await query(sql, params)).rowCount;
  },

  async updateOne(table, where, fields) {
    assertTable(table);
    const params = [];
    const sets = Object.keys(fields)
      .filter((c) => fields[c] !== undefined)
      .map((c) => {
        assertColumn(c);
        params.push(prepareValue(fields[c]));
        return `"${c}" = $${params.length}`;
      });
    if (!sets.length) return module.exports.findOne(table, where);
    const sql = `UPDATE "${table}" SET ${sets.join(", ")}${buildWhere(where, params)} RETURNING *`;
    return (await query(sql, params)).rows[0] || null;
  },

  async remove(table, where) {
    assertTable(table);
    const params = [];
    const sql = `DELETE FROM "${table}"${buildWhere(where, params)}`;
    return (await query(sql, params)).rowCount;
  },

  // Pega os pins vencidos e já os marca como "publishing" numa única instrução (sem corrida
  // entre duas execuções do worker: FOR UPDATE SKIP LOCKED).
  async claimDuePins(nowIso, limit) {
    const sql = `
      UPDATE pins SET status = 'publishing', publish_started_at = $1, updated_at = $1
      WHERE id IN (
        SELECT id FROM pins
        WHERE status = 'scheduled' AND deleted_at IS NULL AND next_attempt_at IS NOT NULL AND next_attempt_at <= $1
        ORDER BY next_attempt_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *`;
    return (await query(sql, [nowIso, limit || 10])).rows;
  },

  async releaseStalePins(beforeIso, nowIso) {
    const sql = `UPDATE pins SET status = 'scheduled', next_attempt_at = $2, updated_at = $2
      WHERE status = 'publishing' AND publish_started_at IS NOT NULL AND publish_started_at < $1`;
    return (await query(sql, [beforeIso, nowIso])).rowCount;
  },

  async cleanupAttempts(beforeIso) {
    return (await query("DELETE FROM auth_attempts WHERE at < $1", [beforeIso])).rowCount;
  },

  async getSetting(key) {
    const r = await query("SELECT value FROM settings WHERE key = $1", [key]);
    return r.rows[0] ? r.rows[0].value : null;
  },

  async setSetting(key, value) {
    await query(
      "INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
      [key, value]
    );
  },

  async tryAcquireSetting(key, value, notBeforeIso) {
    const r = await query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
       WHERE settings.value IS NULL OR settings.value <= $3
       RETURNING key`,
      [key, value, notBeforeIso]
    );
    return r.rowCount > 0;
  },

  async close() {
    if (pool) await pool.end();
    pool = null;
    ready = null;
  },
};
