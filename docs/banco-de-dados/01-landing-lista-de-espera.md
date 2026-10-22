# Etapa 01: Landing e lista de espera

**Objetivo:** guardar quem se cadastra na lista de espera do formulário da landing. É a primeira coisa que precisa de banco.

**Rota prevista:** `POST /api/waitlist` (ainda não existe). Quando existir, preencher `WAITLIST_ENDPOINT` em `js/config.js`.

## Tabela `waitlist_entries`

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `id` | id único | sim | |
| `email` | texto | sim | Guardar em minúsculas. **Único**: o mesmo e-mail não entra duas vezes. |
| `profile` | texto (lista) | sim | `afiliado`, `criador`, `loja`, `agencia`, `outro` |
| `accounts_range` | texto (lista) | sim | `1`, `2-5`, `6-20`, `20+` |
| `consent_given` | booleano | sim | Marcou a caixa de concordância |
| `consent_text_version` | texto | sim | Versão da Política de Privacidade aceita |
| `source` | texto | não | De onde veio (ex.: `landing`, parâmetro UTM) |
| `status` | texto (lista) | sim | `pending`, `invited`, `converted`, `unsubscribed` |
| `invited_at` | data/hora | não | Quando recebeu convite |
| `converted_user_id` | id | não | Liga ao `users` quando a pessoa se cadastra de fato |
| `ip_hash` | texto | não | IP em formato **embaralhado (hash)**, só para barrar abuso. Não guardar o IP puro. |
| `created_at` / `updated_at` | data/hora | sim | |

## Índices

- Único em `email`
- Em `status` e `created_at` (para convidar por ordem de chegada)

## Regras

- Campo isca (`website`) do formulário: se vier preenchido, **descartar** sem gravar.
- Limitar tentativas por IP (por exemplo, poucas por minuto) para evitar enchentes de cadastro falso.
- Quem pedir para sair: marcar `unsubscribed` e não enviar mais e-mails.
- Não gravar nada além do necessário (LGPD).

## Resposta ao visitante

- Cadastro novo ou já existente: a mesma mensagem de sucesso (não revelar se o e-mail já estava na lista).
