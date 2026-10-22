# Ligar a plataforma de verdade: o que só o dono pode fazer

Tudo está programado e testado. O que falta são **chaves** que só você consegue criar (contas em serviços externos). Cada item abaixo leva poucos minutos. A ordem importa.

## 1. Banco de dados (obrigatório) — Neon pela Vercel

1. No painel da Vercel, abra o projeto **pinflow** → aba **Storage** → **Create Database** → **Neon** (Postgres, plano gratuito) → crie e **conecte ao projeto**.
2. A Vercel cria a variável `DATABASE_URL` sozinha (às vezes com o nome `POSTGRES_URL`: se for o caso, crie uma variável `DATABASE_URL` com o mesmo valor).
3. Faça um novo deploy (Deployments → ⋯ → Redeploy). As tabelas são criadas automaticamente na primeira requisição.

Alternativa: Supabase ou Railway também servem; copie a connection string (com `sslmode=require`) para `DATABASE_URL`.

**Resultado:** o modo de visualização desliga, o cadastro e o login passam a funcionar e você cria sua conta em `/app/cadastro`.

## 2. Armazenamento de imagens e vídeos — Vercel Blob ✅ já feito

A loja **pinflow-midia** (Vercel Blob, pública, região iad1) já foi criada e conectada ao projeto; a variável `BLOB_READ_WRITE_TOKEN` já existe e `/api/status` responde `"storage": "blob"`. Nada a fazer. (Plano Hobby: 1 GB grátis; apague mídias antigas pela biblioteca se precisar.)

## 3. App na Pinterest

1. Entre em https://developers.pinterest.com → **My apps** → **Connect app** (ou Create). Use uma conta **Business** da Pinterest.
2. Descreva o uso com clareza ("Ferramenta para programar pins de imagem e vídeo nas contas dos próprios usuários, via OAuth") e informe a política de privacidade: `https://pinflow-alpha.vercel.app/privacidade` (os textos legais ainda são rascunho: revise antes).
3. Em **Redirect URIs** cadastre exatamente: `https://pinflow-alpha.vercel.app/api/pinterest/callback`
4. Copie **App ID** e **App secret** para as variáveis `PINTEREST_APP_ID` e `PINTEREST_APP_SECRET` na Vercel. Redeploy.
5. Aguarde a aprovação do **Trial** (e-mail da Pinterest). No Trial, pins criados aparecem só para a própria conta.
6. Para liberar ao público, peça o **Standard**: grave um vídeo mostrando o botão "Conectar conta do Pinterest", a autorização e um pin sendo programado/publicado, e envie em *My apps* → *Upgrade*.

## 4. E-mails (recomendado) — Resend

1. Crie conta em https://resend.com, verifique um domínio seu e gere uma API key.
2. Variáveis: `RESEND_API_KEY` e `MAIL_FROM` (ex.: `Pinflow <no-reply@seudominio.com.br>`).

**Resultado:** "Esqueci minha senha", confirmação de e-mail e avisos de falha/reconexão passam a funcionar. Sem isso, as telas avisam que o envio não está configurado.

## 5. Pontualidade da fila (opcional)

A fila roda quando alguém está com a plataforma aberta (a cada 60 s) e uma vez por dia pelo cron da Vercel (plano Hobby). Para publicar no minuto certo mesmo com todo mundo offline:

- **Opção A (grátis):** em https://cron-job.org crie um job a cada 1 minuto chamando `https://pinflow-alpha.vercel.app/api/cron/queue?key=SEU_CRON_SECRET` (GET).
- **Opção B:** plano Pro da Vercel e trocar o `schedule` em `vercel.json` para `* * * * *`.

## Variáveis já configuradas na Vercel

`SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET` e `APP_URL` já foram definidas (produção e preview), como variáveis **sensíveis** (a Vercel não mostra o valor depois). Se um dia trocar `TOKEN_ENCRYPTION_KEY`, todas as contas da Pinterest precisarão ser reconectadas. Para usar um agendador externo (item 5), defina um valor seu em `CRON_SECRET` (Settings → Environment Variables → editar) e use o mesmo valor no agendador.

## Checklist final antes de abrir ao público

- [ ] Textos de Termos e Privacidade revisados por advogado (hoje são rascunhos)
- [ ] Nome definitivo e domínio próprio (trocar `APP_URL`, o redirect URI na Pinterest e `BRAND_NAME` em `js/config.js`)
- [ ] Acesso Standard aprovado na Pinterest
- [ ] E-mails configurados
