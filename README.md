# Pinflow (nome provisório) — plataforma de Pinterest

Plataforma SaaS para conectar várias contas do Pinterest e programar pins (imagem e vídeo) pela **API oficial v5**, com login OAuth. Sem senha dos clientes e sem robô de navegador. Esta plataforma não é afiliada à Pinterest.

Site: https://pinflow-alpha.vercel.app

## Estado

- Landing, páginas legais (rascunho), cadastro/login, recuperação de senha, confirmação de e-mail, sessões, exclusão de conta
- Contas do Pinterest pelo login oficial (conectar, reconectar, desconectar, limites), pastas (sincronizar, criar, renomear, apagar)
- Mídia (upload direto para o Vercel Blob, biblioteca), pins (criar para várias contas, editar, cancelar, tentar de novo, publicar agora, duplicar, apagar inclusive na Pinterest), lista + calendário, histórico
- Fila de publicação com imagem e vídeo (4 passos), tentativas, limites antispam, cron diário
- Modal de confirmação própria em todas as ações destrutivas (nada do `confirm()` do navegador)
- Testes: 51 + 81 verificações de API (com Pinterest simulada) e bateria no Postgres embutido

Para ligar em produção faltam só chaves externas: **docs/ligar.md**.

## Tecnologias

HTML, CSS e JavaScript puros · Node.js em uma função na Vercel · Postgres (Neon/Supabase) · Vercel Blob · Resend (e-mail) · API Pinterest v5

## Rodar na sua máquina

```bash
npm install
npm run dev:full      # site + API + banco em arquivo + Pinterest SIMULADA em http://localhost:3000
npm test              # todos os testes
```

`npm run dev:local` sobe só o site + API (sem Pinterest simulada). `AUTH_STORE=none npm run dev:local` simula o site sem banco (modo de visualização).

## Documentação

- `docs/plataforma.md` — como o código é organizado, API, fila, tokens
- `docs/ligar.md` — o que só o dono pode fazer para ligar de verdade
- `docs/pinterest-api.md` — o que a Pinterest exige e o que usamos
- `docs/telas.md` — mapa de telas e fases
- `docs/banco-de-dados/` — o que cada tabela guarda e por quê
- `docs/pinterest-saas.md` — promessa e direção visual

## Deploy

Push em `main` → Vercel. Se a Vercel não publicar sozinha, conecte o repositório ao projeto em Settings → Git. As páginas em `app/` são geradas por `npm run build:pages` (edite `scripts/build-pages.js`).
