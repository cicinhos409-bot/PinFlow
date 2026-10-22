"use strict";

/**
 * Camada de dados do sistema de contas.
 *
 * O banco de dados ainda não foi escolhido. Todo o código de contas conversa só com
 * o objeto devolvido por getDb(). Para ligar um banco de verdade, crie um arquivo
 * (ex.: db-postgres.js) que implemente os mesmos métodos do db-file.js e libere-o abaixo.
 *
 * Métodos que o banco precisa ter (todos assíncronos):
 *   findUserByEmail(email)            -> usuário ou null
 *   findUserById(id)                  -> usuário ou null
 *   createUser(user)                  -> usuário (lança erro com code "EMAIL_TAKEN" se o e-mail já existir)
 *   updateUser(userId, fields, isoDate) -> altera campos do usuário (nome, senha...)
 *   revokeOtherSessions(userId, keepSessionId, isoDate) -> encerra as outras sessões (troca de senha)
 *   touchLogin(userId, isoDate)       -> grava o último login
 *   createSession(session)            -> grava a sessão (só o HASH do token)
 *   findSessionByTokenHash(hash)      -> sessão ou null
 *   revokeSession(sessionId, isoDate) -> encerra a sessão
 *   recordAttempt(key, timestampMs)   -> registra uma tentativa (limite de tentativas)
 *   countAttempts(key, sinceMs)       -> quantas tentativas desde o instante informado
 *
 * Campos e regras: docs/banco-de-dados/02-usuarios-e-autenticacao.md
 */

function notConfigured() {
  const e = new Error("Banco de dados não configurado");
  e.code = "DB_NOT_CONFIGURED";
  return e;
}

function getDb() {
  // Armazenamento em arquivo: SOMENTE para testes na máquina local.
  // Nunca é liberado na Vercel, mesmo que a variável seja definida por engano.
  if (process.env.AUTH_STORE === "file" && !process.env.VERCEL) {
    return require("./db-file");
  }

  // Futuro: if (process.env.DATABASE_URL) return require("./db-postgres");

  throw notConfigured();
}

module.exports = { getDb };
