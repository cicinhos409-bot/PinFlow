# Etapa 04: Boards e seções

**Objetivo:** guardar uma cópia (cache) dos boards de cada conta conectada, para o usuário escolher onde cada pin será salvo sem consultar o Pinterest toda hora.

A fonte da verdade é o Pinterest. Esta tabela é um espelho que pode ficar desatualizado, por isso há `last_synced_at`.

## Tabela `boards`

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `id` | id único | sim | |
| `pinterest_account_id` | id | sim | → `pinterest_accounts` |
| `pinterest_board_id` | texto | sim | ID do board no Pinterest (fixo e único) |
| `name` | texto | sim | |
| `description` | texto | não | |
| `privacy` | texto (lista) | sim | `public`, `protected`, `secret` |
| `pin_count` | número | não | Aproximado |
| `is_active` | booleano | sim | Falso se o board foi apagado no Pinterest |
| `last_synced_at` | data/hora | sim | |
| `created_at` / `updated_at` | data/hora | sim | |

## Tabela `board_sections`

| Campo | Tipo | Observação |
|---|---|---|
| `id` | id único | |
| `board_id` | id | → `boards` |
| `pinterest_section_id` | texto | ID da seção no Pinterest |
| `name` | texto | |
| `is_active` | booleano | |
| `last_synced_at` | data/hora | |

## Regras

- **Sincronizar** ao conectar a conta, quando o usuário abrir a tela de agendar, e por rotina periódica.
- Board apagado no Pinterest: marcar `is_active = false`. **Não apagar** o registro, porque pins na fila podem apontar para ele. Esses jobs devem falhar com mensagem clara ("board não existe mais").
- O usuário também pode **criar board** pela plataforma (permissão `boards:write`). Nesse caso gravar o retorno do Pinterest.
- Limites do Pinterest: até 2.000 boards por conta. Avisar o usuário perto do limite.

## Índices

- Único em (`pinterest_account_id`, `pinterest_board_id`)
- `board_sections.board_id`
