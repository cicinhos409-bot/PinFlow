# Etapa 06: Fila e agendamento

**Objetivo:** guardar **quando** cada pin deve ser publicado e controlar a execução, as tentativas e os erros.

A documentação do Pinterest não lista um endpoint de agendamento. Quem agenda é a **própria plataforma**: ela guarda o horário e, na hora certa, chama a API para criar o pin. Por isso esta etapa é o coração do sistema.

## Tabela `publish_jobs`

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `id` | id único | sim | |
| `user_id` | id | sim | |
| `pin_id` | id | sim | → `pins` |
| `pinterest_account_id` | id | sim | Repetido aqui para consultar rápido |
| `scheduled_for` | data/hora (UTC) | sim | Horário alvo |
| `user_timezone` | texto | sim | Fuso em que o usuário escolheu o horário |
| `jitter_seconds` | número | não | Pequena variação aleatória, para não publicar sempre "no segundo exato" |
| `status` | texto (lista) | sim | `scheduled`, `queued`, `running`, `succeeded`, `failed`, `paused`, `canceled` |
| `attempts` | número | sim | Quantas tentativas já houve |
| `max_attempts` | número | sim | Limite de tentativas |
| `next_attempt_at` | data/hora | não | Próxima tentativa após erro (com espera crescente) |
| `locked_by` | texto | não | Qual processo pegou o job |
| `locked_at` | data/hora | não | Quando pegou (para recuperar jobs "travados") |
| `idempotency_key` | texto | sim | **Único.** Impede publicar o mesmo pin duas vezes. |
| `last_error_code` | texto | não | |
| `last_error_message` | texto | não | Mensagem amigável, sem dados sensíveis |
| `finished_at` | data/hora | não | |
| `created_at` / `updated_at` | data/hora | sim | |

## Tabela `publish_attempts` (histórico)

| Campo | Tipo | Observação |
|---|---|---|
| `id` | id único | |
| `job_id` | id | → `publish_jobs` |
| `started_at` / `finished_at` | data/hora | |
| `result` | texto (lista) | `success`, `retry`, `fail` |
| `http_status` | número | Resposta do Pinterest |
| `error_code` / `error_message` | texto | |
| `pinterest_pin_id` | texto | Se deu certo |

## Como o processo executa

1. Um processo periódico busca jobs com `status = scheduled` e `scheduled_for <= agora`.
2. Trava o job (`locked_by`, `locked_at`) para que dois processos não peguem o mesmo.
3. Confere **limites** da conta (doc 07). Se estourou, reagenda para depois (não falha).
4. Confere o token da conta (renova se preciso).
5. Publica (imagem direto, vídeo em 4 passos).
6. Grava o resultado em `publish_attempts` e atualiza o job e o pin.

## Regras

- **Idempotência:** antes de publicar, conferir se já existe `pinterest_pin_id` para o job. Se o processo caiu depois de publicar e antes de gravar, não repetir.
- **Recuperar travados:** jobs `running` há muito tempo (ex.: mais de 10 minutos) voltam para `scheduled`.
- **Erros que não adiantam repetir** (board apagado, permissão negada, mídia inválida): falhar direto com mensagem clara.
- **Erros temporários** (limite de requisições, instabilidade): repetir com espera crescente.
- **Conta com `reauth_required`:** jobs ficam `paused` e voltam ao normal quando a conta for reconectada (ver doc 03).
- **Fuso e horário de verão:** sempre guardar em UTC e exibir no fuso do usuário.
- Cancelar um job não apaga o pin (volta a `draft`).

## Índices

- (`status`, `scheduled_for`) para a busca principal do processo
- (`status`, `next_attempt_at`)
- `user_id`, `pinterest_account_id`
- Único em `idempotency_key`
