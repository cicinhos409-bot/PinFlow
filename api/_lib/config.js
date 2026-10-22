"use strict";

/**
 * Configurações da plataforma.
 * Os valores aqui são regras de produto e de segurança: mudar com cuidado.
 * Segredos e chaves NUNCA ficam aqui: vão em variáveis de ambiente (ver .env.example).
 */
module.exports = {
  /* ---------- Contas e sessão ---------- */
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
  FORGOT_WINDOW_MS: 60 * 60 * 1000,
  FORGOT_MAX_PER_IP: 10,

  // Tokens enviados por e-mail
  RESET_TOKEN_MINUTES: 60,
  VERIFY_TOKEN_HOURS: 48,

  BODY_LIMIT_BYTES: 64 * 1024,

  /* ---------- Pinterest ---------- */
  PINTEREST_OAUTH_URL: process.env.PINTEREST_OAUTH_URL || "https://www.pinterest.com/oauth/",
  PINTEREST_API_BASE: process.env.PINTEREST_API_BASE || "https://api.pinterest.com/v5",
  // Escopos pedidos no login oficial. Os de "secret" (pastas secretas) só se PINTEREST_SCOPES for definido.
  PINTEREST_SCOPES: process.env.PINTEREST_SCOPES || "boards:read boards:write pins:read pins:write user_accounts:read",
  OAUTH_STATE_COOKIE: "pf_oauth",
  OAUTH_STATE_MINUTES: 15,
  // Renova o token de acesso quando faltar menos que isto para expirar
  TOKEN_REFRESH_BEFORE_MS: 3 * 24 * 60 * 60 * 1000,
  // Avisa que o token de renovação vai vencer quando faltar menos que isto
  REFRESH_WARN_BEFORE_MS: 7 * 24 * 60 * 60 * 1000,

  /* ---------- Limites de publicação (proteção contra spam) ---------- */
  // A Pinterest pune o app inteiro por spam. Estes limites protegem todos os usuários.
  ACCOUNT_DAILY_LIMIT_DEFAULT: 25,
  ACCOUNT_DAILY_LIMIT_MAX: 100,
  MIN_SECONDS_BETWEEN_PINS_SAME_ACCOUNT: Number(process.env.PF_MIN_GAP_SECONDS || 60),
  MAX_ACCOUNTS_PER_USER: 20,
  MAX_PINS_PER_CREATE: 20, // várias contas de uma vez

  /* ---------- Pins ---------- */
  PIN_TITLE_MAX: 100,
  PIN_DESCRIPTION_MAX: 800,
  PIN_ALT_TEXT_MAX: 500,
  PIN_LINK_MAX: 2048,
  SCHEDULE_MAX_DAYS_AHEAD: 365,

  /* ---------- Mídia ---------- */
  IMAGE_TYPES: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  VIDEO_TYPES: ["video/mp4", "video/quicktime", "video/x-m4v"],
  IMAGE_MAX_BYTES: 20 * 1024 * 1024,
  VIDEO_MAX_BYTES: 200 * 1024 * 1024,
  MEDIA_PER_USER_MAX: 2000,

  /* ---------- Análises (métricas da Pinterest) ---------- */
  ANALYTICS_PERIODS: [7, 14, 30, 90],
  get ANALYTICS_CACHE_MS() { return process.env.PF_ANALYTICS_CACHE_MS !== undefined ? Number(process.env.PF_ANALYTICS_CACHE_MS) : 6 * 60 * 60 * 1000; }, // dados valem 6 h
  ANALYTICS_REFRESH_BUDGET: 25, // chamadas à Pinterest por carregamento da tela (Trial: 1.000/dia por app)
  ANALYTICS_MANUAL_COOLDOWN_MS: Number(process.env.PF_ANALYTICS_COOLDOWN_MS || 30 * 60 * 1000),
  ANALYTICS_DAILY_BUDGET: 200, // pins atualizados pela manutenção diária

  /* ---------- Fila de publicação ---------- */
  WORKER_BATCH: 10,
  WORKER_MIN_INTERVAL_MS: Number(process.env.PF_WORKER_MIN_INTERVAL_MS || 20 * 1000), // intervalo mínimo entre execuções disparadas pelo navegador
  WORKER_STALE_PUBLISHING_MS: 15 * 60 * 1000, // "publicando" há mais que isso = travou; volta para a fila
  PUBLISH_MAX_ATTEMPTS: 3,
  PUBLISH_RETRY_DELAYS_MS: [5 * 60 * 1000, 20 * 60 * 1000, 60 * 60 * 1000],
  MEDIA_POLL_MAX_MS: 90 * 1000,
  MEDIA_POLL_INTERVAL_MS: Number(process.env.PF_MEDIA_POLL_MS || 3000),
};
