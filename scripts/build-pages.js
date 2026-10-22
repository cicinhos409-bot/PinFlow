"use strict";

/**
 * Gera as páginas da plataforma (app/*.html e 404.html) a partir de uma casca única.
 * Rode depois de mudar a barra lateral ou o cabeçalho:  npm run build:pages
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
// Versão dos arquivos estáticos: muda a cada geração, para o navegador não usar CSS/JS antigos.
const V = process.env.ASSET_VERSION || Date.now().toString(36);

const LOGO = (href, label) => `<a class="logo" href="${href}" ${label ? `aria-label="${label}"` : ""}${href.startsWith("/app/") ? ' data-app-link="dashboard"' : ""}>
          <svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="9" fill="#fe9a00"/>
            <path d="M9 22V10h7a4.5 4.5 0 0 1 0 9h-3.5" fill="none" stroke="#000000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="23" cy="22" r="2.2" fill="#000000"/>
          </svg>
          <span data-brand>Pinflow</span>
        </a>`;

const ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="10" width="8" height="11" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/></svg>',
  contas: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  pins: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l3 6 6 1-4.5 4 1.5 7-6-3-6 3 1.5-7L3 10l6-1z"/></svg>',
  novo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  historico: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  analises: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>',
  configuracoes: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  sair: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M13 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
};

const NAV = [
  ["dashboard", "Dashboard", "dashboard"],
  ["contas", "Contas do Pinterest", "contas"],
  ["pins", "Pins", "pins"],
  ["pins:novo", "Novo pin", "novo"],
  ["analises", "Análises", "analises"],
  ["historico", "Histórico", "historico"],
  ["configuracoes", "Configurações", "configuracoes"],
];

function head(title, extraScripts) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="robots" content="noindex">
  <meta name="theme-color" content="#000000">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Gabarito:wght@500;700;800;900&family=Public+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css?v=${V}">
</head>
`;
}

function scripts(list) {
  return list.map((s) => `  <script src="/js/${s}.js?v=${V}"></script>`).join("\n");
}

function appShell({ page, title, eyebrow, heading, intro, body, actions, scripts: pageScripts, current }) {
  const links = NAV.map(([spec, label, icon]) => {
    const isCurrent = (current || page) === spec;
    return `          <a href="/app/${spec.split(":").join("/")}" data-app-link="${spec}"${isCurrent ? ' aria-current="page"' : ""}>${ICONS[icon]}<span>${label}</span></a>`;
  }).join("\n");
  return `${head(title)}<body data-page="${page}" data-app="1" class="app-body">
  <div class="app-layout">
    <a class="skip" href="#app-main">Pular para o conteúdo</a>

    <header class="app-topbar">
      <button class="icon-btn" type="button" id="sidebar-toggle" aria-controls="sidebar" aria-expanded="false" aria-label="Abrir menu">${ICONS.menu}</button>
      ${LOGO("/app/dashboard", "Dashboard")}
    </header>

    <aside class="sidebar" id="sidebar">
      <div class="sidebar-brand">
        ${LOGO("/app/dashboard", "Dashboard")}
      </div>
      <nav class="sidebar-nav" aria-label="Menu da plataforma">
${links}
      </nav>
      <div class="sidebar-user">
        <div class="avatar" data-user-initial aria-hidden="true"></div>
        <div class="sidebar-user-text">
          <strong data-user-name></strong>
          <span data-user-email></span>
        </div>
        <button class="icon-btn" type="button" id="logout" title="Sair" aria-label="Sair">${ICONS.sair}</button>
      </div>
    </aside>
    <div class="sidebar-backdrop" id="sidebar-backdrop" hidden></div>

    <main class="app-main" id="app-main" hidden>
      <div class="page-head">
        <div>
          ${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ""}
          <h1>${heading}</h1>
          ${intro ? `<p class="section-intro">${intro}</p>` : ""}
        </div>
        ${actions || ""}
      </div>
${body}
    </main>

    <p class="dash-loading app-main" id="app-loading" role="status">Carregando…</p>
  </div>

${scripts(["config", "ui", "app"].concat(pageScripts || []))}
</body>
</html>
`;
}

function authShell({ page, title, heading, intro, body, scripts: pageScripts }) {
  return `${head(title)}<body data-page="${page}">
  <header class="site-header is-scrolled">
    <div class="container nav">
      ${LOGO("/", "Página inicial")}
      <a class="btn btn-ghost btn-small" href="/">Voltar ao início</a>
    </div>
  </header>

  <main class="auth">
    <div class="container">
      <section class="auth-card" aria-labelledby="titulo">
        <h1 id="titulo">${heading}</h1>
        ${intro ? `<p class="section-intro">${intro}</p>` : ""}
${body}
      </section>
    </div>
  </main>

${scripts(["config", "ui", "main", "auth"].concat(pageScripts || []))}
</body>
</html>
`;
}

const pw = (id, name, autocomplete, label, extra) => `
          <div class="field">
            <label for="${id}">${label}</label>
            <div class="pw">
              <input id="${id}" name="${name}" type="password" autocomplete="${autocomplete}" maxlength="128" required ${extra || ""}>
              <button class="pw-toggle" type="button" aria-controls="${id}" aria-pressed="false">Mostrar</button>
            </div>
          </div>`;

const meter = `
            <div class="meter" aria-hidden="true"><i id="meter-bar"></i></div>
            <p class="hint" id="pw-hint">Use pelo menos 8 caracteres. Uma frase longa é mais forte que uma senha curta cheia de símbolos. <strong id="meter-label"></strong></p>`;

/* ---------- Páginas públicas de conta ---------- */

