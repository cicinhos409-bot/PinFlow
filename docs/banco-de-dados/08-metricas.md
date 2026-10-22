# Etapa 08: Métricas dos pins

**Objetivo:** mostrar ao usuário como os pins estão desempenhando.

O Pinterest oferece análise de conteúdo pela API. **Quais métricas exatas** estão disponíveis e com que granularidade precisa ser **confirmado na referência da API** antes de fechar os campos. Abaixo está a estrutura que comporta o caso comum (um registro por pin por dia).

## Tabela `pin_metrics_daily`

| Campo | Tipo | Observação |
|---|---|---|
| `id` | id único | |
| `pin_id` | id | → `pins` (nosso registro) |
| `pinterest_pin_id` | texto | ID do pin no Pinterest |
| `pinterest_account_id` | id | |
| `metric_date` | data | Dia a que a métrica se refere |
| `impressions` | número | Quantas vezes apareceu |
| `saves` | número | Salvamentos |
| `outbound_clicks` | número | Cliques para o link de destino |
| `pin_clicks` | número | Cliques no pin |
| `video_views` | número | Só para vídeo |
| `raw` | dados flexíveis (JSON) | Guarda a resposta completa, para não perder métricas novas |
| `fetched_at` | data/hora | Quando foi buscado |

> Nomes dos campos são sugestão. Ajustar aos nomes reais retornados pela API.

## Tabela `metrics_sync_state`

Controla o que já foi buscado.

| Campo | Tipo | Observação |
|---|---|---|
| `pinterest_account_id` | id | |
| `last_synced_date` | data | Até que dia já temos dados |
| `last_run_at` | data/hora | |
| `last_error` | texto | |

## Regras

- Buscar métricas por rotina (ex.: uma vez por dia), e não a cada visita ao painel (economiza chamadas e respeita limites do Pinterest).
- Pins recentes podem ter dados incompletos nos primeiros dias: rebuscar os últimos dias a cada rodada.
- Métricas são por **pin**, **board** e **conta**: guardar por pin e somar nas telas.
- Histórico: decidir por quanto tempo guardar (ex.: 12 meses detalhado, depois resumir por mês).
- Se a conta perder acesso (`reauth_required`), pausar a busca e **manter** o histórico já coletado.

## Índices

- Único em (`pin_id`, `metric_date`)
- `pinterest_account_id`, `metric_date`
