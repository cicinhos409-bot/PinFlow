# Banco de dados: visão geral

O banco ainda **não foi escolhido**. Estes documentos descrevem **o que precisa existir**, etapa por etapa, sem amarrar a uma tecnologia. Quando o banco for decidido, cada tabela vira um script de criação (migração).

Recomendação prática: como os dados são bem relacionados (usuário → contas → boards → pins → fila), um banco **relacional** (tipo Postgres) encaixa melhor. Mas nada aqui depende disso.

## Mapa das etapas

| Doc | Etapa da plataforma | Tabelas principais |
|---|---|---|
| 01 | Landing / lista de espera | `waitlist_entries` |
| 02 | Cadastro e login | `users`, `sessions`, `email_verifications`, `password_resets` |
| 03 | Conectar contas do Pinterest | `pinterest_accounts`, `oauth_states` |
| 04 | Boards | `boards`, `board_sections` |
| 05 | Pins e mídia | `media_assets`, `pins` |
| 06 | Fila e agendamento | `publish_jobs`, `publish_attempts` |
| 07 | Limites e proteção contra spam | `account_limits`, `usage_counters`, `content_fingerprints`, `app_strikes` |
| 08 | Métricas | `pin_metrics_daily` |
| 09 | Planos e cobrança | `plans`, `subscriptions`, `invoices`, `billing_events` |
| 10 | Auditoria e LGPD | `audit_log`, `consents`, `data_requests` |

## Relação entre as entidades

```
users 1──N pinterest_accounts 1──N boards 1──N board_sections
  │                 │
  │                 └──N pins ──1 media_assets
  │                      │
  │                      └──N publish_jobs 1──N publish_attempts
  │
  ├──N sessions
  ├──1 subscriptions ──N invoices
  └──N audit_log
```

## Convenções para todas as tabelas

| Regra | Detalhe |
|---|---|
| Chave primária | `id` único e não sequencial (UUID ou similar). Não expor IDs em ordem. |
| Datas | Sempre em **UTC**. Campos `created_at` e `updated_at` em toda tabela. |
| Fuso do usuário | Guardado no usuário/conta; usado só para exibir e para interpretar horários digitados. |
| Exclusão | Dados do usuário: `deleted_at` (exclusão lógica) e rotina de apagar de vez conforme o prazo da Política de Privacidade. |
| Dono dos dados | Toda tabela de conteúdo leva `user_id` (ou chega nele por uma relação) e **toda consulta filtra por ele**. É a base do multiusuário. |
| Status | Campos de status usam uma lista fechada de valores (enum), documentada em cada tabela. |
| Segredos | Tokens e chaves: **criptografados** antes de gravar. Nunca aparecem em logs. |
| IDs do Pinterest | Guardar como texto, em coluna própria (`pinterest_*_id`). São a referência estável, e não nomes. |

## Regras vindas do Pinterest que moldam o banco

- **Nome de usuário muda**: nunca usar `username` como chave. Guardar, mas tratar como informação que pode mudar. Usar IDs.
- **IDs de board e de pin são fixos e únicos** no Pinterest: servem de referência para fila e métricas.
- **Token expira**: guardar validade do acesso e do refresh. Reautorização deve ser possível sem perder a fila.
- **Reautorização**: se o usuário perder acesso e reconectar, a plataforma verifica se o novo token alcança os boards já agendados e pergunta se mantém a agenda.
- **Trial x Standard**: no Trial, pins ficam visíveis só para o dono. O ambiente (sandbox/produção) precisa ser registrado.
- **Spam**: strikes são do **app inteiro**. Por isso o banco precisa de limites por conta e de rastro do que foi publicado.

## Pendências de decisão

- [ ] Qual banco (relacional, hospedado onde)
- [ ] Onde ficam imagens e vídeos (armazenamento de arquivos separado do banco)
- [ ] Login próprio ou serviço de autenticação pronto (afeta o doc 02)
- [ ] Provedor de cobrança (afeta o doc 09)
- [ ] Como rodar a fila (cron, worker contínuo ou serviço de filas) (afeta o doc 06)