const pages = {};

pages["app/login.html"] = authShell({
  page: "login",
  title: "Entrar",
  heading: "Entrar",
  intro: "Acesse sua conta para programar seus pins.",
  body: `
        <form class="form" id="auth-form" novalidate>
          <div class="field">
            <label for="email">E-mail</label>
            <input id="email" name="email" type="email" autocomplete="username" inputmode="email" placeholder="voce@exemplo.com" maxlength="254" required>
          </div>
${pw("password", "password", "current-password", "Senha")}
          <button class="btn btn-primary" type="submit" id="submit">Entrar</button>
          <p class="form-msg" id="form-msg" role="alert" aria-live="polite"></p>
        </form>
        <p class="auth-alt"><a href="/app/esqueci-senha">Esqueci minha senha</a></p>
        <p class="auth-alt">Ainda não tem conta? <a href="/app/cadastro">Criar conta</a></p>`,
});

pages["app/cadastro.html"] = authShell({
  page: "cadastro",
  title: "Criar conta",
  heading: "Crie sua conta",
  intro: "Com a conta criada, você conecta seus perfis do Pinterest e programa seus pins.",
  body: `
        <form class="form" id="auth-form" novalidate>
          <div class="field">
            <label for="name">Nome <span class="optional">(opcional)</span></label>
            <input id="name" name="name" type="text" autocomplete="name" maxlength="80">
          </div>
          <div class="field">
            <label for="email">E-mail</label>
            <input id="email" name="email" type="email" autocomplete="email" inputmode="email" placeholder="voce@exemplo.com" maxlength="254" required>
          </div>
          <div class="field">
            <label for="password">Senha</label>
            <div class="pw">
              <input id="password" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required aria-describedby="pw-hint">
              <button class="pw-toggle" type="button" aria-controls="password" aria-pressed="false">Mostrar</button>
            </div>${meter}
          </div>
${pw("password2", "password2", "new-password", "Repita a senha")}
          <div class="hp" aria-hidden="true">
            <label for="website">Não preencha este campo</label>
            <input id="website" name="website" type="text" tabindex="-1" autocomplete="off">
          </div>
          <label class="check">
            <input type="checkbox" id="acceptTerms" name="acceptTerms" required>
            <span>Li e aceito os <a href="/termos" target="_blank" rel="noopener">Termos de Uso</a> e a <a href="/privacidade" target="_blank" rel="noopener">Política de Privacidade</a>.</span>
          </label>
          <button class="btn btn-primary" type="submit" id="submit">Criar conta</button>
          <p class="form-msg" id="form-msg" role="alert" aria-live="polite"></p>
        </form>
        <p class="auth-alt">Já tem conta? <a href="/app/login">Entrar</a></p>`,
});

