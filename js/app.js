/* Casca da plataforma (/app/*): sessão, modo de visualização, barra lateral, links com o id
 * da conta, estado dos serviços e disparo da fila de publicação. Expõe window.App. */
(function () {
  "use strict";

  var body = document.body;
  if (body.getAttribute("data-app") !== "1") return;

  var App = {
    page: body.getAttribute("data-page"),
    user: null,
    status: null,
    preview: false,
    api: UI.api,
  };

  var APP_PAGES = { login: 1, cadastro: 1, dashboard: 1, contas: 1, conta: 1, pins: 1, "pin-novo": 1, pin: 1, historico: 1, analises: 1, configuracoes: 1 };

  /* ---------- URLs: /app/<página>/<id da conta>[/<item>] ---------- */

  App.parts = function () {
    var parts = window.location.pathname.split("/").filter(Boolean);
    if (parts[0] !== "app") return { section: "", id: "", item: "" };
    var section = parts[1] || "";
    var id = parts[2] ? decodeURIComponent(parts[2]) : "";
    var item = parts[3] ? decodeURIComponent(parts[3]) : "";
    return { section: section, id: id, item: item };
  };

  App.url = function (section, item) {
    var id = App.user ? App.user.id : App.parts().id;
    return "/app/" + section + (id ? "/" + encodeURIComponent(id) : "") + (item ? "/" + encodeURIComponent(item) : "");
  };

  function fixUrl() {
    var p = App.parts();
    var canonical = { conta: "contas", pin: "pins", "pin-novo": "pins" }[App.page] || App.page;
    if (!APP_PAGES[canonical] && canonical !== "contas" && canonical !== "pins") return;
    var wanted = "/app/" + canonical + "/" + encodeURIComponent(App.user.id) + (p.item ? "/" + encodeURIComponent(p.item) : "");
    if (window.location.pathname !== wanted) {
      window.history.replaceState(null, "", wanted + window.location.search + window.location.hash);
    }
    document.querySelectorAll("[data-app-link]").forEach(function (a) {
      var spec = a.getAttribute("data-app-link").split(":");
      a.setAttribute("href", App.url(spec[0], spec[1] || ""));
    });
  }

  App.item = function () {
    return App.parts().item;
  };

  App.query = function (name) {
    return new URLSearchParams(window.location.search).get(name);
  };

  /* ---------- Modo de visualização (sem banco) ---------- */

  function showPreviewBanner() {
    var main = document.getElementById("app-main");
    if (!main || document.getElementById("preview-banner")) return;
    var banner = UI.el("p", { id: "preview-banner", class: "preview-banner", role: "status", text: "Modo de visualização: as telas estão abertas sem login enquanto o banco de dados não é ligado. Nada é salvo." });
    main.insertBefore(banner, main.firstChild);
  }

  /* ---------- Barra lateral no celular ---------- */

  var sidebar = document.getElementById("sidebar");
  var sidebarToggle = document.getElementById("sidebar-toggle");
  var backdrop = document.getElementById("sidebar-backdrop");

  function setSidebar(open) {
    if (!sidebar) return;
    sidebar.classList.toggle("is-open", open);
    body.classList.toggle("sidebar-open", open);
    if (backdrop) backdrop.hidden = !open;
    if (sidebarToggle) {
      sidebarToggle.setAttribute("aria-expanded", open ? "true" : "false");
      sidebarToggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
    }
  }
  if (sidebarToggle) sidebarToggle.addEventListener("click", function () { setSidebar(!sidebar.classList.contains("is-open")); });
  if (backdrop) backdrop.addEventListener("click", function () { setSidebar(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && sidebar && sidebar.classList.contains("is-open")) setSidebar(false);
  });

  /* ---------- Sair ---------- */

  var logout = document.getElementById("logout");
  if (logout) {
    logout.addEventListener("click", function () {
      logout.disabled = true;
      UI.api("/api/auth/logout", { method: "POST", body: {} }).then(function () {
        window.location.replace(App.preview ? "/" : "/app/login");
      });
    });
  }

  /* ---------- Fila de publicação: quem está com a plataforma aberta ajuda a processar ---------- */

  var workerTimer = null;
  function pingWorker(force) {
    if (App.preview || !App.status || !App.status.db || document.hidden) return;
    // Evita bater no servidor a cada troca de página: no máximo uma vez a cada 30 s por navegador.
    try {
      var last = Number(localStorage.getItem("pf_worker_ping") || 0);
      if (!force && Date.now() - last < 30 * 1000) return;
      localStorage.setItem("pf_worker_ping", String(Date.now()));
    } catch (e) {
      /* armazenamento indisponível: segue sem a trava */
    }
    UI.api("/api/worker/run", { method: "POST", body: {} }).then(function (r) {
      if (r.status === 200 && r.data && (r.data.published || r.data.failed)) {
        document.dispatchEvent(new CustomEvent("pinflow:queue", { detail: r.data }));
      }
    });
  }
  function startWorkerPing() {
    pingWorker();
    workerTimer = setInterval(function () { pingWorker(true); }, 60 * 1000);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) pingWorker();
    });
  }

  /* ---------- Carregamento ---------- */

  function renderUser(user) {
    var shownName = user.name || user.email.split("@")[0];
    document.querySelectorAll("[data-user-name]").forEach(function (el) { el.textContent = shownName; });
    document.querySelectorAll("[data-user-email]").forEach(function (el) { el.textContent = user.email; });
    document.querySelectorAll("[data-user-initial]").forEach(function (el) { el.textContent = shownName.charAt(0).toUpperCase(); });
  }

  var readyCallbacks = [];
  var isReady = false;
  App.ready = function (fn) {
    if (isReady) fn(App);
    else readyCallbacks.push(fn);
  };

  function finish() {
    var main = document.getElementById("app-main");
    var loading = document.getElementById("app-loading");
    if (loading) loading.hidden = true;
    if (main) main.hidden = false;
    isReady = true;
    readyCallbacks.forEach(function (fn) {
      try {
        fn(App);
      } catch (e) {
        console.error(e);
      }
    });
    readyCallbacks = [];
  }

  Promise.all([UI.api("/api/auth/me"), UI.api("/api/status")]).then(function (results) {
    var me = results[0];
    App.status = (results[1].status === 200 && results[1].data) || { db: false, storage: null, pinterest: false, mail: false, limits: {} };
    if (me.status === 200 && me.data && me.data.ok) {
      App.user = me.data.user;
    } else if (me.status === 503 && me.data && me.data.error && me.data.error.code === "not_configured") {
      App.preview = true;
      App.user = { id: App.parts().id || "visualizacao", email: "sem login por enquanto", name: "Visitante", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      showPreviewBanner();
    } else {
      window.location.replace("/app/login" + (App.parts().id ? "/" + encodeURIComponent(App.parts().id) : ""));
      return;
    }
    fixUrl();
    renderUser(App.user);
    finish();
    if (!App.preview) startWorkerPing();
  });

  // Pede para processar a fila agora (ex.: depois de "publicar agora")
  App.runQueue = function () {
    pingWorker(true);
  };

  // Mensagem padrão quando uma ação não é possível no modo de visualização
  App.guard = function () {
    if (!App.preview) return true;
    UI.toast("No modo de visualização nada é salvo. Ligue o banco de dados para usar de verdade.", "info");
    return false;
  };

  /* ---------- Vocabulário compartilhado pelas telas ---------- */

  App.PIN_STATUS = {
    scheduled: { label: "Programado", cls: "is-scheduled" },
    publishing: { label: "Publicando", cls: "is-publishing" },
    published: { label: "Publicado", cls: "is-published" },
    failed: { label: "Falhou", cls: "is-failed" },
    canceled: { label: "Cancelado", cls: "is-canceled" },
  };
  App.ACCOUNT_STATUS = {
    active: { label: "Ativa", cls: "is-published" },
    needs_reconnect: { label: "Precisa reconectar", cls: "is-failed" },
    disconnected: { label: "Desconectada", cls: "is-canceled" },
  };
  App.badge = function (map, status) {
    var s = map[status] || { label: status, cls: "" };
    return UI.el("span", { class: "badge " + s.cls, text: s.label });
  };
  App.pinBadge = function (status) {
    return App.badge(App.PIN_STATUS, status);
  };
  App.accountBadge = function (status) {
    return App.badge(App.ACCOUNT_STATUS, status);
  };
  App.thumb = function (media, size) {
    var box = UI.el("div", { class: "thumb" + (size === "lg" ? " thumb-lg" : "") });
    if (!media) {
      box.classList.add("thumb-empty");
      return box;
    }
    if (media.kind === "video") {
      var v = UI.el("video", { src: media.url, muted: true, playsinline: true, preload: "metadata" });
      box.appendChild(v);
      box.appendChild(UI.el("span", { class: "thumb-tag", text: "vídeo" }));
    } else {
      box.appendChild(UI.el("img", { src: media.url, alt: "", loading: "lazy" }));
    }
    return box;
  };
  App.errorToast = function (result) {
    UI.toast(UI.errorMessage(result), "error");
  };

  window.App = App;
})();
