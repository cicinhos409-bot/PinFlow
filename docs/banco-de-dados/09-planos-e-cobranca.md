# Etapa 09: Planos e cobrança

**Objetivo:** controlar o que cada usuário pode usar (limites do plano) e acompanhar assinatura e pagamentos.

O provedor de cobrança ainda não foi escolhido. A estrutura abaixo funciona com qualquer um: o provedor guarda os dados de cartão, e o nosso banco guarda só **referências** e o **estado da assinatura**.

## Tabela `plans`

| Campo | Tipo | Observação |
|---|---|---|
| `id` | id único | |
| `code` | texto | `teste`, `pro`, `agencia` (único) |
| `name` | texto | Nome exibido |
| `price_cents` | número | Valor em centavos |
| `currency` | texto | `BRL` |
| `billing_interval` | texto (lista) | `month`, `year` |
| `max_pinterest_accounts` | número | Quantas contas pode conectar |
| `max_pins_per_day_per_account` | número | Valor padrão que alimenta `account_limits` (doc 07) |
| `max_pins_per_month` | número | Total mensal, se houver |
| `max_team_members` | número | Para o plano Agência |
| `features` | dados flexíveis (JSON) | Ex.: métricas, lote, vídeo |
| `is_active` | booleano | Planos antigos continuam existindo para quem já assina |
| `provider_price_id` | texto | ID do preço no provedor |

> Valores e limites reais **ainda não foram definidos**. A landing mostra "Em breve".

## Tabela `subscriptions`

| Campo | Tipo | Observação |
|---|---|---|
| `id` | id único | |
| `user_id` | id | → `users` |
| `plan_id` | id | → `plans` |
| `status` | texto (lista) | `trialing`, `active`, `past_due`, `canceled`, `expired` |
| `trial_ends_at` | data/hora | |
| `current_period_start` / `current_period_end` | data/hora | |
| `cancel_at_period_end` | booleano | |
| `canceled_at` | data/hora | |
| `provider` | texto | Nome do provedor |
| `provider_customer_id` | texto | Cliente no provedor |
| `provider_subscription_id` | texto | Assinatura no provedor |
| `created_at` / `updated_at` | data/hora | |

## Tabela `invoices`

| Campo | Tipo | Observação |
|---|---|---|
| `id` | id único | |
| `subscription_id` | id | |
| `user_id` | id | |
| `amount_cents` | número | |
| `currency` | texto | |
| `status` | texto (lista) | `open`, `paid`, `failed`, `refunded` |
| `paid_at` | data/hora | |
| `provider_invoice_id` | texto | |
| `receipt_url` | texto | Se o provedor fornecer |
| `created_at` | data/hora | |

## Tabela `billing_events`

Registro bruto dos avisos (webhooks) do provedor, para evitar processar o mesmo aviso duas vezes e para investigar problemas.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | id único | |
| `provider_event_id` | texto | **Único** (idempotência) |
| `type` | texto | |
| `payload` | dados flexíveis (JSON) | |
| `processed_at` | data/hora | |
| `error` | texto | |

## Regras

- **Nunca** guardar número de cartão, CVV ou dados completos de pagamento.
- Aviso do provedor deve ter a **assinatura verificada** antes de ser aceito.
- Ao trocar de plano, aplicar os novos limites e reavaliar contas conectadas. Se o novo plano permitir menos contas, pedir ao usuário qual manter (não desconectar sozinho).
- `past_due` (pagamento falhou): período de tolerância e depois **pausar** a fila, sem apagar dados.
- Cancelamento: manter acesso até `current_period_end`.
- Lista de espera → convite → plano de teste: ligar com `waitlist_entries.converted_user_id`.

## Índices

- `subscriptions.user_id`, `subscriptions.status`
- Único em `billing_events.provider_event_id`