pages["app/esqueci-senha.html"] = authShell({
  page: "esqueci-senha",
  title: "Esqueci minha senha",
  heading: "Esqueci minha senha",
  intro: "Digite seu e-mail. Se houver uma conta, enviamos um link para criar uma nova senha.",
  body: `
        <form class="form" id="auth-form" novalidate>
          <div class="field">
            <label for="email">E-mail</label>
            <input id="email" name="email" type="email" autocomplete="username" inputmode="email" maxlength="254" required>
          </div>
          <button class="btn btn-primary" type="submit" id="submit">Enviar link</button>
          <p class="form-msg" id="form-msg" role="alert" aria-live="polite"></p>
        </form>
        <div id="done" hidden>
          <p class="form-msg" id="done-msg" role="status"></p>
          <p class="hint">O link vale por 60 minutos. Confira também a caixa de spam.</p>
        </div>
        <p class="auth-alt"><a href="/app/login">Voltar para entrar</a></p>`,
});

pages["app/redefinir.html"] = authShell({
  page: "redefinir",
  title: "Nova senha",
  heading: "Crie uma nova senha",
  intro: "Depois de salvar, todos os aparelhos conectados precisam entrar de novo.",
  body: `
        <form class="form" id="auth-form" novalidate>
          <div class="field">
            <label for="password">Nova senha</label>
            <div class="pw">
              <input id="password" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required aria-describedby="pw-hint">
              <button class="pw-toggle" type="button" aria-controls="password" aria-pressed="false">Mostrar</button>
            </div>${meter}
          </div>
${pw("password2", "password2", "new-password", "Repita a nova senha")}
          <button class="btn btn-primary" type="submit" id="submit">Salvar nova senha</button>
          <p class="form-msg" id="form-msg" role="alert" aria-live="polite"></p>
        </form>
        <p class="auth-alt"><a href="/app/esqueci-senha">Pedir outro link</a></p>`,
});

pages["app/confirmar.html"] = authShell({
  page: "confirmar",
  title: "Confirmar e-mail",
  heading: "Confirmando seu e-mail",
  intro: "",
  body: `
        <div id="confirm-status" role="status"><p class="hint">Um instante...</p></div>
        <p class="auth-alt"><a href="/app/dashboard">Ir para a plataforma</a></p>`,
});

/* ---------- Páginas da plataforma ---------- */

pages["app/dashboard.html"] = appShell({
  page: "dashboard",
  title: "Dashboard",
  eyebrow: "Dashboard",
  heading: 'Olá, <span data-user-name></span>',
  intro: "Resumo das suas contas e dos pins programados.",
  actions: '<a class="btn btn-primary" id="primary-cta" href="/app/contas" data-app-link="contas">Conectar conta do Pinterest</a>',
  scripts: ["pages/dashboard"],
  body: `
      <p class="notice is-warn" id="reconnect-warning" hidden><span></span> <a href="/app/contas">Ver contas</a></p>

      <section class="stats" aria-label="Resumo">
        <div class="stat"><span class="stat-label">Contas conectadas</span><strong class="stat-value" data-stat="accounts">0</strong><span class="stat-note" data-stat-note="accounts">Nenhuma ainda</span></div>
        <div class="stat"><span class="stat-label">Pins na fila</span><strong class="stat-value" data-stat="queued">0</strong><span class="stat-note" data-stat-note="queued">Fila vazia</span></div>
        <div class="stat"><span class="stat-label">Publicados (7 dias)</span><strong class="stat-value" data-stat="published">0</strong><span class="stat-note">Imagem e vídeo</span></div>
        <div class="stat"><span class="stat-label">Falhas (7 dias)</span><strong class="stat-value" data-stat="failed">0</strong><span class="stat-note" data-stat-note="failed">Nada para corrigir</span></div>
      </section>

      <div class="dash-grid dash-grid-main">
        <section class="dash-card" aria-labelledby="comece-titulo">
          <h2 id="comece-titulo">Comece por aqui</h2>
          <ol class="steps-list">
            <li class="is-done"><span class="step-num">✓</span><div><strong>Criar sua conta</strong><p>Pronto. Você já está dentro.</p></div></li>
            <li id="step-connect"><span class="step-num">2</span><div><strong>Conectar uma conta do Pinterest</strong><p>Pelo login oficial da Pinterest. Nós nunca pedimos a sua senha da Pinterest.</p><a class="btn btn-primary btn-small" href="/app/contas" data-app-link="contas">Conectar conta</a></div></li>
            <li id="step-pin"><span class="step-num">3</span><div><strong>Programar o primeiro pin</strong><p>Escolha a imagem ou o vídeo, a pasta e o horário. O resto é com a gente.</p><a class="btn btn-ghost btn-small" href="/app/pins/novo" data-app-link="pins:novo">Novo pin</a></div></li>
          </ol>
        </section>

        <section class="dash-card" aria-labelledby="proximos-titulo">
          <div class="card-head">
            <h2 id="proximos-titulo">Próximos pins</h2>
            <a href="/app/pins" data-app-link="pins">Ver todos</a>
          </div>
          <div id="next-pins" class="card-body"></div>
        </section>

        <section class="dash-card dash-card-wide" aria-labelledby="atividade-titulo">
          <div class="card-head">
            <h2 id="atividade-titulo">Atividade recente</h2>
            <a href="/app/historico" data-app-link="historico">Ver histórico</a>
          </div>
          <div id="recent-activity" class="card-body"></div>
        </section>
      </div>`,
});

