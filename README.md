# Plataforma de Pinterest (SaaS)

Plataforma para conectar várias contas do Pinterest e agendar pins (imagem e vídeo) pela **API oficial v5**, com login OAuth. Sem senha dos clientes e sem robô de navegador.

> Estado atual: **landing page** (HTML, CSS e JavaScript puros). Banco de dados ainda não escolhido.

## Tecnologias

- HTML, CSS e JavaScript (sem framework e sem build)
- Hospedagem: Vercel
- Código: GitHub
- Banco de dados: a definir (ver `docs/banco-de-dados/`)

## Estrutura

```
plataforma-pinterest/
├── index.html            Landing page
├── privacidade.html      Política de Privacidade (rascunho)
├── termos.html           Termos de Uso (rascunho)
├── favicon.svg
├── css/style.css         Estilos
├── js/
│   ├── config.js         Nome da marca e endereço da lista de espera
│   └── main.js           Menu, formulário da lista de espera
├── docs/
│   ├── pinterest-saas.md     Visão, promessa e estrutura da landing
│   └── banco-de-dados/       O que o banco precisa ter, etapa por etapa
├── vercel.json           Rotas limpas e cabeçalhos de segurança
├── package.json
├── .env.example          Variáveis de ambiente previstas
└── .gitignore
```

## Rodar localmente

Opção simples, sem instalar nada: abra a pasta com qualquer servidor estático, por exemplo:

```bash
npx serve .
```

Opção igual à produção (rotas `/privacidade` e `/termos` sem `.html`):

```bash
npm i -g vercel
vercel dev
```

## Publicar

1. Suba esta pasta para um repositório no GitHub.
2. Na Vercel: **Add New > Project**, escolha o repositório. Não precisa de build command nem de output directory (site estático).
3. Cada `git push` na branch principal publica automaticamente.

## Antes de divulgar

- [ ] Definir o nome final e trocar em `js/config.js` e no `<title>` do `index.html`
- [ ] Preencher e revisar com um advogado `privacidade.html` e `termos.html`
- [ ] Ligar o formulário da lista de espera (`WAITLIST_ENDPOINT` em `js/config.js`) quando houver banco
- [ ] Domínio próprio com HTTPS
- [ ] Revisar os textos para seguir "O que NÃO prometer" em `docs/pinterest-saas.md`

## Próximas etapas

Ver o roadmap em `docs/pinterest-saas.md` e o que cada etapa pede do banco em `docs/banco-de-dados/`.
