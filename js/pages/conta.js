/* Detalhe de uma conta do Pinterest: dados, limites, pastas (criar, renomear, apagar). */
(function () {
  "use strict";

  App.ready(function () {
    var accId = App.item();
    var head = document.getElementById("account-head");
    var boardsWrap = document.getElementById("boards");
    var settingsForm = document.getElementById("account-settings");
    var account = null;

    if (App.query("conectada") === "1") {
      UI.toast("Conta conectada. Pastas sincronizadas.", "ok");
      window.history.replaceState(null, "", window.location.pathname);
    }

    if (App.preview) {
      head.appendChild(UI.empty("Modo de visualização", "Conecte o banco de dados para ver contas de verdade."));
      settingsForm.hidden = true;
      return;
    }

    function renderHead(a) {
      head.innerHTML = "";
      head.appendChild(UI.el("div", { class: "account-head" }, [
        a.profile_image ? UI.el("img", { class: "avatar-img avatar-lg", src: a.profile_image, alt: "" }) : UI.el("div", { class: "avatar avatar-lg", text: (a.username || "?").charAt(0).toUpperCase() }),
        UI.el("div", { class: "account-title" }, [
          UI.el("h1", { text: "@" + (a.username || "conta") }),
          UI.el("span", { text: [a.display_name, a.is_business ? "Business" : "Conta pessoal", a.website_url].filter(Boolean).join(" · ") }),
        ]),
        App.accountBadge(a.status),
      ]));
      var actions = UI.el("div", { class: "card-actions" });
      if (a.status === "needs_reconnect") actions.appendChild(UI.el("a", { class: "btn btn-primary", href: "/api/pinterest/connect", text: "Reconectar" }));
      if (a.status === "active") actions.appendChild(UI.el("a", { class: "btn btn-primary", href: App.url("pins", "novo") + "?conta=" + encodeURIComponent(a.id), text: "Novo pin nesta conta" }));
      actions.appendChild(UI.el("button", { class: "btn btn-ghost", type: "button", text: "Desconectar", onclick: disconnect }));
      head.appendChild(actions);
      if (a.last_error && a.status !== "active") head.appendChild(UI.el("p", { class: "account-error", text: a.last_error }));
      head.appendChild(UI.el("dl", { class: "account-stats" }, [
        UI.el("div", {}, [UI.el("dt", { text: "Programados" }), UI.el("dd", { text: String(a.scheduled_count || 0) })]),
        UI.el("div", {}, [UI.el("dt", { text: "Publicados (24h)" }), UI.el("dd", { text: (a.published_today || 0) + " / " + a.daily_limit })]),
        UI.el("div", {}, [UI.el("dt", { text: "Com falha" }), UI.el("dd", { text: String(a.failed_count || 0) })]),
        UI.el("div", {}, [UI.el("dt", { text: "Acesso válido até" }), UI.el("dd", { text: a.token_expires_at ? UI.formatDate(a.token_expires_at) : "—" })]),
      ]));
      settingsForm.daily_limit.value = a.daily_limit;
      settingsForm.label.value = a.label || "";
    }

    function boardRow(b) {
      var more = UI.el("button", { class: "icon-btn", type: "button", "aria-label": "Ações da pasta", html: "&#8942;" });
      more.addEventListener("click", function () {
        UI.menu(more, [
          { label: "Novo pin nesta pasta", disabled: account.status !== "active", onClick: function () { window.location.href = App.url("pins", "novo") + "?conta=" + encodeURIComponent(account.id) + "&pasta=" + encodeURIComponent(b.id); } },
          { label: "Renomear", disabled: account.status !== "active", onClick: function () { editBoard(b); } },
          { separator: true },
          { label: "Apagar na Pinterest", danger: true, disabled: account.status !== "active", onClick: function () { deleteBoard(b); } },
        ]);
      });
      return UI.el("li", { class: "board-row" }, [
        b.image_cover_url ? UI.el("img", { class: "board-cover", src: b.image_cover_url, alt: "" }) : UI.el("div", { class: "board-cover board-cover-empty" }),
        UI.el("div", { class: "board-text" }, [
          UI.el("strong", { text: b.name }),
          UI.el("span", { text: [b.privacy === "SECRET" ? "Secreta" : b.privacy === "PROTECTED" ? "Protegida" : "Pública", b.pin_count + " pins"].join(" · ") }),
        ]),
        more,
      ]);
    }

    function renderBoards(boards) {
      boardsWrap.innerHTML = "";
      if (!boards.length) {
        boardsWrap.appendChild(UI.empty("Nenhuma pasta encontrada.", "Crie uma pasta aqui ou sincronize se você criou pastas na Pinterest."));
        return;
      }
      var ul = UI.el("ul", { class: "board-list" });
      boards.forEach(function (b) { ul.appendChild(boardRow(b)); });
      boardsWrap.appendChild(ul);
    }

    function load() {
      UI.api("/api/accounts/" + encodeURIComponent(accId)).then(function (r) {
        if (r.status === 404) {
          head.appendChild(UI.empty("Conta não encontrada.", "Ela pode ter sido desconectada.", UI.el("a", { class: "btn btn-primary", href: App.url("contas"), text: "Ver contas" })));
          settingsForm.hidden = true;
          return;
        }
        if (r.status !== 200) return App.errorToast(r);
        account = r.data.account;
        renderHead(account);
        renderBoards(r.data.boards);
      });
    }

    function disconnect() {
      UI.confirm({
        title: "Desconectar @" + account.username + "?",
        message: "A plataforma deixa de ter acesso a esta conta. Pins programados para ela serão cancelados. Nada é apagado na Pinterest.",
        confirmText: "Desconectar",
        danger: true,
      }).then(function (ok) {
        if (!ok) return;
        UI.api("/api/accounts/" + account.id, { method: "DELETE" }).then(function (r) {
          if (r.status !== 200) return App.errorToast(r);
          window.location.href = App.url("contas");
        });
      });
    }

    function editBoard(b) {
      UI.dialog({
        title: "Renomear pasta",
        content:
          '<div class="field"><label for="name">Nome</label><input id="name" name="name" type="text" maxlength="180" required value="' + UI.escape(b.name) + '"></div>' +
          '<div class="field"><label for="description">Descrição</label><textarea id="description" name="description" rows="3" maxlength="500">' + UI.escape(b.description || "") + "</textarea></div>",
        submitText: "Salvar na Pinterest",
        onSubmit: function (form) {
          return UI.api("/api/accounts/" + account.id + "/boards/" + encodeURIComponent(b.id), { method: "PATCH", body: { name: form.name.value.trim(), description: form.description.value.trim() } }).then(function (r) {
            UI.throwIfError(r);
            UI.toast("Pasta atualizada.", "ok");
            load();
            return true;
          });
        },
      });
    }

    function deleteBoard(b) {
      UI.confirm({
        title: "Apagar a pasta \"" + b.name + "\" na Pinterest?",
        message: "Isso apaga a pasta e todos os " + b.pin_count + " pins dela na Pinterest. Não dá para desfazer.",
        confirmText: "Apagar na Pinterest",
        danger: true,
        typeToConfirm: "APAGAR",
      }).then(function (ok) {
        if (!ok) return;
        UI.api("/api/accounts/" + account.id + "/boards/" + encodeURIComponent(b.id), { method: "DELETE" }).then(function (r) {
          if (r.status !== 200) return App.errorToast(r);
          UI.toast("Pasta apagada.", "ok");
          load();
        });
      });
    }

    document.getElementById("new-board").addEventListener("click", function () {
      if (!account || account.status !== "active") return UI.toast("Reconecte a conta para criar pastas.", "error");
      UI.dialog({
        title: "Nova pasta na Pinterest",
        content:
          '<div class="field"><label for="name">Nome</label><input id="name" name="name" type="text" maxlength="180" required placeholder="Ex.: Receitas rápidas"></div>' +
          '<div class="field"><label for="description">Descrição (opcional)</label><textarea id="description" name="description" rows="3" maxlength="500"></textarea></div>' +
          '<div class="field"><label for="privacy">Visibilidade</label><select id="privacy" name="privacy"><option value="PUBLIC">Pública</option><option value="SECRET">Secreta</option></select></div>',
        submitText: "Criar na Pinterest",
        focus: "#name",
        onSubmit: function (form) {
          if (!form.name.value.trim()) {
            var e = new Error("Dê um nome à pasta.");
            e.field = "name";
            throw e;
          }
          return UI.api("/api/accounts/" + account.id + "/boards", { method: "POST", body: { name: form.name.value.trim(), description: form.description.value.trim(), privacy: form.privacy.value } }).then(function (r) {
            UI.throwIfError(r, 201);
            UI.toast("Pasta criada na Pinterest.", "ok");
            load();
            return true;
          });
        },
      });
    });

    document.getElementById("sync-boards").addEventListener("click", function () {
      var btn = this;
      UI.busy(btn, true, "Sincronizando...");
      UI.api("/api/accounts/" + encodeURIComponent(accId) + "/sync", { method: "POST", body: {} }).then(function (r) {
        UI.busy(btn, false);
        if (r.status !== 200) return App.errorToast(r);
        UI.toast(r.data.boards.length + " pasta(s) sincronizada(s).", "ok");
        renderBoards(r.data.boards);
      });
    });

    settingsForm.addEventListener("submit", function (e) {
      e.preventDefault();
      UI.clearErrors(settingsForm);
      var btn = settingsForm.querySelector("button[type=submit]");
      UI.busy(btn, true, "Salvando...");
      UI.api("/api/accounts/" + encodeURIComponent(accId), { method: "PATCH", body: { daily_limit: Number(settingsForm.daily_limit.value), label: settingsForm.label.value.trim() } }).then(function (r) {
        UI.busy(btn, false);
        if (r.status !== 200) {
          var field = r.data && r.data.error && r.data.error.field;
          if (!(field && UI.fieldError(settingsForm, field, UI.errorMessage(r)))) App.errorToast(r);
          return;
        }
        UI.toast("Configurações da conta salvas.", "ok");
        load();
      });
    });

    load();
  });
})();
