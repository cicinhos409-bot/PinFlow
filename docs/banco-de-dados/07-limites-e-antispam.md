# Etapa 07: Limites e proteção contra spam

**Objetivo:** impedir que algum cliente derrube o app inteiro.

Por que isto é crítico: o Pinterest dá **strikes ao app** quando detecta spam publicado por ele. **Com 3 strikes, o app é banido** e os outros apps da mesma conta ficam suspensos. Como todos os clientes usam o mesmo app, o abuso de um pode afetar todos. Por isso os limites precisam existir **desde a primeira versão**.

## Tabela `account_limits`

Limites por conta do Pinterest conectada. Os valores padrão vêm do plano (doc 09) e podem ser ajustados por conta.

| Campo | Tipo | Observação |
|---|---|---|
| `pinterest_account_id` | id | → `pinterest_accounts` (um registro por conta) |
| `max_pins_per_day` | número | Teto diário |
| `max_pins_per_week` | número | Teto semanal |
| `min_interval_minutes` | número | Intervalo mínimo entre dois pins da mesma conta |
| `max_pins_per_hour` | número | |
| `max_same_link_per_day` | número | Evita repetir o mesmo link demais |
| `warmup_until` | data/hora | Conta nova: começa com limites menores e vai subindo |
| `updated_at` | data/hora | |

> Valores concretos ficam para definir com testes reais. Começar conservador.

## Tabela `usage_counters`

Contadores para checar limites rápido sem varrer tudo.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | id único | |
| `scope` | texto (lista) | `account`, `user`, `app` |
| `scope_id` | id | Conta, usuário ou "app" |
| `window` | texto (lista) | `hour`, `day`, `week`, `month` |
| `window_start` | data/hora | Início da janela |
| `pins_published` | número | |
| `api_calls` | número | Para respeitar o limite de chamadas do Pinterest (Trial: por dia; Standard: por minuto) |

## Tabela `content_fingerprints`

Detecta conteúdo repetido.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | id único | |
| `user_id` | id | |
| `pinterest_account_id` | id | |
| `fingerprint` | texto | Hash combinando título + descrição + link (e/ou hash do arquivo) |
| `media_hash` | texto | Hash da mídia |
| `pin_id` | id | → `pins` |
| `created_at` | data/hora | |

## Tabela `app_strikes`

Registro do que o Pinterest avisou sobre spam no app.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | id único | |
| `received_at` | data/hora | Quando o e-mail/aviso chegou |
| `summary` | texto | O que foi dito |
| `suspected_user_id` | id | Usuário que provavelmente originou (se identificado) |
| `suspected_account_id` | id | |
| `action_taken` | texto | Ex.: conta pausada, usuário suspenso |
| `appeal_status` | texto (lista) | `none`, `sent`, `accepted`, `rejected` |

## Regras de proteção (o banco precisa dar suporte a todas)

1. **Limite por conta** (hora, dia, semana) e **intervalo mínimo** entre pins.
2. **Aquecimento** de contas novas: volume baixo no início.
3. **Duplicados:** bloquear ou alertar quando título + descrição + link forem iguais a pins recentes da mesma conta, ou quando o arquivo for idêntico.
4. **Limite por usuário** (somando todas as contas) vindo do plano.
5. **Limite global do app**, para ficar abaixo dos limites de chamadas do Pinterest.
6. **Cadastro:** e-mail verificado e tempo entre cadastro e primeira publicação (se for poucos segundos, tratar como suspeito).
7. **Suspensão rápida:** poder pausar uma conta ou um usuário inteiro sem apagar dados (`status = suspended`).
8. **Rastro:** saber, para cada pin publicado, qual usuário e qual conta o criaram (via `pins` e `publish_attempts`), para identificar a origem de um strike.

## Índices

- `usage_counters`: (`scope`, `scope_id`, `window`, `window_start`) único
- `content_fingerprints`: (`pinterest_account_id`, `fingerprint`), `media_hash`
