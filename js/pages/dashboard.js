/* Dashboard: números reais, próximos pins, atividade e primeiros passos. */
(function () {
  "use strict";

  App.ready(function () {
    var el = function (id) { return document.getElementById(id); };

    if (App.query("senha") === "ok") UI.toast("Senha redefinida. Você já está dentro.", "ok");

    function setStat(key, value) {
      var node = document.querySelector('[data-stat="' + key + '"]');
      if (node) node.textContent = String(value);
    }

    function renderNext(pins) {
      var wrap = el("next-pins");
      wrap.innerHTML = "";
      if (!pins.length) {
        wrap.appendChild(UI.el("div", { class: "empty" }, [
          UI.el("div", { class: "empty-art", "aria-hidden": "true" }, [UI.el("div", { class: "mini-pin" }), UI.el("div", { class: "mini-pin" }), UI.el("div", { class: "mini-pin" })]),
          UI.el("p", {}, UI.el("strong", { text: "Nenhum pin programado." })),
          UI.el("p", { text: "Conecte uma conta do Pinterest e programe o primeiro pin." }),
        ]));
        return;
      }
      var list = UI.el("ul", { class: "pin-list compact" });
      pins.forEach(function (p) {
        list.appendChild(UI.el("li", {}, UI.el("a", { href: App.url("pins", p.id), class: "pin-row" }, [
          App.thumb(p.media),
          UI.el("div", { class: "pin-row-text" }, [
            UI.el("strong", { text: p.title || "(sem título)" }),
            UI.el("span", { text: (p.account ? "@" + p.account.username : "") + (p.board ? " · " + p.board.name : "") }),
          ]),
          UI.el("div", { class: "pin-row-when" }, [UI.el("span", { text: UI.formatDateTime(p.scheduled_at) }), UI.el("small", { text: UI.formatRelative(p.scheduled_at) })]),
        ])));
      });
      wrap.appendChild(list);
    }

    function renderActivity(items) {
      var wrap = el("recent-activity");
      wrap.innerHTML = "";
      if (!items.length) {
        wrap.appendChild(UI.el("div", { class: "empty" }, UI.el("p", { text: "Aqui você verá o que foi publicado, o que falhou e por quê." })));
        return;
      }
      var list = UI.el("ul", { class: "activity-list" });
      items.forEach(function (a) {
        list.appendChild(UI.el("li", { class: "activity-item kind-" + a.kind.split("_")[0] + (/failed/.test(a.kind) ? " is-bad" : "") }, [
          UI.el("span", { class: "activity-dot", "aria-hidden": "true" }),
          UI.el("div", {}, [UI.el("p", { text: a.message }), UI.el("small", { text: UI.formatRelative(a.created_at) })]),
        ]));
      });
      wrap.appendChild(list);
    }

    function renderSteps(stats, hasPins) {
      var connected = stats.accounts > 0;
      var li2 = el("step-connect");
      var li3 = el("step-pin");
      li2.classList.toggle("is-done", connected);
      li3.classList.toggle("is-done", hasPins);
      if (connected) li2.querySelector(".step-num").textContent = "✓";
      if (hasPins) li3.querySelector(".step-num").textContent = "✓";
      var cta = el("primary-cta");
      if (connected) {
        cta.textContent = "Novo pin";
        cta.setAttribute("href", App.url("pins", "novo"));
      }
      var warn = el("reconnect-warning");
      if (stats.needs_reconnect > 0) {
        warn.hidden = false;
        warn.querySelector("a").setAttribute("href", App.url("contas"));
        warn.querySelector("span").textContent = stats.needs_reconnect === 1 ? "1 conta precisa ser reconectada." : stats.needs_reconnect + " contas precisam ser reconectadas.";
      }
    }

    function load() {
      if (App.preview) {
        renderNext([]);
        renderActivity([]);
        renderSteps({ accounts: 0, needs_reconnect: 0 }, false);
        return;
      }
      UI.api("/api/dashboard").then(function (r) {
        if (r.status !== 200) return App.errorToast(r);
        var d = r.data;
        setStat("accounts", d.stats.accounts);
        setStat("queued", d.stats.scheduled);
        setStat("published", d.stats.published_7d);
        setStat("failed", d.stats.failed_7d);
        var notes = { accounts: d.stats.accounts ? "Conectadas" : "Nenhuma ainda", queued: d.stats.scheduled ? "Aguardando horário" : "Fila vazia", failed: d.stats.failed_7d ? "Veja no histórico" : "Nada para corrigir" };
        Object.keys(notes).forEach(function (k) {
          var n = document.querySelector('[data-stat-note="' + k + '"]');
          if (n) n.textContent = notes[k];
        });
        renderNext(d.next);
        renderActivity(d.activity);
        renderSteps(d.stats, d.stats.scheduled + d.stats.published_7d > 0 || d.activity.some(function (a) { return a.kind.indexOf("pin_") === 0; }));
      });
    }

    load();
    document.addEventListener("pinflow:queue", load);
  });
})();
