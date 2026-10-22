# Etapa 02: Usuários e autenticação

**Objetivo:** cadastro e login de quem usa a plataforma (os clientes do SaaS). Isto é separado do login do Pinterest, que é a etapa 03.

> Se for usado um serviço de autenticação pronto, parte destas tabelas (sessões, verificação, redefinição) fica por conta dele. Mesmo assim `users` continua existindo aqui, com o `auth_provider_id`.

## Tabela `users`

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `id` | id único | sim | |
| `email` | texto | sim | Minúsculas, **único** |
| `email_verified_at` | data/hora | não | Vazio = ainda não confirmou |
| `password_hash` | texto | não | Senha com hash forte e lento (nunca a senha em si). Vazio se usar login externo. |
| `auth_provider_id` | texto | não | Referência, se houver serviço de autenticação |
| `name` | texto | não | |
| `timezone` | texto | sim | Padrão `America/Sao_Paulo`. Usado para interpretar horários de agendamento. |
| `locale` | texto | sim | Padrão `pt-BR` |
| `role` | texto (lista) | sim | `user`, `admin` |
| `status` | texto (lista) | sim | `active`, `suspended`, `deleted` |
| `last_login_at` | data/hora | não | |
| `terms_version` | texto | sim | Versão dos Termos aceita |
| `privacy_version` | texto | sim | Versão da Política aceita |
| `deleted_at` | data/hora | não | Exclusão lógica |
| `created_at` / `updated_at` | data/hora | sim | |

## Tabela `sessions`

| Campo | Tipo | Observação |
|---|---|---|
| `id` | id único | |
| `user_id` | id | → `users` |
| `token_hash` | texto | Guardar só o hash do token da sessão |
| `user_agent` | texto | Para o usuário ver "onde estou logado" |
| `ip_hash` | texto | IP embaralhado |
| `expires_at` | data/hora | |
| `revoked_at` | data/hora | Para encerrar sessão |
| `created_at` | data/hora | |

## Tabela `email_verifications`

| Campo | Tipo | Observação |
|---|---|---|
| `id` | id único | |
| `user_id` | id | → `users` |
| `token_hash` | texto | Hash do código/link enviado |
| `expires_at` | data/hora | Curta duração |
| `used_at` | data/hora | Preenchido ao usar (uso único) |

## Tabela `password_resets`

Mesma estrutura de `email_verifications`, com `expires_at` ainda mais curto e uso único.

## Regras

- E-mail verificado é exigido antes de conectar contas do Pinterest (barra criação em massa de contas falsas, e o Pinterest recomenda esse tipo de barreira).
- Limitar tentativas de login por e-mail e por IP.
- Nunca informar "esse e-mail não existe" na recuperação de senha.
- Encerrar todas as sessões ao trocar a senha.
- Registrar no `audit_log` (doc 10): login, troca de senha, troca de e-mail.

## Índices

- Único em `users.email`
- `sessions.user_id`, `sessions.expires_at`
- `email_verifications.token_hash`, `password_resets.token_hash`

## Tentativas de login e cadastro (limite de abuso)
Tabela `auth_attempts`: `id`, `kind` (login|register), `email_key` (e-mail normalizado, nulo no cadastro), `ip_hash` (HMAC, nunca o IP puro), `success` (bool), `created_at`. Índices em (`kind`, `email_key`, `ip_hash`, `created_at`). Apagar linhas com mais de 24 h.

## Id público (URLs)
Coluna `public_id` em `users`: texto de 12 caracteres, aleatório, único (índice único). É o id que aparece em `/app/dashboard/<id>`. O `id` interno (UUID) nunca sai do servidor.

## Tokens por e-mail
Tabela `auth_tokens`: `id`, `user_id`, `kind` (`reset_password` | `verify_email`), `token_hash` (SHA-256; o token nunca é guardado), `expires_at`, `used_at`, `created_at`. Redefinir senha vale 60 min; confirmar e-mail, 48 h.

## Preferências no usuário
`timezone` (padrão America/Sao_Paulo), `notify_failures`, `notify_token_expiry`, `email_verified_at`.

## Esquema real
O SQL definitivo está em `api/_lib/schema.sql` e é aplicado automaticamente na primeira requisição.
