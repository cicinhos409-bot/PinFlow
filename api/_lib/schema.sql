-- Esquema do banco (Postgres). Aplicado automaticamente pela plataforma na primeira
-- requisição (api/_lib/db-postgres.js). Todas as instruções são idempotentes.
-- Datas em timestamptz; ids gerados pela aplicação (texto).

CREATE TABLE IF NOT EXISTS migrations (
  version    integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id                  text PRIMARY KEY,
  public_id           text NOT NULL UNIQUE,
  email               text NOT NULL UNIQUE,
  password_hash       text NOT NULL,
  name                text NOT NULL DEFAULT '',
  timezone            text NOT NULL DEFAULT 'America/Sao_Paulo',
  locale              text NOT NULL DEFAULT 'pt-BR',
  role                text NOT NULL DEFAULT 'user',
  status              text NOT NULL DEFAULT 'active',
  email_verified_at   timestamptz,
  terms_version       text,
  privacy_version     text,
  notify_failures     boolean NOT NULL DEFAULT true,
  notify_token_expiry boolean NOT NULL DEFAULT true,
  last_login_at       timestamptz,
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL,
  updated_at          timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id           text PRIMARY KEY,
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  user_agent   text,
  ip_hash      text,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  last_seen_at timestamptz,
  created_at   timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

-- Tentativas (login, cadastro, recuperação): só chaves com hash, nunca o IP puro.
CREATE TABLE IF NOT EXISTS auth_attempts (
  id  bigserial PRIMARY KEY,
  key text NOT NULL,
  at  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_attempts_key_idx ON auth_attempts (key, at);

-- Tokens enviados por e-mail (redefinir senha, confirmar e-mail). Só o hash fica guardado.
CREATE TABLE IF NOT EXISTS auth_tokens (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS pinterest_accounts (
  id                 text PRIMARY KEY,
  public_id          text NOT NULL UNIQUE,
  user_id            text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pinterest_user_id  text NOT NULL,
  username           text,
  display_name       text,
  profile_image      text,
  account_type       text,
  website_url        text,
  access_token_enc   text,
  refresh_token_enc  text,
  token_expires_at   timestamptz,
  refresh_expires_at timestamptz,
  scopes             text,
  status             text NOT NULL DEFAULT 'active',
  daily_limit        integer NOT NULL DEFAULT 25,
  label              text,
  last_synced_at     timestamptz,
  last_error         text,
  created_at         timestamptz NOT NULL,
  updated_at         timestamptz NOT NULL,
  deleted_at         timestamptz,
  UNIQUE (user_id, pinterest_user_id)
);

CREATE TABLE IF NOT EXISTS boards (
  id                 text PRIMARY KEY,
  account_id         text NOT NULL REFERENCES pinterest_accounts(id) ON DELETE CASCADE,
  user_id            text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pinterest_board_id text NOT NULL,
  name               text NOT NULL,
  description        text,
  privacy            text,
  pin_count          integer,
  image_cover_url    text,
  is_ads_only        boolean NOT NULL DEFAULT false,
  synced_at          timestamptz,
  created_at         timestamptz NOT NULL,
  updated_at         timestamptz NOT NULL,
  UNIQUE (account_id, pinterest_board_id)
);

CREATE TABLE IF NOT EXISTS media (
  id           text PRIMARY KEY,
  public_id    text NOT NULL UNIQUE,
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         text NOT NULL,
  url          text NOT NULL,
  storage_key  text,
  filename     text,
  content_type text,
  size         bigint,
  width        integer,
  height       integer,
  duration_ms  integer,
  created_at   timestamptz NOT NULL,
  deleted_at   timestamptz
);
CREATE INDEX IF NOT EXISTS media_user_idx ON media (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pins (
  id                  text PRIMARY KEY,
  public_id           text NOT NULL UNIQUE,
  user_id             text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id          text NOT NULL REFERENCES pinterest_accounts(id) ON DELETE CASCADE,
  board_id            text REFERENCES boards(id) ON DELETE SET NULL,
  media_id            text REFERENCES media(id) ON DELETE SET NULL,
  cover_media_id      text REFERENCES media(id) ON DELETE SET NULL,
  title               text,
  description         text,
  link                text,
  alt_text            text,
  scheduled_at        timestamptz NOT NULL,
  status              text NOT NULL,
  attempts            integer NOT NULL DEFAULT 0,
  next_attempt_at     timestamptz,
  pinterest_pin_id    text,
  pinterest_url       text,
  pinterest_media_id  text,
  error_code          text,
  error_message       text,
  publish_started_at  timestamptz,
  published_at        timestamptz,
  canceled_at         timestamptz,
  created_at          timestamptz NOT NULL,
  updated_at          timestamptz NOT NULL,
  deleted_at          timestamptz
);
CREATE INDEX IF NOT EXISTS pins_queue_idx ON pins (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS pins_user_idx ON pins (user_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS pins_account_idx ON pins (account_id, published_at);

CREATE TABLE IF NOT EXISTS activity (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id text,
  pin_id     text,
  kind       text NOT NULL,
  message    text NOT NULL,
  data       jsonb,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_user_idx ON activity (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz
);