pages["app/contas.html"] = appShell({
  page: "contas",
  title: "Contas do Pinterest",
  eyebrow: "Contas",
  heading: "Contas do Pinterest",
  intro: "Conecte quantas contas quiser e escolha em qual publicar cada pin. A conexão é pelo login oficial da Pinterest.",
  actions: '<a class="btn btn-primary" id="connect-btn" href="/api/pinterest/connect">Conectar conta do Pinterest</a>',
  scripts: ["pages/contas"],
  body: `
      <p class="notice" id="accounts-notice" hidden></p>
      <div id="accounts-list" class="accounts-grid"></div>
      <p class="hint" style="margin-top:20px">Enquanto o app estiver em acesso Trial na Pinterest, os pins criados pela plataforma aparecem só para a própria conta (modo sandbox). Com o acesso Standard aprovado, ficam públicos normalmente.</p>`,
});

pages["app/conta.html"] = appShell({
  page: "conta",
  current: "contas",
  title: "Conta do Pinterest",
  eyebrow: '<a href="/app/contas" data-app-link="contas">← Contas</a>',
  heading: "Conta",
  intro: "",
  scripts: ["pages/conta"],
  body: `
      <section class="dash-card" id="account-head" aria-label="Dados da conta"></section>

      <div class="dash-grid" style="margin-top:20px">
        <section class="dash-card" aria-labelledby="pastas-titulo">
          <div class="card-head">
            <h2 id="pastas-titulo">Pastas</h2>
            <div class="card-actions">
              <button class="btn btn-small btn-ghost" type="button" id="sync-boards">Sincronizar</button>
              <button class="btn btn-small btn-primary" type="button" id="new-board">Nova pasta</button>
            </div>
          </div>
          <div id="boards" class="card-body"></div>
        </section>

        <section class="dash-card" aria-labelledby="limites-titulo">
          <h2 id="limites-titulo">Limites e apelido</h2>
          <form class="form" id="account-settings" novalidate>
            <div class="field">
              <label for="daily_limit">Máximo de pins por dia nesta conta</label>
              <input id="daily_limit" name="daily_limit" type="number" min="1" max="100" required>
              <p class="hint">Publicar demais parece spam para a Pinterest e pode punir a conta e a plataforma inteira. Comece baixo (até 25) e aumente devagar.</p>
            </div>
            <div class="field">
              <label for="label">Apelido <span class="optional">(opcional)</span></label>
              <input id="label" name="label" type="text" maxlength="60" placeholder="Ex.: Loja, Cliente X">
            </div>
            <button class="btn btn-primary" type="submit">Salvar</button>
          </form>
        </section>
      </div>`,
});

