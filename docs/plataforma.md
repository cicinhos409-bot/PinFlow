# Como a plataforma funciona (visão técnica)

Stack: HTML, CSS e JavaScript puros no front; Node.js em **uma única função** na Vercel (`api/index.js`); Postgres; Vercel Blob para mídia; API oficial da Pinterest v5.

## Mapa do código

| Pasta/arquivo | O que é |
|---|---|
| `index.html`, `termos.html`, `privacidade.html`, `404.html` | Páginas públicas |
| `app/*.html` | Telas da plataforma (geradas por `scripts/build-pages.js`; edite o script, não os HTML) |
| `css/style.css` | Tema (preto puro + âmbar `#fe9a00`) e todos os componentes |
| `js/ui.js` | Kit de interface: **modal de confirmação própria**, diálogos, avisos (toast), menus, datas |
| `js/app.js` | Casca da plataforma: sessão, modo de visualização, barra lateral, URLs com id, disparo da fila |
| `js/auth.js` | Telas públicas de conta (entrar, criar, esqueci, redefinir, confirmar) |
| `js/pages/*.js` | Uma lógica por tela; `media-picker.js` (upload/biblioteca) e `pin-form.js` (formulário de pin) são compartilhados |
| `js/vendor/vercel-blob-client.js` | SDK do Vercel Blob para o navegador (gerado por `npm run build:vendor`) |
| `api/index.js` | Entrada única da API; `vercel.json` reescreve `/api/*` para cá |
| `api/_lib/router.js` | Roteador (método, caminho, sessão, JSON, mesma origem) |
| `api/_lib/routes/*.js` | Rotas: `auth`, `accounts` (contas + pastas + OAuth), `media`, `pins`, `misc` (status, dashboard, histórico, fila, cron) |
| `api/_lib/db.js`, `db-postgres.js`, `db-file.js`, `schema.js` | Camada de dados (interface única; Postgres em produção, arquivo só em testes) |
| `api/_lib/pinterest.js` | Cliente da API da Pinterest e do login oficial; renovação de token; erros em português |
| `api/_lib/worker.js` | Fila de publicação (imagem e vídeo), tentativas, limites, manutenção diária |
| `api/_lib/storage.js` | Vercel Blob (upload direto do navegador) ou pasta local |
| `api/_lib/mailer.js` | E-mails via Resend (ou memória nos testes) |
| `api/_lib/crypto.js` | scrypt (senhas), AES-256-GCM (tokens), ids públicos |
| `scripts/` | Servidor local, Pinterest simulada, testes, gerador de páginas |

## Por que uma função só

O plano Hobby da Vercel permite **12 funções por deploy**. Com uma função e um roteador interno, a plataforma pode ter quantas rotas precisar. A rota chega como `/api/index?__path=pins/abc`, e o roteador reconstrói `/pins/abc`.

## Endereços

Padrão `/app/<página>/<id da conta>[/<item>]`. O id é público, aleatório e não sequencial. **A sessão (cookie) manda**: o servidor nunca lê o id da URL para decidir de quem são os dados; se a URL vier com outro id, a tela corrige o endereço.

| Página | Endereço |
|---|---|
| Entrar / Criar conta / Esqueci | `/app/login`, `/app/cadastro`, `/app/esqueci-senha` |
| Redefinir / Confirmar e-mail | `/app/redefinir/<token>`, `/app/confirmar/<token>` |
| Dashboard | `/app/dashboard/<id>` |
| Contas / Conta | `/app/contas/<id>`, `/app/contas/<id>/<conta>` |
| Pins / Novo / Detalhe | `/app/pins/<id>`, `/app/pins/<id>/novo`, `/app/pins/<id>/<pin>` |
| Histórico | `/app/historico/<id>` |
| Análises | `/app/analises/<id>` |
| Configurações | `/app/configuracoes/<id>` |

## API (JSON, mesma origem, sessão por cookie)

