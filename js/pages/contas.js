/* Contas do Pinterest: lista, conectar, reconectar, desconectar. */
(function () {
  "use strict";

  App.ready(function () {
    var list = document.getElementById("accounts-list");
    var connectBtn = document.getElementById("connect-btn");
    var notice = document.getElementById("accounts-notice");

    var ERRORS = {
      estado_invalido: "A conexão expirou ou foi aberta em outro navegador. Tente de novo.",
      recusado: "Você não autorizou o acesso na Pinterest.",
      sem_codigo: "A Pinterest não devolveu a autorização. Tente de novo.",
      limite_contas: "Você atingiu o limite de contas conectadas.",
      pinterest_not_configured: "A conexão com a Pinterest ainda não está configurada nesta plataforma.",
    };

    var erro = App.query("erro");
    if (erro) UI.toast(ERRORS[erro] || App.query("msg") || "Não foi possível conectar a conta.", "error", 9000);
    if (App.query("conectada") === "1") UI.toast("Conta conectada. Pastas sincronizadas.", "ok");
    if (erro || App.query("conectada")) window.history.replaceState(null, "", window.location.pathname);

    connectBtn.addEventListener("click", function (e) {
      if (App.preview) {
        e.preventDefault();
        App.guard();
        return;
      }
      if (App.status && !App.status.pinterest) {
        e.preventDefault();
        UI.alert({ title: "Conexão ainda não configurada", message: "A chave do app da Pinterest ainda não foi colocada na plataforma. Assim que for, este botão abre o login oficial da Pinterest." });
      }
    });

    function card(a) {
      var actions = UI.el("div", { class: "card-actions" });
      actions.appendChild(UI.el("a", { class: "btn btn-small btn-ghost", href: App.url("contas", a.id), text: "Abrir" }));
      if (a.status === "needs_reconnect") actions.appendChild(UI.el("a", { class: "btn btn-small btn-primary", href: "/api/pinterest/connect", text: "Reconectar" }));
      if (a.status === "active") actions.appendChild(UI.el("a", { class: "btn btn-small btn-primary", href: App.url("pins", "novo") + "?conta=" + encodeURIComponent(a.id), text: "Novo pin" }));
      var more = UI.el("button", { class: "icon-btn", type: "button", "aria-label": "Mais ações", html: "&#8942;" });
      more.addEventListener("click", function () {
        UI.menu(more, [
          { label: "Sincronizar pastas", disabled: a.status !== "active", onClick: function () { sync(a); } },
          { label: "Desconectar", danger: true, onClick: function () { disconnect(a); } },
        ]);
      });
      actions.appendChild(more);

      return UI.el("article", { class: "account-card" }, [
        UI.el("div", { class: "account-head" }, [
          a.profile_image ? UI.el("img", { class: "avatar-img", src: a.profile_image, alt: "" }) : UI.el("div", { class: "avatar", text: (a.username || "?").charAt(0).toUpperCase() }),
          UI.el("div", { class: "account-title" }, [
            UI.el("strong", { text: "@" + (a.username || "conta") }),
            UI.el("span", { text: (a.label ? a.label + " · " : "") + (a.display_name || "") }),
          ]),
          App.accountBadge(a.status),
        ]),
        a.last_error && a.status !== "active" ? UI.el("p", { class: "account-error", text: a.last_error }) : null,
        !a.is_business ? UI.el("p", { class: "hint", text: "Conta pessoal: a Pinterest pode negar acesso a pastas e pins pela API. O ideal é uma conta Business." }) : null,
        UI.el("dl", { class: "account-stats" }, [
          UI.el("div", {}, [UI.el("dt", { text: "Pastas" }), UI.el("dd", { text: String(a.boards_count || 0) })]),
          UI.el("div", {}, [UI.el("dt", { text: "Programados" }), UI.el("dd", { text: String(a.scheduled_count || 0) })]),
          UI.el("div", {}, [UI.el("dt", { text: "Publicados" }), UI.el("dd", { text: String(a.published_count || 0) })]),
          UI.el("div", {}, [UI.el("dt", { text: "Limite/dia" }), UI.el("dd", { text: String(a.daily_limit) })]),
        ]),
        actions,
      ]);
    }

    function sync(a) {
      UI.toast("Sincronizando pastas de @" + a.username + "...", "info", 2000);
      UI.api("/api/accounts/" + a.id + "/sync", { method: "POST", body: {} }).then(function (r) {
        if (r.status !== 200) return App.errorToast(r);
        UI.toast(r.data.boards.length + " pasta(s) sincronizada(s).", "ok");
        load();
      });
    }

    function disconnect(a) {
      UI.confirm({
        title: "Desconectar @" + a.username + "?",
        message: "A plataforma deixa de ter acesso a esta conta e apaga os tokens. Pins programados para ela serão cancelados. O histórico fica. Nada é apagado na Pinterest.",
        confirmText: "Desconectar",
        danger: true,
      }).then(function (ok) {
        if (!ok) return;
        UI.api("/api/accounts/" + a.id, { method: "DELETE" }).then(function (r) {
          if (r.status !== 200) return App.errorToast(r);
          UI.toast("Conta desconectada." + (r.data.canceled ? " " + r.data.canceled + " pin(s) cancelado(s)." : ""), "ok");
          load();
        });
      });
    }

    function load() {
      if (App.preview) {
        list.innerHTML = "";
        list.appendChild(UI.empty("Nenhuma conta conectada ainda.", "Cada conta é conectada pelo login oficial da Pinterest. Nós nunca pedimos a senha da Pinterest."));
        return;
      }
      UI.api("/api/accounts").then(function (r) {
        if (r.status !== 200) return App.errorToast(r);
        list.innerHTML = "";
        if (!r.data.pinterest_configured) {
          notice.hidden = false;
          notice.textContent = "A conexão com a Pinterest ainda não está configurada nesta plataforma (falta a chave do app). Assim que for, o botão acima abre o login oficial.";
        }
        if (!r.data.accounts.length) {
          list.appendChild(UI.empty("Nenhuma conta conectada ainda.", "Clique em \"Conectar conta do Pinterest\": você autoriza na própria Pinterest e volta para cá. Nós nunca pedimos a senha da Pinterest."));
          return;
        }
        r.data.accounts.forEach(function (a) { list.appendChild(card(a)); });
        if (r.data.accounts.length >= r.data.max) connectBtn.disabled = true;
      });
    }

    load();
  });
})();