const pinFormBody = (mode) => `
        <section class="dash-card" id="media-section" aria-labelledby="midia-titulo">
          <h2 id="midia-titulo">Imagem ou vídeo</h2>
          <div class="media-box" id="media-box"></div>
          <div id="cover-field" hidden>
            <p class="hint">Pins de vídeo precisam de uma imagem de capa (a Pinterest exige).</p>
            <div class="media-box" id="cover-box"></div>
          </div>
        </section>

        <section class="dash-card" aria-labelledby="texto-titulo">
          <h2 id="texto-titulo">Texto e link</h2>
          <div class="field">
            <label for="title">Título</label>
            <input id="title" name="title" type="text" maxlength="100" placeholder="Ex.: Bolo de cenoura fofinho em 40 minutos">
          </div>
          <div class="field">
            <label for="description">Descrição</label>
            <textarea id="description" name="description" rows="4" maxlength="800" placeholder="Conte o que a pessoa encontra ao clicar. Palavras-chave ajudam na busca da Pinterest."></textarea>
          </div>
          <div class="field">
            <label for="link">Link de destino <span class="optional">(opcional)</span></label>
            <input id="link" name="link" type="url" maxlength="2048" placeholder="https://seusite.com/pagina">
          </div>
          <div class="field">
            <label for="alt_text">Texto alternativo <span class="optional">(acessibilidade)</span></label>
            <input id="alt_text" name="alt_text" type="text" maxlength="500" placeholder="Descreva a imagem para quem não pode vê-la">
          </div>
        </section>

        <section class="dash-card" aria-labelledby="destino-titulo">
          <h2 id="destino-titulo">${mode === "edit" ? "Pasta" : "Contas e pastas"}</h2>
          ${mode === "edit" ? "" : '<p class="hint">Marque as contas e escolha a pasta em cada uma. Um pin é criado por conta.</p>'}
          <div id="targets" class="targets"></div>
        </section>

        <section class="dash-card" id="when-section" aria-labelledby="quando-titulo">
          <h2 id="quando-titulo">Quando publicar</h2>
          <div class="radio-row">
            <label class="check"><input type="radio" name="when" value="now"${mode === "edit" ? "" : " checked"}><span>Publicar agora</span></label>
            <label class="check"><input type="radio" name="when" value="later"${mode === "edit" ? " checked" : ""}><span>Programar</span></label>
          </div>
          <div class="field">
            <label for="scheduled_at">Data e hora</label>
            <input id="scheduled_at" name="scheduled_at" type="datetime-local">
            <p class="hint" id="tz-note"></p>
          </div>
        </section>

        <div class="form-foot">
          <button class="btn btn-primary" type="submit">${mode === "edit" ? "Salvar alterações" : "Programar pin"}</button>
          <p class="form-msg" id="form-msg" role="alert" aria-live="polite"></p>
        </div>`;

pages["app/pin-novo.html"] = appShell({
  page: "pin-novo",
  current: "pins:novo",
  title: "Novo pin",
  eyebrow: '<a href="/app/pins" data-app-link="pins">← Pins</a>',
  heading: "Novo pin",
  intro: "Imagem ou vídeo, texto, contas, pastas e horário.",
  scripts: ["vendor/vercel-blob-client", "pages/media-picker", "pages/pin-form", "pages/pin-novo"],
  body: `
      <form class="form pin-form" id="pin-form" novalidate>${pinFormBody("new")}
      </form>`,
});

pages["app/pin.html"] = appShell({
  page: "pin",
  current: "pins",
  title: "Pin",
  eyebrow: '<a href="/app/pins" data-app-link="pins">← Pins</a>',
  heading: "Pin",
  intro: "",
  scripts: ["vendor/vercel-blob-client", "pages/media-picker", "pages/pin-form", "pages/pin"],
  body: `
      <section class="dash-card pin-detail" id="pin-head" aria-label="Pin"></section>

      <div class="dash-grid" style="margin-top:20px">
        <section class="dash-card dash-card-wide" id="edit-card" aria-labelledby="editar-titulo" hidden>
          <h2 id="editar-titulo">Editar</h2>
          <p class="hint" id="edit-note"></p>
          <form class="form pin-form" id="pin-form" novalidate>${pinFormBody("edit")}
          </form>
        </section>

        <section class="dash-card dash-card-wide" id="metrics-card" aria-labelledby="metricas-titulo" hidden>
          <div class="card-head">
            <h2 id="metricas-titulo">Resultados (30 dias)</h2>
            <a href="/app/analises" data-app-link="analises">Ver análises</a>
          </div>
          <div id="pin-metrics" class="card-body"></div>
        </section>

        <section class="dash-card dash-card-wide" aria-labelledby="eventos-titulo">
          <h2 id="eventos-titulo">Histórico deste pin</h2>
          <div id="pin-events" class="card-body"></div>
        </section>
      </div>`,
});

