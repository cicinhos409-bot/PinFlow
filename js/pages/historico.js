/* Histórico: tudo o que aconteceu, com filtro por tipo. */
(function () {
  "use strict";

  App.ready(function () {
    var wrap = document.getElementById("activity");
    var moreBtn = document.getElementById("load-more");
    var chips = document.querySelectorAll("[data-kind-chip]");
    var state = { kind: "", offset: 0, items: [], total: 0 };
    var PAGE = 50;

    if (App.preview) {
      wrap.appendChild(UI.empty("Sem histórico ainda.", "Aqui você verá o que foi publicado, o que falhou e por quê."));
      moreBtn.hidden = true;
      return;
    }

    function render() {
      wrap.innerHTML = "";
      if (!state.items.length) {
        wrap.appendChild(UI.empty("Sem eventos" + (state.kind ? " desse tipo." : " ainda."), state.kind ? "" : "Aqui você verá o que foi publicado, o que falhou e por quê."));
        moreBtn.hidden = true;
        return;
      }
      var ul = UI.el("ul", { class: "activity-list" });
      state.items.forEach(function (a) {
        var text = UI.el("div", {}, [UI.el("p", { text: a.message }), UI.el("small", { text: UI.formatDateTime(a.created_at, { year: "numeric" }) + " · " + UI.formatRelative(a.created_at) })]);
        if (a.pin) text.appendChild(UI.el("a", { class: "activity-link", href: App.url("pins", a.pin), text: "Abrir pin" }));
        ul.appendChild(UI.el("li", { class: "activity-item" + (/failed|needs_reconnect/.test(a.kind) ? " is-bad" : "") }, [UI.el("span", { class: "activity-dot", "aria-hidden": "true" }), text]));
      });
      wrap.appendChild(ul);
      moreBtn.hidden = state.items.length >= state.total;
    }

    function load(append) {
      UI.api("/api/activity?limit=" + PAGE + "&offset=" + state.offset + (state.kind ? "&kind=" + encodeURIComponent(state.kind) : "")).then(function (r) {
        if (r.status !== 200) return App.errorToast(r);
        state.items = append ? state.items.concat(r.data.activity) : r.data.activity;
        state.total = r.data.total;
        render();
      });
    }

    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        chips.forEach(function (c) { c.setAttribute("aria-pressed", "false"); });
        chip.setAttribute("aria-pressed", "true");
        state.kind = chip.getAttribute("data-kind-chip");
        state.offset = 0;
        load(false);
      });
    });
    moreBtn.addEventListener("click", function () {
      state.offset += PAGE;
      load(true);
    });
    load(false);
  });
})();
