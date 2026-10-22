/* Pins: lista com filtros, calendário e ações (publicar agora, cancelar, duplicar, apagar). */
(function () {
  "use strict";

  App.ready(function () {
    var listWrap = document.getElementById("pins-list");
    var calWrap = document.getElementById("pins-calendar");
    var accountSel = document.getElementById("filter-account");
    var chips = document.querySelectorAll("[data-status-chip]");
    var viewBtns = document.querySelectorAll("[data-view]");
    var moreBtn = document.getElementById("load-more");
    var countEl = document.getElementById("pins-count");

    var state = { status: "", account: "", view: "list", offset: 0, items: [], total: 0, month: new Date() };
    var PAGE = 50;

    if (App.preview) {
      listWrap.appendChild(UI.empty("Nenhum pin programado.", "Conecte o banco de dados e uma conta do Pinterest para programar pins."));
      moreBtn.hidden = true;
      return;
    }

    function params(extra) {
      var p = new URLSearchParams();
      if (state.status) p.set("status", state.status);
      if (state.account) p.set("account", state.account);
      Object.keys(extra || {}).forEach(function (k) { p.set(k, extra[k]); });
      return p.toString();
    }

    function actionsMenu(p, anchor, reload) {
      var items = [{ label: "Abrir", onClick: function () { window.location.href = App.url("pins", p.id); } }];
      if (p.status === "scheduled") items.push({ label: "Publicar agora", onClick: function () { act(p, "publish-now", "Pin enviado para publicação agora.", reload); } });
      if (p.status === "scheduled") items.push({ label: "Cancelar", onClick: function () { cancel(p, reload); } });
      if (p.status === "failed" || p.status === "canceled") items.push({ label: "Tentar de novo", onClick: function () { act(p, "retry", "Pin de volta na fila.", reload); } });
      items.push({ label: "Duplicar", onClick: function () { duplicate(p, reload); } });
      if (p.pinterest_url) items.push({ label: "Ver na Pinterest", onClick: function () { window.open(p.pinterest_url, "_blank", "noopener"); } });
      items.push({ separator: true });
      items.push({ label: "Apagar", danger: true, onClick: function () { remove(p, reload); } });
      UI.menu(anchor, items);
    }

    function act(p, action, okMsg, reload) {
      UI.api("/api/pins/" + p.id + "/" + action, { method: "POST", body: {} }).then(function (r) {
        if (r.status !== 200) return App.errorToast(r);
        UI.toast(okMsg, "ok");
        reload();
        if (action === "publish-now") setTimeout(App.runQueue, 500);
      });
    }

    function cancel(p, reload) {
      UI.confirm({ title: "Cancelar este pin?", message: "\"" + (p.title || "sem título") + "\" não será publicado. Você pode colocar de volta na fila depois.", confirmText: "Cancelar pin", cancelText: "Manter" }).then(function (ok) {
        if (ok) act(p, "cancel", "Pin cancelado.", reload);
      });
    }

    function duplicate(p, reload) {
      var local = UI.isoToLocal(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
      UI.dialog({
        title: "Duplicar pin",
        content: '<p class="modal-text">Uma cópia de "' + UI.escape(p.title || "sem título") + '" será programada para a mesma conta e pasta.</p>' +
          '<div class="field"><label for="when">Data e hora</label><input id="when" name="when" type="datetime-local" value="' + local + '" required></div>',
        submitText: "Duplicar",
        onSubmit: function (form) {
          var iso = UI.localToIso(form.when.value);
          if (!iso) { var e = new Error("Escolha a data e a hora."); e.field = "when"; throw e; }
          return UI.api("/api/pins/" + p.id + "/duplicate", { method: "POST", body: { scheduled_at: iso } }).then(function (r) {
            UI.throwIfError(r, 201);
            UI.toast("Pin duplicado.", "ok");
            reload();
            return true;
          });
        },
      });
    }

    function remove(p, reload) {
      var published = p.status === "published" && p.pinterest_pin_id;
      UI.confirm({
        title: "Apagar este pin?",
        message: published ? "O pin sai da plataforma. Marque abaixo se quiser apagar também na Pinterest." : "\"" + (p.title || "sem título") + "\" será apagado da plataforma.",
        confirmText: "Apagar",
        danger: true,
        checkbox: published ? { label: "Apagar também na Pinterest (não dá para desfazer)", checked: false } : null,
      }).then(function (res) {
        if (!res) return;
        UI.api("/api/pins/" + p.id + (res.checkbox ? "?pinterest=1" : ""), { method: "DELETE" }).then(function (r) {
          if (r.status !== 200) return App.errorToast(r);
          UI.toast(r.data.removed_on_pinterest ? "Pin apagado aqui e na Pinterest." : "Pin apagado.", "ok");
          reload();
        });
      });
    }

    function row(p) {
      var more = UI.el("button", { class: "icon-btn", type: "button", "aria-label": "Ações", html: "&#8942;" });
      more.addEventListener("click", function () { actionsMenu(p, more, reloadList); });
      var when = p.status === "published" ? p.published_at : p.scheduled_at;
      return UI.el("li", { class: "pin-item status-" + p.status }, [
        UI.el("a", { href: App.url("pins", p.id), class: "pin-row" }, [
          App.thumb(p.media),
          UI.el("div", { class: "pin-row-text" }, [
            UI.el("strong", { text: p.title || "(sem título)" }),
            UI.el("span", { text: (p.account ? "@" + p.account.username : "conta removida") + (p.board ? " · " + p.board.name : "") }),
            p.error_message ? UI.el("small", { class: "pin-error", text: p.error_message }) : null,
          ]),
          UI.el("div", { class: "pin-row-when" }, [App.pinBadge(p.status), UI.el("span", { text: UI.formatDateTime(when) })]),
        ]),
        more,
      ]);
    }

    function renderList() {
      listWrap.innerHTML = "";
      countEl.textContent = state.total ? state.total + (state.total === 1 ? " pin" : " pins") : "";
      if (!state.items.length) {
        listWrap.appendChild(UI.empty(state.status || state.account ? "Nenhum pin com esse filtro." : "Nenhum pin ainda.", state.status || state.account ? "" : "Programe o primeiro pin: imagem ou vídeo, pasta e horário.", UI.el("a", { class: "btn btn-primary", href: App.url("pins", "novo"), text: "Novo pin" })));
        moreBtn.hidden = true;
        return;
      }
      var ul = UI.el("ul", { class: "pin-list" });
      state.items.forEach(function (p) { ul.appendChild(row(p)); });
      listWrap.appendChild(ul);
      moreBtn.hidden = state.items.length >= state.total;
    }

    function reloadList() {
      state.offset = 0;
      loadList(false);
    }

    function loadList(append) {
      UI.api("/api/pins?" + params({ limit: PAGE, offset: state.offset, order: state.status === "published" ? "desc" : state.status === "scheduled" ? "asc" : "desc" })).then(function (r) {
        if (r.status !== 200) return App.errorToast(r);
        state.items = append ? state.items.concat(r.data.pins) : r.data.pins;
        state.total = r.data.total;
        renderList();
      });
    }

    /* ---------- Calendário (mês) ---------- */

    function monthRange(d) {
      var tz = UI.tz();
      var y = d.getFullYear();
      var m = d.getMonth();
      var first = new Date(y, m, 1);
      var last = new Date(y, m + 1, 0);
      return { y: y, m: m, days: last.getDate(), fromIso: UI.localToIso(y + "-" + pad(m + 1) + "-01T00:00", tz), toIso: UI.localToIso(y + "-" + pad(m + 1) + "-" + pad(last.getDate()) + "T23:59", tz), first: first };
    }
    function pad(n) { return (n < 10 ? "0" : "") + n; }

    function renderCalendar() {
      var range = monthRange(state.month);
      calWrap.innerHTML = "";
      var title = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(range.first);
      var head = UI.el("div", { class: "cal-head" }, [
        UI.el("button", { class: "icon-btn", type: "button", "aria-label": "Mês anterior", html: "&#8249;", onclick: function () { state.month = new Date(range.y, range.m - 1, 1); renderCalendar(); } }),
        UI.el("h2", { text: title.charAt(0).toUpperCase() + title.slice(1) }),
        UI.el("button", { class: "icon-btn", type: "button", "aria-label": "Próximo mês", html: "&#8250;", onclick: function () { state.month = new Date(range.y, range.m + 1, 1); renderCalendar(); } }),
      ]);
      calWrap.appendChild(head);
      var grid = UI.el("div", { class: "cal-grid" });
      ["D", "S", "T", "Q", "Q", "S", "S"].forEach(function (w) { grid.appendChild(UI.el("div", { class: "cal-weekday", text: w })); });
      var startDow = range.first.getDay();
      for (var i = 0; i < startDow; i++) grid.appendChild(UI.el("div", { class: "cal-day is-pad" }));
      var cells = {};
      var today = UI.isoToLocal(new Date().toISOString()).slice(0, 10);
      for (var d = 1; d <= range.days; d++) {
        var key = range.y + "-" + pad(range.m + 1) + "-" + pad(d);
        var cell = UI.el("div", { class: "cal-day" + (key === today ? " is-today" : "") }, UI.el("span", { class: "cal-num", text: String(d) }));
        cells[key] = cell;
        grid.appendChild(cell);
      }
      calWrap.appendChild(grid);
      UI.api("/api/pins?" + params({ from: range.fromIso, to: range.toIso, limit: 500, order: "asc" })).then(function (r) {
        if (r.status !== 200) return App.errorToast(r);
        r.data.pins.forEach(function (p) {
          var key = UI.isoToLocal(p.scheduled_at).slice(0, 10);
          var cell = cells[key];
          if (!cell) return;
          cell.appendChild(UI.el("a", { class: "cal-pin status-" + p.status, href: App.url("pins", p.id), title: (p.title || "sem título") + " · " + UI.formatDateTime(p.scheduled_at) }, [
            UI.el("span", { class: "cal-time", text: UI.formatDateTime(p.scheduled_at, { day: undefined, month: undefined }) }),
            UI.el("span", { class: "cal-title", text: p.title || "(sem título)" }),
          ]));
        });
      });
    }

    /* ---------- Filtros e visões ---------- */

    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        chips.forEach(function (c) { c.setAttribute("aria-pressed", "false"); });
        chip.setAttribute("aria-pressed", "true");
        state.status = chip.getAttribute("data-status-chip");
        refresh();
      });
    });
    accountSel.addEventListener("change", function () {
      state.account = accountSel.value;
      refresh();
    });
    viewBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        viewBtns.forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true");
        state.view = b.getAttribute("data-view");
        listWrap.hidden = state.view !== "list";
        moreBtn.hidden = state.view !== "list";
        calWrap.hidden = state.view !== "calendar";
        refresh();
      });
    });
    moreBtn.addEventListener("click", function () {
      state.offset += PAGE;
      loadList(true);
    });

    function refresh() {
      if (state.view === "calendar") renderCalendar();
      else reloadList();
    }

    UI.api("/api/accounts").then(function (r) {
      if (r.status !== 200) return;
      r.data.accounts.forEach(function (a) {
        accountSel.appendChild(UI.el("option", { value: a.id, text: "@" + a.username + (a.label ? " (" + a.label + ")" : "") }));
      });
      var pre = App.query("conta");
      if (pre) {
        accountSel.value = pre;
        state.account = pre;
        refresh();
      }
    });

    var preStatus = App.query("status");
    if (preStatus) {
      chips.forEach(function (c) { c.setAttribute("aria-pressed", c.getAttribute("data-status-chip") === preStatus ? "true" : "false"); });
      state.status = preStatus;
    }
    refresh();
    document.addEventListener("pinflow:queue", refresh);
  });
})();
