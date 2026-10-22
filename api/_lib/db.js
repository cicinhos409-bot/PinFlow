"use strict";

/**
 * Camada de dados da plataforma.
 *
 * Todo o código conversa só com o objeto devolvido por getDb(). Há dois adaptadores com a
 * mesma interface:
 *   - db-postgres.js  -> produção (DATABASE_URL). Cria as tabelas sozinho (schema.js).
 *   - db-file.js      -> SOMENTE testes locais (AUTH_STORE=file). Recusado na Vercel.
 *
 * Interface (todos os métodos são assíncronos):
 *   insert(table, row)                           -> row
 *   findOne(table, where)                        -> row | null
 *   findMany(table, where, { orderBy, limit, offset }) -> row[]
 *   count(table, where)                          -> number
 *   update(table, where, fields)                 -> número de linhas alteradas
 *   updateOne(table, where, fields)              -> linha alterada | null
 *   remove(table, where)                         -> número de linhas apagadas
 *   claimDuePins(nowIso, limit)                  -> pins que venceram, já marcados como "publishing" (atômico)
 *   releaseStalePins(beforeIso, nowIso)          -> devolve à fila pins presos em "publishing"
 *   cleanupAttempts(beforeIso)                   -> apaga tentativas antigas
 *   getSetting(key) / setSetting(key, value)
 *   tryAcquireSetting(key, value, notBeforeIso)  -> true se conseguiu (trava simples para o worker)
 *
 * "where" aceita: { col: valor }, { col: null } (IS NULL), e operadores
 *   { col: { ne, in, lt, lte, gt, gte, notNull: true, like } }.
 * "orderBy" é uma lista: [["created_at", "desc"], ["id", "asc"]].
 *
 * Campos e regras: docs/banco-de-dados/*.md
 */

const TABLES = new Set([
  "users",
  "sessions",
  "auth_attempts",
  "auth_tokens",
  "pinterest_accounts",
  "boards",
  "media",
  "pins",
  "activity",
  "settings",
  "pin_metrics",
  "account_metrics",
]);

const OPERATORS = new Set(["ne", "in", "lt", "lte", "gt", "gte", "notNull", "like"]);

function assertTable(table) {
  if (!TABLES.has(table)) {
    const e = new Error("Tabela desconhecida: " + table);
    e.code = "BAD_TABLE";
    throw e;
  }
}

function assertColumn(name) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    const e = new Error("Coluna inválida: " + name);
    e.code = "BAD_COLUMN";
    throw e;
  }
}

function notConfigured() {
  const e = new Error("Banco de dados não configurado");
  e.code = "DB_NOT_CONFIGURED";
  return e;
}

let cached = null;

function getDb() {
  if (cached) return cached;

  if (process.env.DATABASE_URL) {
    cached = require("./db-postgres");
    return cached;
  }

  // Armazenamento em arquivo: SOMENTE para testes na máquina local.
  // Nunca é liberado na Vercel, mesmo que a variável seja definida por engano.
  if (process.env.AUTH_STORE === "file" && !process.env.VERCEL) {
    cached = require("./db-file");
    return cached;
  }

  throw notConfigured();
}

// Usado nos testes para trocar o modo entre uma chamada e outra.
function resetDbCache() {
  cached = null;
}

function isConfigured() {
  try {
    getDb();
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { getDb, resetDbCache, isConfigured, TABLES, OPERATORS, assertTable, assertColumn };