pages["app/pins.html"] = appShell({
  page: "pins",
  title: "Pins",
  eyebrow: "Pins",
  heading: "Pins",
  intro: "Tudo o que está na fila, publicado, cancelado ou com falha.",
  actions: '<a class="btn btn-primary" href="/app/pins/novo" data-app-link="pins:novo">Novo pin</a>',
  scripts: ["pages/pins"],
  body: `
      <div class="toolbar">
        <div class="chips" role="group" aria-label="Situação">
          <button type="button" class="chip" data-status-chip="" aria-pressed="true">Todos</button>
          <button type="button" class="chip" data-status-chip="scheduled" aria-pressed="false">Programados</button>
          <button type="button" class="chip" data-status-chip="published" aria-pressed="false">Publicados</button>
          <button type="button" class="chip" data-status-chip="failed" aria-pressed="false">Com falha</button>
          <button type="button" class="chip" data-status-chip="canceled" aria-pressed="false">Cancelados</button>
        </div>
        <div class="toolbar-right">
          <select id="filter-account" aria-label="Conta"><option value="">Todas as contas</option></select>
          <div class="segmented" role="group" aria-label="Visão">
            <button type="button" data-view="list" aria-pressed="true">Lista</button>
            <button type="button" data-view="calendar" aria-pressed="false">Calendário</button>
          </div>
        </div>
      </div>
      <p class="hint" id="pins-count"></p>
      <div id="pins-list"></div>
      <div id="pins-calendar" class="calendar" hidden></div>
      <p style="margin-top:16px"><button class="btn btn-ghost" type="button" id="load-more" hidden>Carregar mais</button></p>`,
});

pages["app/analises.html"] = appShell({
  page: "analises",
  title: "Análises",
  eyebrow: "Análises",
  heading: "Análises",
  intro: "Impressões, salvamentos, cliques e visualizações dos pins que você publicou pela plataforma. Só você vê os seus.",
  actions: '<button class="btn btn-ghost" type="button" id="refresh-btn">Atualizar dados</button>',
  scripts: ["pages/chart", "pages/analises"],
  body: `
      <div class="toolbar">
        <div class="chips" role="group" aria-label="Período">
          <button type="button" class="chip" data-days="7" aria-pressed="false">7 dias</button>
          <button type="button" class="chip" data-days="14" aria-pressed="false">14 dias</button>
          <button type="button" class="chip" data-days="30" aria-pressed="true">30 dias</button>
          <button type="button" class="chip" data-days="90" aria-pressed="false">90 dias</button>
        </div>
        <div class="toolbar-right">
          <select id="filter-account" aria-label="Conta"><option value="">Todas as contas</option></select>
          <div class="segmented" role="group" aria-label="Tipo">
            <button type="button" data-kind="" aria-pressed="true">Todos</button>
            <button type="button" data-kind="image" aria-pressed="false">Imagens</button>
            <button type="button" data-kind="video" aria-pressed="false">Vídeos</button>
          </div>
        </div>
      </div>
      <p class="hint" id="updated-at"></p>
      <p class="notice is-warn" id="analytics-notice" hidden></p>

      <section class="stats" id="stats" aria-label="Totais do período"></section>

      <div class="dash-grid dash-grid-main">
        <section class="dash-card dash-card-wide" id="chart-card" aria-labelledby="grafico-titulo">
          <h2 id="grafico-titulo">Por dia</h2>
          <div id="chart" class="chart card-body"></div>
        </section>

        <section class="dash-card" id="accounts-card" aria-labelledby="contas-titulo" hidden>
          <h2 id="contas-titulo">Por conta (perfil inteiro na Pinterest)</h2>
          <div id="accounts" class="card-body accounts-metrics"></div>
        </section>

        <section class="dash-card" id="top-card" aria-labelledby="top-titulo" hidden>
          <h2 id="top-titulo">Mais vistos</h2>
          <div id="top-pins" class="card-body"></div>
          <div id="top-videos-block" class="card-body" hidden>
            <h3 class="sub-title">Vídeos mais assistidos</h3>
            <div id="top-videos"></div>
          </div>
        </section>

        <section class="dash-card dash-card-wide" id="table-card" aria-label="Todos os pins"></section>
      </div>`,
});

