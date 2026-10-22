(function () {
  "use strict";

  var cfg = window.APP_CONFIG || {};

  /* ---------- Marca e ano ---------- */

  document.querySelectorAll("[data-brand]").forEach(function (el) {
    el.textContent = cfg.BRAND_NAME || el.textContent;
  });

  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  /* ---------- Cabeçalho ---------- */

  var header = document.querySelector(".site-header");
  function onScroll() {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 8);
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- Menu no celular ---------- */

  var toggle = document.querySelector(".nav-toggle");
  var menu = document.getElementById("menu");

  function setMenu(open) {
    if (!toggle || !menu) return;
    menu.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
  }

  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      setMenu(!menu.classList.contains("is-open"));
    });
    menu.addEventListener("click", function (e) {
      if (e.target.tagName === "A") setMenu(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setMenu(false);
    });
  }

  /* ---------- Lista de espera ---------- */

  var form = document.getElementById("waitlist-form");
  var msg = document.getElementById("form-msg");

  function showMsg(text, kind) {
    if (!msg) return;
    msg.textContent = text;
    msg.className = "form-msg is-" + kind;
  }

  function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var data = {
        email: form.email.value.trim(),
        perfil: form.perfil.value,
        contas: form.contas.value,
        consent: form.consent.checked,
        website: form.website.value // campo isca: precisa ficar vazio
      };

      if (!isEmail(data.email)) {
        showMsg("Digite um e-mail válido.", "error");
        form.email.focus();
        return;
      }
      if (!data.perfil || !data.contas) {
        showMsg("Escolha as duas opções para continuar.", "error");
        return;
      }
      if (!data.consent) {
        showMsg("Marque a caixa de concordância para entrar na lista.", "error");
        return;
      }

      // Cadastro ainda não está ativo: diz a verdade ao visitante e não finge que salvou.
      if (!cfg.WAITLIST_ENDPOINT) {
        showMsg("A lista de espera ainda não está aberta. Volte em breve.", "info");
        return;
      }

      var button = form.querySelector("button[type=submit]");
      button.disabled = true;
      showMsg("Enviando...", "info");

      fetch(cfg.WAITLIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      })
        .then(function (res) {
          if (!res.ok) throw new Error("status " + res.status);
          form.reset();
          showMsg("Pronto! Você está na lista. Avisaremos por e-mail.", "ok");
        })
        .catch(function () {
          showMsg("Não foi possível enviar agora. Tente de novo em instantes.", "error");
        })
        .then(function () {
          button.disabled = false;
        });
    });
  }
})();
