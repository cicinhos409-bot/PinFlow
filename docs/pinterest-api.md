# O que a plataforma usa da API da Pinterest (e o que a Pinterest exige)

Fontes: developers.pinterest.com (Authentication and scopes, Access tiers, Content overview, Rate limits) e o OpenAPI oficial v5.28 (github.com/pinterest/api-description), consultados em 22/10/2026.

## Login oficial (OAuth 2.0)

- Autorização: `https://www.pinterest.com/oauth/?client_id&redirect_uri&response_type=code&scope&state`
- Token: `POST https://api.pinterest.com/v5/oauth/token` com **Basic auth** (`client_id:client_secret`), corpo `application/x-www-form-urlencoded`.
- Escopos usados: `boards:read boards:write pins:read pins:write user_accounts:read`.
- Token de acesso: 30 dias (`expires_in` 2592000). Token de renovação contínuo: 60 dias, trocado a cada renovação (`refresh_token_expires_at`). Apps criados após 25/09/2025 já recebem o contínuo.
- O `redirect_uri` precisa ser **exatamente** o cadastrado no app: `https://pinflow-alpha.vercel.app/api/pinterest/callback` (ou o domínio final).

## Endpoints usados

| Endpoint | Uso |
|---|---|
| `GET /user_account` | Dados da conta conectada (`username`, `account_type`, `profile_image`, `business_name`) |
| `GET /boards` (paginação por `bookmark`) | Sincronizar pastas |
| `POST /boards`, `PATCH /boards/{id}`, `DELETE /boards/{id}` | Criar, renomear, apagar pasta |
| `POST /pins` | Publicar (imagem: `media_source.image_url`; vídeo: `video_id` + `cover_image_url`) |
| `PATCH /pins/{id}` | Editar título, descrição, link, alt_text, pasta de pin já publicado |
| `DELETE /pins/{id}` | Apagar na Pinterest (opcional, pela janela de confirmação) |
| `POST /media` → upload em `upload_url` → `GET /media/{id}` | Vídeo em 4 passos; status: `registered`, `processing`, `succeeded`, `failed` |

Limites dos campos (OpenAPI): título 100, descrição 800, alt_text 500, link 2048. Vídeo aceito: `.mp4`, `.mov`, `.m4v`.

## Acesso Trial vs Standard

- **Trial** (todo app novo): limite de 1.000 chamadas por dia por app; pastas e pins criados ficam **visíveis só para quem criou** (sandbox).
- **Standard** (produção): limites por minuto/por usuário (`org_write` 100/min, `org_read` 1.000/min, 100 req/s por usuário). Para pedir: app aprovado no Trial + vídeo mostrando o fluxo OAuth e uma ação na API (pode ser gravação de tela) + política de privacidade acessível. Em *My apps* → *Upgrade*.
- Motivos comuns de recusa: política de privacidade inacessível, descrição vaga, vídeo que não mostra o OAuth, uso de login com senha/cookies em vez do OAuth.

## Contas pessoais (Pinner)

Apps registrados a partir de **14/09/2026** podem receber `403 PINNER_DATA_ACCESS_DENIED` ao acessar pastas e pins de contas que não são Business. A plataforma traduz esse erro e recomenda converter a conta em Business e reconectar.

## Rate limits

Cabeçalhos `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`. Em 429 a plataforma recoloca o pin na fila com espera. "All rate limits are subject to change without notice."

## Spam

Punições por spam recaem sobre o **app inteiro**. Por isso a plataforma limita pins por dia por conta (padrão 25), mantém intervalo entre pins da mesma conta e limita contas por usuário. Aumente os limites devagar.

## O que o dono precisa fazer na Pinterest

1. Criar o app em developers.pinterest.com (descrição clara do uso, link da política de privacidade).
2. Cadastrar o redirect URI acima.
3. Colocar `PINTEREST_APP_ID` e `PINTEREST_APP_SECRET` nas variáveis da Vercel.
4. Testar com a própria conta (Trial). Gravar o vídeo do fluxo e pedir o Standard.