pages["app/analise-pin.html"] = appShell({
  page: "analise-pin",
  current: "analises",
  title: "Análise do pin",
  eyebrow: '<a href="/app/analises" data-app-link="analises">← Análises</a>',
  heading: "Análise do pin",
  intro: "",
  scripts: ["pages/chart", "pages/analise-pin"],
  body: `
      <section class="dash-card pin-detail" id="pin-head" aria-label="Pin"></section>

      <div id="content">
        <div class="toolbar" style="margin-top:20px">
          <div class="chips" role="group" aria-label="Período">
            <button type="button" class="chip" data-days="7" aria-pressed="false">7 dias</button>
            <button type="button" class="chip" data-days="14" aria-pressed="false">14 dias</button>
            <button type="button" class="chip" data-days="30" aria-pressed="true">30 dias</button>
            <button type="button" class="chip" data-days="90" aria-pressed="false">90 dias</button>
          </div>
        </div>
        <p class="hint" id="updated-at"></p>
        <p class="notice is-warn" id="pin-notice" hidden></p>

        <section class="stats" id="stats" aria-label="Métricas do período"></section>
        <p class="hint" id="avg-note" style="margin-top:8px"></p>

        <div class="dash-grid dash-grid-main">
          <section class="dash-card dash-card-wide" id="video-card" aria-labelledby="video-titulo" hidden>
            <h2 id="video-titulo">Vídeo</h2>
            <section class="stats stats-compact" id="video-stats" aria-label="Métricas do vídeo"></section>
            <h3 class="sub-title">Funil de audiência</h3>
            <div id="funnel" class="funnel card-body"></div>
          </section>

          <section class="dash-card dash-card-wide" aria-labelledby="grafico-titulo">
            <h2 id="grafico-titulo">Por dia</h2>
            <div id="chart" class="chart card-body"></div>
          </section>

          <section class="dash-card dash-card-wide" id="chart-video-card" aria-labelledby="grafico-video-titulo" hidden>
            <h2 id="grafico-video-titulo">Visualizações por dia</h2>
            <div id="chart-video" class="chart card-body"></div>
          </section>
        </div>
      </div>`,
});

pages["app/historico.html"] = appShell({
  page: "historico",
  title: "Histórico",
  eyebrow: "Histórico",
  heading: "Histórico",
  intro: "O que foi publicado, o que falhou e por quê, contas conectadas e mudanças na sua conta.",
  scripts: ["pages/historico"],
  body: `
      <div class="toolbar">
        <div class="chips" role="group" aria-label="Tipo">
          <button type="button" class="chip" data-kind-chip="" aria-pressed="true">Tudo</button>
          <button type="button" class="chip" data-kind-chip="pin" aria-pressed="false">Pins</button>
          <button type="button" class="chip" data-kind-chip="account" aria-pressed="false">Contas</button>
          <button type="button" class="chip" data-kind-chip="board" aria-pressed="false">Pastas</button>
          <button type="button" class="chip" data-kind-chip="password" aria-pressed="false">Segurança</button>
        </div>
      </div>
      <div id="activity"></div>
      <p style="margin-top:16px"><button class="btn btn-ghost" type="button" id="load-more" hidden>Carregar mais</button></p>`,
});

