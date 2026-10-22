# Etapa 10: Auditoria e LGPD

**Objetivo:** ter rastro das ações importantes (segurança e suporte) e cumprir os direitos dos titulares de dados.

## Tabela `audit_log`

Registro de ações sensíveis. Só se acrescenta; **não se edita nem se apaga** nas rotinas normais.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | id único | |
| `user_id` | id | Quem fez (pode ser vazio para ações do sistema) |
| `actor` | texto (lista) | `user`, `admin`, `system` |
| `action` | texto | Ex.: `login`, `password_changed`, `account_connected`, `account_disconnected`, `pin_scheduled`, `pin_published`, `plan_changed`, `user_suspended` |
| `entity_type` / `entity_id` | texto / id | O que foi afetado |
| `metadata` | dados flexíveis (JSON) | Detalhes **sem** tokens, senhas ou dados sensíveis |
| `ip_hash` | texto | IP embaralhado |
| `created_at` | data/hora | |

## Tabela `consents`

Prova de quando e o que o usuário aceitou.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | id único | |
| `user_id` ou `waitlist_entry_id` | id | |
| `type` | texto (lista) | `terms`, `privacy`, `marketing_email`, `pinterest_connection` |
| `document_version` | texto | Versão do documento aceito |
| `granted` | booleano | |
| `ip_hash` | texto | |
| `created_at` | data/hora | |
| `revoked_at` | data/hora | |

## Tabela `data_requests`

Pedidos do titular (LGPD).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | id único | |
| `user_id` | id | |
| `type` | texto (lista) | `access`, `correction`, `deletion`, `portability`, `revoke_consent` |
| `status` | texto (lista) | `received`, `in_progress`, `done`, `rejected` |
| `received_at` | data/hora | |
| `due_at` | data/hora | Prazo para responder |
| `completed_at` | data/hora | |
| `notes` | texto | |

## O que o banco precisa permitir

1. **Exportar** todos os dados de um usuário (acesso e portabilidade).
2. **Apagar** os dados de um usuário e de tudo que depende dele (contas, boards, pins, fila, métricas), incluindo **tokens do Pinterest** e **arquivos** no armazenamento.
3. **Manter** só o que a lei exige guardar (ex.: registros de cobrança), de forma separada e mínima.
4. **Anonimizar** o que precisa ficar por razões estatísticas.
5. **Desconectar conta do Pinterest** = apagar os tokens imediatamente.

## Retenção sugerida (a validar com advogado)

| Dado | Retenção |
|---|---|
| Tokens de conta desconectada | Apagar na hora |
| Fila e pins de conta desconectada | Prazo curto e depois apagar |
| `audit_log` | Prazo definido em política (ex.: 6 a 12 meses) |
| Faturas e dados fiscais | Conforme exigência legal |
| Lista de espera sem conversão | Apagar após um prazo definido ou ao pedido |

## Regras

- Nunca gravar tokens, senhas ou chaves em `audit_log`, `metadata` ou logs de erro.
- Todo acesso de administrador a dados de usuário vai para o `audit_log`.
- Versão dos Termos e da Política: cada vez que mudar de forma relevante, pedir novo aceite.
