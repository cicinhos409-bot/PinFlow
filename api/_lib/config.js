"use strict";

/**
 * Configurações do sistema de contas.
 * Os valores aqui são regras de produto e de segurança: mudar com cuidado.
 */
module.exports = {
  COOKIE_NAME: "pf_session",
  SESSION_DAYS: 30,

  PASSWORD_MIN: 8,
  PASSWORD_MAX: 128,

  // Versões dos documentos aceitos no cadastro (trocar quando os textos finais forem publicados)
  TERMS_VERSION: "rascunho-2026-10-22",
  PRIVACY_VERSION: "rascunho-2026-10-22",

  // Limites de tentativas
  LOGIN_WINDOW_MS: 15 * 60 * 1000,
  LOGIN_MAX_FAILS_PER_ACCOUNT: 5, // por e-mail + IP
  LOGIN_MAX_FAILS_PER_IP: 20,
  REGISTER_WINDOW_MS: 60 * 60 * 1000,
  REGISTER_MAX_PER_IP: 10,

  BODY_LIMIT_BYTES: 10 * 1024,
};
