/* Configurações: perfil, fuso, notificações, senha, aparelhos conectados, excluir conta. */
(function () {
  "use strict";

  var TIMEZONES = [
    "America/Sao_Paulo", "America/Fortaleza", "America/Recife", "America/Bahia", "America/Belem", "America/Manaus", "America/Cuiaba", "America/Campo_Grande", "America/Porto_Velho", "America/Rio_Branco", "America/Noronha",
    "America/Buenos_Aires", "America/Santiago", "America/Bogota", "America/Lima", "America/Mexico_City", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
    "Europe/Lisbon", "Europe/London", "Europe/Madrid", "Europe/Paris", "Europe/Berlin", "Europe/Rome", "Africa/Luanda", "Africa/Maputo", "Asia/Tokyo", "Australia/Sydney", "UTC",
  ];

  App.ready(function () {
    var profileForm = document.getElementById("profile-form");
    var passwordForm = document.getElementById("password-form");
    var sessionsWrap = document.getElementById("sessions");
    var verifyBox = document.getElementById("verify-box");
    var tzSelect = profileForm.timezone;

    var current = App.user.timezone || "America/Sao_Paulo";
    var zones = TIMEZONES.slice();
    if (zones.indexOf(current) < 0) zones.unshift(current);
    zones.forEach(function (z) { tzSelect.appendChild(UI.el("option", { value: z, text: z.replace(/_/g, " ") })); });
    tzSelect.value = current;

    document.getElementById("email").value = App.user.email;
    profileForm.name.value = App.user.name || "";
    profileForm.notify_failures.checked = App.user.notify_failures !== false;
    profileForm.notify_token_expiry.checked = App.user.notify_token_expiry !== false;

    /* ---------- Confirmação de e-mail ---------- */

    if (!App.preview && !App.user.email_verified) {
      verifyBox.hidden = false;
      document.getElementById("verify-send").addEventListener("click", function () {
        var btn = this;
        UI.busy(btn, true, "Enviando...");
        UI.api("/api/auth/verify/send", { method: "POST", body: {} }).then(function (r) {
          UI.busy(btn, false);
          if (r.status !== 200) return App.errorToast(r);
          UI.toast("E-mail de confirmação enviado. Confira a caixa de entrada e o spam.", "ok");
        });
      });
    }

    /* ---------- Perfil ---------- */

    profileForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!App.guard()) return;
      UI.clearErrors(profileForm);
      var btn = profileForm.querySelector("button[type=submit]");
      UI.busy(btn, true, "Salvando...");
      UI.api("/api/auth/profile", {
        method: "PATCH",
        body: { name: profileForm.name.value.trim(), timezone: tzSelect.value, notify_failures: profileForm.notify_failures.checked, notify_token_expiry: profileForm.notify_token_expiry.checked },
      }).then(function (r) {
        UI.busy(btn, false);
        if (r.status !== 200) {
          var field = r.data && r.data.error && r.data.error.field;
          if (!(field && UI.fieldError(profileForm, field, UI.errorMessage(r)))) App.errorToast(r);
          return;
        }
        App.user = r.data.user;
        document.querySelectorAll("[data-user-name]").forEach(function (el) { el.textContent = App.user.name || App.user.email.split("@")[0]; });
        UI.toast("Preferências salvas.", "ok");
      });
    });

    /* ---------- Senha ---------- */

    document.querySelectorAll(".pw-toggle").forEach(function (button) {
      button.addEventListener("click", function () {
        var input = document.getElementById(button.getAttribute("aria-controls"));
        var show = input.type === "password";
        input.type = show ? "text" : "password";
        button.textContent = show ? "Ocultar" : "Mostrar";
        button.setAttribute("aria-pressed", show ? "true" : "false");
      });
    });

    passwordForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!App.guard()) return;
      UI.clearErrors(passwordForm);
      var msg = document.getElementById("password-msg");
      UI.setMsg(msg, "", "info");
      var cur = passwordForm.currentPassword.value;
      var next = passwordForm.newPassword.value;
      if (!cur) return UI.fieldError(passwordForm, "currentPassword", "Digite a sua senha atual.");
      if (next.length < 8) return UI.fieldError(passwordForm, "newPassword", "A nova senha precisa ter pelo menos 8 caracteres.");
      if (next !== passwordForm.password2.value) return UI.fieldError(passwordForm, "password2", "As senhas não são iguais.");
      var btn = passwordForm.querySelector("button[type=submit]");
      UI.busy(btn, true, "Trocando...");
      UI.api("/api/auth/password", { method: "POST", body: { currentPassword: cur, newPassword: next } }).then(function (r) {
        UI.busy(btn, false);
        if (r.status === 200) {
          passwordForm.reset();
          UI.toast("Senha trocada. Os outros aparelhos foram desconectados.", "ok");
          loadSessions();
          return;
        }
        var field = r.data && r.data.error && r.data.error.field;
        if (!(field && UI.fieldError(passwordForm, field, UI.errorMessage(r)))) UI.setMsg(msg, UI.errorMessage(r), "error");
      });
    });

    /* ---------- Aparelhos conectados ---------- */

    function describeAgent(ua) {
      var os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Aparelho";
      var browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "navegador";
      return os + " · " + browser;
    }

    function loadSessions() {
      if (App.preview) return;
      UI.api("/api/auth/sessions").then(function (r) {
        if (r.status !== 200) return;
        sessionsWrap.innerHTML = "";
        var ul = UI.el("ul", { class: "session-list" });
        r.data.sessions.forEach(function (s) {
          var li = UI.el("li", {}, [
            UI.el("div", {}, [
              UI.el("strong", { text: describeAgent(s.user_agent) + (s.current ? " (este aparelho)" : "") }),
              UI.el("small", { text: "Último acesso " + UI.formatRelative(s.last_seen_at) + " · entrou em " + UI.formatDate(s.created_at) }),
            ]),
            s.current ? null : UI.el("button", { class: "btn btn-small btn-ghost", type: "button", text: "Desconectar", onclick: function () { revoke(s); } }),
          ]);
          ul.appendChild(li);
        });
        sessionsWrap.appendChild(ul);
      });
    }

    function revoke(s) {
      UI.confirm({ title: "Desconectar este aparelho?", message: describeAgent(s.user_agent) + " vai precisar entrar de novo.", confirmText: "Desconectar" }).then(function (ok) {
        if (!ok) return;
        UI.api("/api/auth/sessions/" + s.id, { method: "DELETE" }).then(function (r) {
          if (r.status !== 200) return App.errorToast(r);
          UI.toast("Aparelho desconectado.", "ok");
          loadSessions();
        });
      });
    }

    document.getElementById("revoke-others").addEventListener("click", function () {
      if (!App.guard()) return;
      UI.confirm({ title: "Sair de todos os outros aparelhos?", message: "Só este aparelho continua conectado.", confirmText: "Sair dos outros" }).then(function (ok) {
        if (!ok) return;
        UI.api("/api/auth/sessions/revoke-others", { method: "POST", body: {} }).then(function (r) {
          if (r.status !== 200) return App.errorToast(r);
          UI.toast("Outros aparelhos desconectados.", "ok");
          loadSessions();
        });
      });
    });

    /* ---------- Excluir conta ---------- */

    document.getElementById("delete-account").addEventListener("click", function () {
      if (!App.guard()) return;
      UI.dialog({
        title: "Excluir sua conta",
        danger: true,
        content:
          '<p class="modal-text">Isso apaga sua conta na plataforma, as contas do Pinterest conectadas, os pins programados, os arquivos enviados e o histórico. <strong>Não dá para desfazer.</strong> Nada é apagado na Pinterest.</p>' +
          '<div class="field"><label for="password">Sua senha</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>' +
          '<div class="field"><label for="confirm">Digite <strong>EXCLUIR</strong> para confirmar</label><input id="confirm" name="confirm" type="text" autocomplete="off" autocapitalize="characters" required></div>',
        submitText: "Excluir minha conta",
        busyText: "Excluindo...",
        focus: "#password",
        onSubmit: function (f) {
          return UI.api("/api/auth/delete-account", { method: "POST", body: { password: f.password.value, confirm: f.confirm.value.trim().toUpperCase() } }).then(function (r) {
            UI.throwIfError(r);
            window.location.href = "/?conta=excluida";
            return true;
          });
        },
      });
    });

    loadSessions();
  });
})();