| Rota | Faz |
|---|---|
| `GET /api/status` | Quais serviços estão configurados (banco, mídia, Pinterest, e-mail) e limites |
| `POST /api/auth/register`, `login`, `logout` · `GET /api/auth/me` | Conta |
| `PATCH /api/auth/profile` · `POST /api/auth/password` | Nome, fuso, notificações; trocar senha |
| `GET /api/auth/sessions` · `DELETE /api/auth/sessions/:id` · `POST /api/auth/sessions/revoke-others` | Aparelhos conectados |
| `POST /api/auth/forgot`, `reset`, `verify/send`, `verify` | Recuperar senha e confirmar e-mail |
| `POST /api/auth/delete-account` | Excluir conta (senha + "EXCLUIR") |
| `GET /api/pinterest/connect` → Pinterest → `GET /api/pinterest/callback` | Login oficial (OAuth) |
| `GET /api/accounts` · `GET/PATCH/DELETE /api/accounts/:id` · `POST /api/accounts/:id/sync` | Contas |
| `POST /api/accounts/:id/boards` · `PATCH/DELETE /api/accounts/:id/boards/:board` | Pastas (criadas/alteradas na Pinterest) |
| `POST /api/media/upload` (token) · `POST /api/media` · `GET /api/media` · `DELETE /api/media/:id` | Mídia |
| `GET/POST /api/pins` · `GET/PATCH/DELETE /api/pins/:id` · `POST /api/pins/:id/{cancel,retry,publish-now,duplicate}` | Pins |
| `GET /api/dashboard` · `GET /api/activity` | Resumo e histórico |
| `GET /api/analytics?days=&account=` · `POST /api/analytics/refresh` · `GET /api/analytics/pin/:id` | Análises (métricas da Pinterest com cache de 6 h e orçamento de chamadas) |
| `POST /api/worker/run` | Processa a fila (público, limitado; só publica o que já venceu) |
| `GET /api/cron/daily` · `GET /api/cron/queue` | Cron com `CRON_SECRET` |

Erros vêm como `{ ok: false, error: { code, message, field? } }` com mensagens em português prontas para a tela.

## Fila de publicação

1. Cada pin tem `scheduled_at` e `next_attempt_at`. O worker "reivindica" os vencidos numa única instrução (`UPDATE ... FOR UPDATE SKIP LOCKED`), então duas execuções ao mesmo tempo nunca publicam o mesmo pin duas vezes.
2. Imagem: `POST /v5/pins` com `media_source.image_url` (a Pinterest busca a imagem no Vercel Blob).
3. Vídeo: `POST /v5/media` → envio do arquivo para a `upload_url` → espera `status = succeeded` → `POST /v5/pins` com `video_id` + `cover_image_url` (capa obrigatória).
4. Falhas temporárias (429, 5xx, vídeo processando) voltam para a fila com espera de 5, 20 e 60 min (3 tentativas). Falhas definitivas (400, pasta apagada, conta desconectada) ficam em "Falhou" com o motivo em português e botão "Tentar de novo".
5. Proteções contra spam (a Pinterest pune o app inteiro): limite diário por conta (padrão 25, máximo 100), intervalo mínimo entre pins da mesma conta, no máximo 20 contas por usuário.

**Quem dispara o worker:** o navegador de quem está com a plataforma aberta (a cada 60 s), o cron diário da Vercel e, se quiser pontualidade de minuto, um agendador externo chamando `GET /api/cron/queue?key=CRON_SECRET` a cada minuto (ex.: cron-job.org). No plano Hobby da Vercel o cron roda só uma vez por dia (±59 min).

## Análises (métricas)

- Por pin: `GET /pins/{id}/analytics` (impressões, salvamentos, cliques, cliques no link, comentários, reações; vídeos: views MRC, 10 s, 95%, tempo total e médio). Por conta: `GET /user_account/analytics`.
- Cache em `pin_metrics`/`account_metrics` por período (7/14/30/90 dias), válido por 6 h. Cada abertura da tela busca no máximo 25 itens novos/velhos na Pinterest (Trial: 1.000 chamadas/dia para o app inteiro); o botão "Atualizar dados" tem espera de 30 min por usuário; a manutenção diária renova até 200 pins recentes.
- A Pinterest consolida os números em 1–2 dias (`data_status = PROCESSING`), e só dá 90 dias para trás.

## Tokens da Pinterest

- Token de acesso dura 30 dias; o de renovação (contínuo) 60 dias e é trocado a cada renovação.
- Guardados só criptografados (AES-256-GCM, chave `TOKEN_ENCRYPTION_KEY`).
- Renovação automática: antes de usar (se faltam < 3 dias), ao receber 401 e na manutenção diária. Se a renovação falhar, a conta fica "Precisa reconectar" e a pessoa é avisada (histórico + e-mail).

## Modo de visualização

Sem `DATABASE_URL`, `/api/*` responde 503 `not_configured` e as telas abrem sem login com um aviso. Assim que o banco existir, o login volta a valer sozinho.

## Testes

- `npm run test:auth` — contas (51 verificações)
- `npm run test:api` — API de ponta a ponta com Pinterest simulada (81 verificações)
- `npm run test:postgres` — adaptador Postgres de verdade (Postgres embutido) + bateria da API em cima dele
- `npm run dev:full` — ambiente local completo no navegador (Pinterest simulada, nada vai para a Pinterest de verdade)
