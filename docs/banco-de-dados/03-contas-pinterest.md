# Etapa 03: Contas do Pinterest conectadas

**Objetivo:** guardar cada conta do Pinterest que um usuário conectou pelo login oficial (OAuth 2), com os tokens necessários para publicar em nome dela.

**Fluxo:** o usuário clica em conectar → vai ao Pinterest → autoriza → volta para a plataforma com um código → a plataforma troca o código por token de acesso e de renovação → grava.

## Tabela `pinterest_accounts`

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `id` | id único | sim | |
| `user_id` | id | sim | → `users`. Dono da conexão. |
| `pinterest_user_id` | texto | sim* | ID estável da conta no Pinterest. *Confirmar no retorno do endpoint de dados da conta qual campo é o ID estável.* |
| `username` | texto | sim | **Pode mudar.** Só para exibir. Reatualizar de tempos em tempos. |
| `display_name` | texto | não | |
| `profile_image_url` | texto | não | |
| `account_type` | texto (lista) | sim | `business`, `personal` (apps novos podem ter acesso negado em contas que não são Business) |
| `access_token_enc` | texto | sim | Token de acesso **criptografado** |
| `refresh_token_enc` | texto | sim | Token de renovação **criptografado** |
| `access_expires_at` | data/hora | sim | Quando o acesso vence |
| `refresh_expires_at` | data/hora | não | Quando o refresh vence |
| `scopes` | lista de texto | sim | Ex.: `boards:read`, `boards:write`, `pins:read`, `pins:write` |
| `api_environment` | texto (lista) | sim | `sandbox` ou `production` |
| `access_tier` | texto (lista) | sim | `trial` ou `standard` (do app, no momento da conexão) |
| `status` | texto (lista) | sim | `active`, `reauth_required`, `disconnected`, `error` |
| `last_error` | texto | não | Último erro de acesso (sem dados sensíveis) |
| `last_synced_at` | data/hora | não | Última atualização de perfil e boards |
| `connected_at` | data/hora | sim | |
| `disconnected_at` | data/hora | não | |
| `created_at` / `updated_at` | data/hora | sim | |

## Tabela `oauth_states` (curta duração)

Protege o retorno do login contra falsificação.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | id único | |
| `user_id` | id | Quem iniciou |
| `state_hash` | texto | Valor aleatório enviado ao Pinterest e conferido na volta |
| `expires_at` | data/hora | Alguns minutos |
| `used_at` | data/hora | Uso único |

## Regras

- **Tokens só criptografados.** A chave de criptografia fica em variável de ambiente (`TOKEN_ENCRYPTION_KEY`), nunca no banco.
- **Renovação automática:** renovar o acesso antes de vencer. Se a renovação falhar, status vira `reauth_required` e os jobs dessa conta ficam **pausados** (não apagados).
- **Mesma conta do Pinterest em dois usuários da plataforma:** definir política (bloquear ou permitir). Sugestão: único por `pinterest_user_id` + ambiente.
- **Reconexão:** ao reautorizar, comparar `pinterest_user_id`. Se for a mesma conta, reaproveitar o registro e a fila. Se for outra, perguntar ao usuário o que fazer com a agenda existente.
- **Desconectar:** apagar os tokens, marcar `disconnected`, cancelar jobs pendentes (ou pedir confirmação).
- **Limite de contas** vem do plano (doc 09).

## Índices

- `user_id`
- Único em (`pinterest_user_id`, `api_environment`) (a política acima pode afrouxar isto)
- `status`, `access_expires_at` (para o renovador achar o que vai vencer)
