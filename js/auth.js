(function () {
  "use strict";

  var page = document.body.getAttribute("data-page");
  if (!page) return;

  /* ---------- URLs da plataforma: /app/<página>/<id da conta> ----------
   * O id da URL é só o endereço. Quem manda é a sessão (cookie): o servidor
   * sempre responde com os dados de quem está conectado, nunca do id da URL.
   * Se a URL tiver um id diferente, a página é corrigida para o id certo.
   */

  var APP_PAGES = { login: 1, cadastro: 1, dashboard: 1, contas: 1, pins: 1, configuracoes: 1 };

  function appUrl(section, id) {
    return "/app/" + section + (id ? "/" + encodeURIComponent(id) : "");
  }

  function idFromUrl() {
    var parts = window.location.pathname.split("/").filter(Boolean); // ["app", "dashboard", "abc123"]
    if (parts[0] !== "app" || !APP_PAGES[parts[1]]) return "";
    return parts[2] ? decodeURIComponent(parts[2]) : "";
  }

  function fixUrl(id) {
    var wanted = appUrl(page, id);
    if (window.location.pathname !== wanted) {
      window.history.replaceState(null, "", wanted + window.location.search + window.location.hash);
    }
    document.querySelectorAll("[data-app-link]").forEach(function (a) {
      a.setAttribute("href", appUrl(a.getAttribute("data-app-link"), id));
    });
  }

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

  function showMsg(el, text, kind) {
    if (!el) return;
    el.textContent = text;
    el.className = "form-msg is-" + kind;
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

  function problem(msgEl, inputId, text) {
    var input = document.getElementById(inputId);
    setInvalid(input, true);
    showMsg(msgEl, text, "error");
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

  function fieldOf(result) {
    return result.data && result.data.error && result.data.error.field;
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

  /* ---------- Página: cadastro ---------- */

  var form = document.getElementById("auth-form");
  var formMsg = document.getElementById("form-msg");

  if (page === "cadastro" && form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearInvalid(form);
      showMsg(formMsg, "", "info");

      var email = form.email.value.trim();
      var pw = form.password.value;

      if (!isEmail(email)) return problem(formMsg, "email", "Digite um e-mail válido.");
      if (pw.length < 8) return problem(formMsg, "password", "A senha precisa ter pelo menos 8 caracteres.");
      if (pw !== form.password2.value) return problem(formMsg, "password2", "As senhas não são iguais.");
      if (!form.acceptTerms.checked) {
        return problem(formMsg, "acceptTerms", "Aceite os Termos de Uso e a Política de Privacidade para continuar.");
      }

      var button = document.getElementById("submit");
      setBusy(button, true, "Criando conta...");

      api("/api/auth/register", {
        method: "POST",
        body: { name: form.name.value.trim(), email: email, password: pw, acceptTerms: true, website: form.website.value }
      }).then(function (result) {
        if (result.status === 201 && result.data && result.data.ok) {
          window.location.href = appUrl("dashboard", result.data.user.id);
          return;
        }
        setBusy(button, false);
        var field = fieldOf(result);
        if (field && document.getElementById(field)) problem(formMsg, field, errorMessage(result));
        else showMsg(formMsg, errorMessage(result), "error");
      });
    });
  }

  /* ---------- Página: login ---------- */

  if (page === "login" && form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearInvalid(form);
      showMsg(formMsg, "", "info");

      var email = form.email.value.trim();
      var pw = form.password.value;

      if (!isEmail(email)) return problem(formMsg, "email", "Digite um e-mail válido.");
      if (!pw) return problem(formMsg, "password", "Digite a sua senha.");

      var button = document.getElementById("submit");
      setBusy(button, true, "Entrando...");

      api("/api/auth/login", { method: "POST", body: { email: email, password: pw } }).then(function (result) {
        if (result.status === 200 && result.data && result.data.ok) {
          window.location.href = appUrl("dashboard", result.data.user.id);
          return;
        }
        setBusy(button, false);
        form.password.value = "";
        showMsg(formMsg, errorMessage(result), "error");
        form.password.focus();
      });
    });
  }

  /* ---------- Quem já está conectado vai direto ao dashboard ---------- */

  if (page === "login" || page === "cadastro") {
    api("/api/auth/me").then(function (result) {
      if (result.status === 200 && result.data && result.data.ok) {
        window.location.replace(appUrl("dashboard", result.data.user.id));
      }
    });
  }

  /* ---------- Páginas internas: dashboard, contas, configurações ---------- */

  if (document.body.getAttribute("data-app") === "1") {
    var main = document.getElementById("app-main");
    var loading = document.getElementById("app-loading");

    api("/api/auth/me").then(function (result) {
      if (!(result.status === 200 && result.data && result.data.ok)) {
        // Sem sessão: vai para o login (mantendo o id da URL, se houver).
        window.location.replace(appUrl("login", idFromUrl()));
        return;
      }
      var user = result.data.user;
      fixUrl(user.id); // garante /app/<página>/<id da própria conta>

      var shownName = user.name || user.email.split("@")[0];
      document.querySelectorAll("[data-user-name]").forEach(function (el) {
        el.textContent = shownName;
      });
      document.querySelectorAll("[data-user-email]").forEach(function (el) {
        el.textContent = user.email;
      });
      document.querySelectorAll("[data-user-email-input]").forEach(function (el) {
        el.value = user.email;
      });
      document.querySelectorAll("[data-user-initial]").forEach(function (el) {
        el.textContent = shownName.charAt(0).toUpperCase();
      });
      var nameInput = document.getElementById("name");
      if (nameInput) nameInput.value = user.name || "";

      if (loading) loading.hidden = true;
      if (main) main.hidden = false;
    });

    // Barra lateral no celular (abre como gaveta)
    var sidebar = document.getElementById("sidebar");
    var sidebarToggle = document.getElementById("sidebar-toggle");
    var backdrop = document.getElementById("sidebar-backdrop");
    function setSidebar(open) {
      if (!sidebar) return;
      sidebar.classList.toggle("is-open", open);
      document.body.classList.toggle("sidebar-open", open);
      if (backdrop) backdrop.hidden = !open;
      if (sidebarToggle) {
        sidebarToggle.setAttribute("aria-expanded", open ? "true" : "false");
        sidebarToggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
      }
    }
    if (sidebarToggle) {
      sidebarToggle.addEventListener("click", function () {
        setSidebar(!sidebar.classList.contains("is-open"));
      });
    }
    if (backdrop) backdrop.addEventListener("click", function () { setSidebar(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setSidebar(false);
    });

    var logout = document.getElementById("logout");
    if (logout) {
      logout.addEventListener("click", function () {
        logout.disabled = true;
        api("/api/auth/logout", { method: "POST", body: {} }).then(function () {
          window.location.replace(appUrl("login"));
        });
      });
    }
  }

  /* ---------- Configurações: nome ---------- */

  var profileForm = document.getElementById("profile-form");
  if (profileForm) {
    var profileMsg = document.getElementById("profile-msg");
    profileForm.addEventListener("submit", function (e) {
      e.preventDefault();
      showMsg(profileMsg, "", "info");
      var button = document.getElementById("profile-submit");
      setBusy(button, true, "Salvando...");
      api("/api/auth/profile", { method: "PATCH", body: { name: profileForm.name.value.trim() } }).then(function (result) {
        setBusy(button, false);
        if (result.status === 200 && result.data && result.data.ok) {
          showMsg(profileMsg, "Nome salvo.", "ok");
          return;
        }
        showMsg(profileMsg, errorMessage(result), "error");
      });
    });
  }

  /* ---------- Configurações: trocar senha ---------- */

  var passwordForm = document.getElementById("password-form");
  if (passwordForm) {
    var passwordMsg = document.getElementById("password-msg");
    passwordForm.addEventListener("submit", function (e) {
      e.preventDefault();
      clearInvalid(passwordForm);
      showMsg(passwordMsg, "", "info");

      var current = passwordForm.currentPassword.value;
      var next = passwordForm.newPassword.value;
      if (!current) return problem(passwordMsg, "currentPassword", "Digite a sua senha atual.");
      if (next.length < 8) return problem(passwordMsg, "password", "A nova senha precisa ter pelo menos 8 caracteres.");
      if (next !== passwordForm.password2.value) return problem(passwordMsg, "password2", "As senhas não são iguais.");

      var button = document.getElementById("password-submit");
      setBusy(button, true, "Trocando...");
      api("/api/auth/password", { method: "POST", body: { currentPassword: current, newPassword: next } }).then(function (result) {
        setBusy(button, false);
        if (result.status === 200 && result.data && result.data.ok) {
          passwordForm.reset();
          if (meterBar) meterBar.style.width = "0";
          if (meterLabel) meterLabel.textContent = "";
          showMsg(passwordMsg, "Senha trocada. Os outros aparelhos foram desconectados.", "ok");
          return;
        }
        var field = fieldOf(result);
        var inputId = field === "newPassword" ? "password" : field;
        if (inputId && document.getElementById(inputId)) problem(passwordMsg, inputId, errorMessage(result));
        else showMsg(passwordMsg, errorMessage(result), "error");
      });
    });
  }
})();