pages["app/configuracoes.html"] = appShell({
  page: "configuracoes",
  title: "Configurações",
  eyebrow: "Configurações",
  heading: "Configurações",
  intro: "Dados da sua conta na plataforma.",
  scripts: ["pages/configuracoes"],
  body: `
      <div class="dash-grid">
        <section class="dash-card" aria-labelledby="perfil-titulo">
          <h2 id="perfil-titulo">Perfil e preferências</h2>
          <p class="notice is-warn" id="verify-box" hidden>Seu e-mail ainda não foi confirmado. <button class="btn btn-small btn-ghost" type="button" id="verify-send">Reenviar confirmação</button></p>
          <form class="form" id="profile-form" novalidate>
            <div class="field">
              <label for="email">E-mail</label>
              <input id="email" type="email" readonly>
            </div>
            <div class="field">
              <label for="name">Nome</label>
              <input id="name" name="name" type="text" autocomplete="name" maxlength="80">
            </div>
            <div class="field">
              <label for="timezone">Fuso horário</label>
              <select id="timezone" name="timezone"></select>
              <p class="hint">Os horários dos pins são mostrados e programados neste fuso.</p>
            </div>
            <label class="check"><input type="checkbox" name="notify_failures"><span>Avisar por e-mail quando um pin falhar</span></label>
            <label class="check"><input type="checkbox" name="notify_token_expiry"><span>Avisar por e-mail quando uma conta precisar ser reconectada</span></label>
            <button class="btn btn-primary" type="submit">Salvar</button>
          </form>
        </section>

        <section class="dash-card" aria-labelledby="senha-titulo">
          <h2 id="senha-titulo">Senha</h2>
          <form class="form" id="password-form" novalidate>
${pw("currentPassword", "currentPassword", "current-password", "Senha atual")}
            <div class="field">
              <label for="newPassword">Nova senha</label>
              <div class="pw">
                <input id="newPassword" name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required>
                <button class="pw-toggle" type="button" aria-controls="newPassword" aria-pressed="false">Mostrar</button>
              </div>
              <p class="hint">Pelo menos 8 caracteres.</p>
            </div>
${pw("password2", "password2", "new-password", "Repita a nova senha")}
            <button class="btn btn-primary" type="submit">Trocar senha</button>
            <p class="form-msg" id="password-msg" role="alert" aria-live="polite"></p>
            <p class="hint">Ao trocar a senha, os outros aparelhos conectados são desconectados.</p>
          </form>
        </section>

        <section class="dash-card" aria-labelledby="sessoes-titulo">
          <div class="card-head">
            <h2 id="sessoes-titulo">Aparelhos conectados</h2>
            <button class="btn btn-small btn-ghost" type="button" id="revoke-others">Sair dos outros</button>
          </div>
          <div id="sessions" class="card-body"><p class="hint">Carregando...</p></div>
        </section>

        <section class="dash-card danger-zone" aria-labelledby="excluir-titulo">
          <h2 id="excluir-titulo">Excluir conta</h2>
          <p>Apaga sua conta na plataforma, as contas do Pinterest conectadas, os pins programados, os arquivos e o histórico. Nada é apagado na Pinterest.</p>
          <button class="btn btn-danger-ghost" type="button" id="delete-account">Excluir minha conta</button>
        </section>
      </div>`,
});

/* ---------- 404 ---------- */

pages["404.html"] = `${head("Página não encontrada")}<body>
  <header class="site-header is-scrolled">
    <div class="container nav">
      ${LOGO("/", "Página inicial")}
      <a class="btn btn-ghost btn-small" href="/app/dashboard">Ir para a plataforma</a>
    </div>
  </header>
  <main class="auth">
    <div class="container">
      <section class="auth-card">
        <p class="eyebrow">Erro 404</p>
        <h1>Página não encontrada</h1>
        <p class="section-intro">O endereço pode estar errado ou a página foi movida.</p>
        <p class="auth-alt" style="text-align:left"><a href="/">Página inicial</a> · <a href="/app/dashboard">Dashboard</a></p>
      </section>
    </div>
  </main>
${scripts(["config", "main"])}
</body>
</html>
`;

Object.keys(pages).forEach((file) => {
  const full = path.join(ROOT, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, pages[file]);
  console.log("gerado " + file);
});

// Versão dos arquivos estáticos também na landing e nas páginas legais
["index.html", "privacidade.html", "termos.html"].forEach((file) => {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return;
  let s = fs.readFileSync(full, "utf8");
  s = s.replace(/href="\/css\/style\.css(\?v=[^"]*)?"/g, `href="/css/style.css?v=${V}"`);
  s = s.replace(/src="\/js\/(config|main|auth)\.js(\?v=[^"]*)?"/g, `src="/js/$1.js?v=${V}"`);
  fs.writeFileSync(full, s);
});
console.log("versão dos arquivos estáticos: " + V);
