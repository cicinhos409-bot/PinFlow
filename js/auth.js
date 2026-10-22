(function () {
  "use strict";

  var page = document.body.getAttribute("data-page");
  if (!page) return;

  /* ---------- Chamadas ao servidor ---------- */

  function api(path, options) {
    var opts = options || {};
    var init = { method: opts.method || "GET", credentials: "same-origin", headers: {} };
    if (opts.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
    return fetch(path, init)
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return null;
          })
          .then(function (data) {
            return { status: res.status, data: data };
          });
      })
      .catch(function () {
        return { status: 0, data: null };
      });
  }

  function errorMessage(result) {
    if (result.data && result.data.error && result.data.error.message) return result.data.error.message;
    if (result.status === 0) return "Sem conexão com o servidor. Confira sua internet e tente de novo.";
    return "Não foi possível concluir agora. Tente de novo em instantes.";
  }

  /* ---------- Utilidades de tela ---------- */

  var msg = document.getElementById("form-msg");

  function showMsg(text, kind) {
    if (!msg) return;
    msg.textContent = text;
    msg.className = "form-msg is-" + kind;
  }

  function setInvalid(input, invalid) {
    if (!input) return;
    var field = input.closest(".field");
    if (field) field.classList.toggle("has-error", invalid);
    if (invalid) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  function clearInvalid(form) {
    form.querySelectorAll("[aria-invalid]").forEach(function (el) {
      setInvalid(el, false);
    });
  }

  function problem(form, inputId, text) {
    var input = document.getElementById(inputId);
    setInvalid(input, true);
    showMsg(text, "error");
    if (input) input.focus();
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      button.setAttribute("data-label", button.textContent);
      button.textContent = label;
      button.disabled = true;
    } else {
      button.textContent = button.getAttribute("data-label") || button.textContent;
      button.disabled = false;
    }
  }

  function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
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

  /* ---------- Força da senha (apenas orientação; o servidor é quem decide) ---------- */

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

  if (page === "cadastro" && password && meterBar) {
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

  /* ---------- Página: cadastro ---------- */

  var form = document.getElementById("auth-form");

  if (page === "cadastro" && form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearInvalid(form);
      showMsg("", "info");

      var email = form.email.value.trim();
      var pw = form.password.value;

      if (!isEmail(email)) return problem(form, "email", "Digite um e-mail válido.");
      if (pw.length < 8) return problem(form, "password", "A senha precisa ter pelo menos 8 caracteres.");
      if (pw !== form.password2.value) return problem(form, "password2", "As senhas não são iguais.");
      if (!form.acceptTerms.checked) return problem(form, "acceptTerms", "Aceite os Termos de Uso e a Política de Privacidade para continuar.");

      var button = document.getElementById("submit");
      setBusy(button, true, "Criando conta...");

      api("/api/auth/register", {
        method: "POST",
        body: {
          name: form.name.value.trim(),
          email: email,
          password: pw,
          acceptTerms: true,
          website: form.website.value
        }
      }).then(function (result) {
        if (result.status === 201 && result.data && result.data.ok) {
          window.location.href = "/painel";
          return;
        }
        setBusy(button, false);
        var field = result.data && result.data.error && result.data.error.field;
        if (field && document.getElementById(field)) problem(form, field, errorMessage(result));
        else showMsg(errorMessage(result), "error");
      });
    });
  }

  /* ---------- Página: entrar ---------- */

  if (page === "entrar" && form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearInvalid(form);
      showMsg("", "info");

      var email = form.email.value.trim();
      var pw = form.password.value;

      if (!isEmail(email)) return problem(form, "email", "Digite um e-mail válido.");
      if (!pw) return problem(form, "password", "Digite a sua senha.");

      var button = document.getElementById("submit");
      setBusy(button, true, "Entrando...");

      api("/api/auth/login", { method: "POST", body: { email: email, password: pw } }).then(function (result) {
        if (result.status === 200 && result.data && result.data.ok) {
          window.location.href = "/painel";
          return;
        }
        setBusy(button, false);
        form.password.value = "";
        showMsg(errorMessage(result), "error");
        form.password.focus();
      });
    });
  }

  /* ---------- Quem já está conectado vai direto ao painel ---------- */

  if (page === "cadastro" || page === "entrar") {
    api("/api/auth/me").then(function (result) {
      if (result.status === 200 && result.data && result.data.ok) window.location.replace("/painel");
    });
  }

  /* ---------- Página: painel ---------- */

  if (page === "painel") {
    var dash = document.getElementById("dash");
    var loading = document.getElementById("dash-loading");

    api("/api/auth/me").then(function (result) {
      if (!(result.status === 200 && result.data && result.data.ok)) {
        window.location.replace("/entrar");
        return;
      }
      var user = result.data.user;
      var shownName = user.name || user.email.split("@")[0];
      document.querySelectorAll("[data-user-name]").forEach(function (el) {
        el.textContent = shownName;
      });
      document.querySelectorAll("[data-user-email]").forEach(function (el) {
        el.textContent = user.email;
      });
      if (loading) loading.hidden = true;
      if (dash) dash.hidden = false;
    });

    var logout = document.getElementById("logout");
    if (logout) {
      logout.addEventListener("click", function () {
        logout.disabled = true;
        api("/api/auth/logout", { method: "POST", body: {} }).then(function () {
          window.location.replace("/entrar");
        });
      });
    }
  }
})();
