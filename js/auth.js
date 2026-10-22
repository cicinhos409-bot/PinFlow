/* Páginas públicas de conta: entrar, criar conta, esqueci a senha, redefinir e confirmar e-mail. */
(function () {
  "use strict";

  var page = document.body.getAttribute("data-page");
  if (!page || document.body.getAttribute("data-app") === "1") return;

  var form = document.getElementById("auth-form");
  var formMsg = document.getElementById("form-msg");

  function appUrl(section, id) {
    return "/app/" + section + (id ? "/" + encodeURIComponent(id) : "");
  }
  function idFromUrl() {
    var parts = window.location.pathname.split("/").filter(Boolean);
    return parts[0] === "app" && parts[2] ? decodeURIComponent(parts[2]) : "";
  }
  function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  }
  function problem(inputId, text) {
    UI.clearErrors(form);
    if (!UI.fieldError(form, inputId, text)) UI.setMsg(formMsg, text, "error");
  }

  /* ---------- Mostrar / ocultar senha ---------- */

  document.querySelectorAll(".pw-toggle").forEach(function (button) {
    button.addEventListener("click", function () {
      var input = document.getElementById(button.getAttribute("aria-controls"));
      if (!input) return;
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      button.textContent = show ? "Ocultar" : "Mostrar";
      button.setAttribute("aria-pressed", show ? "true" : "false");
    });
  });

  /* ---------- Força da senha (só orientação; o servidor é quem decide) ---------- */

  var password = document.getElementById("password");
  var meterBar = document.getElementById("meter-bar");
  var meterLabel = document.getElementById("meter-label");

  function strength(value) {
    var score = 0;
    if (value.length >= 8) score++;
    if (value.length >= 12) score++;
    if (value.length >= 16) score++;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
    if (/\d/.test(value)) score++;
    if (/[^A-Za-z0-9\s]/.test(value) || /\s/.test(value)) score++;
    return Math.min(score, 5);
  }
  if (password && meterBar) {
    var labels = ["", "Muito fraca", "Fraca", "Razoável", "Boa", "Forte"];
    password.addEventListener("input", function () {
      var value = password.value;
      if (!value) {
        meterBar.style.width = "0";
        if (meterLabel) meterLabel.textContent = "";
        return;
      }
      var score = value.length < 8 ? 1 : Math.max(2, strength(value));
      meterBar.style.width = (score / 5) * 100 + "%";
      if (meterLabel) meterLabel.textContent = "Força: " + labels[score] + ".";
    });
  }

  /* ---------- Criar conta ---------- */

  if (page === "cadastro" && form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      UI.clearErrors(form);
      UI.setMsg(formMsg, "", "info");
      var email = form.email.value.trim();
      var pw = form.password.value;
      if (!isEmail(email)) return problem("email", "Digite um e-mail válido.");
      if (pw.length < 8) return problem("password", "A senha precisa ter pelo menos 8 caracteres.");
      if (pw !== form.password2.value) return problem("password2", "As senhas não são iguais.");
      if (!form.acceptTerms.checked) return problem("acceptTerms", "Aceite os Termos de Uso e a Política de Privacidade para continuar.");
      var button = document.getElementById("submit");
      UI.busy(button, true, "Criando conta...");
      UI.api("/api/auth/register", {
        method: "POST",
        body: { name: form.name.value.trim(), email: email, password: pw, acceptTerms: true, website: form.website.value, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
      }).then(function (result) {
        if (result.status === 201 && result.data && result.data.ok) {
          window.location.href = appUrl("dashboard", result.data.user.id);
          return;
        }
        UI.busy(button, false);
        var field = result.data && result.data.error && result.data.error.field;
        if (!(field && UI.fieldError(form, field, UI.errorMessage(result)))) UI.setMsg(formMsg, UI.errorMessage(result), "error");
      });
    });
  }

  /* ---------- Entrar ---------- */

  if (page === "login" && form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      UI.clearErrors(form);
      UI.setMsg(formMsg, "", "info");
      var email = form.email.value.trim();
      var pw = form.password.value;
      if (!isEmail(email)) return problem("email", "Digite um e-mail válido.");
      if (!pw) return problem("password", "Digite a sua senha.");
      var button = document.getElementById("submit");
      UI.busy(button, true, "Entrando...");
      UI.api("/api/auth/login", { method: "POST", body: { email: email, password: pw } }).then(function (result) {
        if (result.status === 200 && result.data && result.data.ok) {
          var next = new URLSearchParams(window.location.search).get("next");
          window.location.href = next && next.indexOf("/app/") === 0 ? next : appUrl("dashboard", result.data.user.id);
          return;
        }
        UI.busy(button, false);
        form.password.value = "";
        UI.setMsg(formMsg, UI.errorMessage(result), "error");
        form.password.focus();
      });
    });
  }

  /* ---------- Esqueci a senha ---------- */

  if (page === "esqueci-senha" && form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      UI.clearErrors(form);
      var email = form.email.value.trim();
      if (!isEmail(email)) return problem("email", "Digite um e-mail válido.");
      var button = document.getElementById("submit");
      UI.busy(button, true, "Enviando...");
      UI.api("/api/auth/forgot", { method: "POST", body: { email: email } }).then(function (result) {
        UI.busy(button, false);
        if (result.status === 200) {
          form.hidden = true;
          UI.setMsg(document.getElementById("done-msg"), result.data.message, "ok");
          document.getElementById("done").hidden = false;
          return;
        }
        UI.setMsg(formMsg, UI.errorMessage(result), "error");
      });
    });
  }

  /* ---------- Redefinir senha ---------- */

  if (page === "redefinir" && form) {
    var token = window.location.pathname.split("/").filter(Boolean)[2] || "";
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      UI.clearErrors(form);
      var pw = form.password.value;
      if (pw.length < 8) return problem("password", "A senha precisa ter pelo menos 8 caracteres.");
      if (pw !== form.password2.value) return problem("password2", "As senhas não são iguais.");
      var button = document.getElementById("submit");
      UI.busy(button, true, "Salvando...");
      UI.api("/api/auth/reset", { method: "POST", body: { token: token, password: pw } }).then(function (result) {
        if (result.status === 200 && result.data && result.data.ok) {
          window.location.href = appUrl("dashboard", result.data.user.id) + "?senha=ok";
          return;
        }
        UI.busy(button, false);
        var field = result.data && result.data.error && result.data.error.field;
        if (!(field && UI.fieldError(form, field, UI.errorMessage(result)))) UI.setMsg(formMsg, UI.errorMessage(result), "error");
      });
    });
  }

  /* ---------- Confirmar e-mail ---------- */

  if (page === "confirmar") {
    var vtoken = window.location.pathname.split("/").filter(Boolean)[2] || "";
    var status = document.getElementById("confirm-status");
    UI.api("/api/auth/verify", { method: "POST", body: { token: vtoken } }).then(function (result) {
      if (result.status === 200) {
        status.innerHTML = '<p class="form-msg is-ok">E-mail confirmado. Obrigado!</p>';
      } else {
        status.innerHTML = '<p class="form-msg is-error">' + UI.escape(UI.errorMessage(result)) + "</p>";
      }
    });
  }

  /* ---------- Quem já está conectado vai direto ao dashboard ---------- */

  if (page === "login" || page === "cadastro" || page === "esqueci-senha") {
    UI.api("/api/auth/me").then(function (result) {
      if (result.status === 200 && result.data && result.data.ok) {
        window.location.replace(appUrl("dashboard", result.data.user.id));
      } else if (result.status === 503 && result.data && result.data.error && result.data.error.code === "not_configured") {
        // Sem banco: as telas estão abertas, não faz sentido pedir login.
        window.location.replace(appUrl("dashboard", idFromUrl()));
      }
    });
  }
})();
