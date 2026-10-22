/* Análises: métricas da Pinterest dos pins publicados pela pessoa (só os dela). */
(function () {
  "use strict";

  App.ready(function () {
    var state = { days: 30, account: "", kind: "", sort: "impressions", dir: "desc", data: null, loading: false };
    var el = function (id) { return document.getElementById(id); };
    var accountSel = el("filter-account");
    var notice = el("analytics-notice");

    if (App.preview) {
      el("stats").hidden = true;
      el("chart-card").hidden = true;
      el("accounts-card").hidden = true;
      el("top-card").hidden = true;
      el("table-card").innerHTML = "";
      el("table-card").appendChild(UI.empty("Modo de visualização", "Conecte o banco de dados e uma conta do Pinterest para ver as métricas dos seus pins."));
      return;
    }

    var fmt = new Intl.NumberFormat("pt-BR");
    function n(v) {
      return fmt.format(Math.round(v || 0));
    }
    function pct(part, total) {
      if (!total) return "—";
      return (Math.round((part / total) * 1000) / 10).toLocaleString("pt-BR") + "%";
    }
    function duration(ms) {
      if (!ms) return "—";
      var s = Math.round(ms / 1000);
      if (s < 60) return s + " s";
      return Math.floor(s / 60) + " min " + (s % 60) + " s";
    }

    /* ---------- Totais ---------- */

    function renderStats(d) {
      var t = d.totals;
      var tiles = [
        ["Impressões", n(t.impressions), "vezes que seus pins apareceram"],
        ["Engajamento", n(t.engagement), "salvamentos + cliques"],
        ["Salvamentos", n(t.saves), pct(t.saves, t.impressions) + " das impressões"],
        ["Cliques no pin", n(t.pin_clicks), "abriram o pin"],
        ["Cliques no link", n(t.outbound_clicks), "foram para o seu site"],
      ];
      if (t.video_pins > 0) tiles.push(["Visualizações de vídeo", n(t.video_views), t.video_pins + (t.video_pins === 1 ? " vídeo" : " vídeos")]);
      var wrap = el("stats");
      wrap.innerHTML = "";
      tiles.forEach(function (x) {
        wrap.appendChild(UI.el("div", { class: "stat" }, [UI.el("span", { class: "stat-label", text: x[0] }), UI.el("strong", { class: "stat-value", text: x[1] }), UI.el("span", { class: "stat-note", text: x[2] })]));
      });
    }

    /* ---------- Gráfico (SVG) ---------- */

    function renderChart(d) {
      var wrap = el("chart");
      wrap.innerHTML = "";
      var days = d.daily;
      if (!days.length || !days.some(function (x) { return x.impressions > 0 || x.engagement > 0; })) {
        wrap.appendChild(UI.el("p", { class: "hint", text: "Sem dados diários ainda. A Pinterest leva de 1 a 2 dias para consolidar os números." }));
        return;
      }
      var W = 720;
      var H = 220;
      var padL = 44;
      var padR = 12;
      var padT = 14;
      var padB = 30;
      var maxImp = Math.max.apply(null, days.map(function (x) { return x.impressions; }).concat([1]));
      var maxEng = Math.max.apply(null, days.map(function (x) { return x.engagement; }).concat([1]));
      var innerW = W - padL - padR;
      var innerH = H - padT - padB;
      var step = innerW / days.length;
      var svgNS = "http://www.w3.org/2000/svg";
      var svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      svg.setAttribute("class", "chart-svg");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", "Impressões por dia (barras) e engajamento (linha)");
      function node(tag, attrs, text) {
        var e = document.createElementNS(svgNS, tag);
        Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
        if (text !== undefined) e.textContent = text;
        return e;
      }
      // Linhas de grade e rótulos do eixo Y (impressões)
      for (var g = 0; g <= 3; g++) {
        var y = padT + innerH - (innerH * g) / 3;
        svg.appendChild(node("line", { x1: padL, x2: W - padR, y1: y, y2: y, class: "chart-grid" }));
        svg.appendChild(node("text", { x: padL - 6, y: y + 4, class: "chart-axis", "text-anchor": "end" }, n((maxImp * g) / 3)));
      }
      // Barras
      days.forEach(function (x, i) {
        var h = (x.impressions / maxImp) * innerH;
        var bx = padL + i * step + step * 0.15;
        var bw = Math.max(2, step * 0.7);
        var rect = node("rect", { x: bx, y: padT + innerH - h, width: bw, height: h, rx: Math.min(3, bw / 2), class: "chart-bar" });
        rect.appendChild(node("title", {}, UI.formatDate(x.date + "T12:00:00Z") + ": " + n(x.impressions) + " impressões · " + n(x.engagement) + " engajamento"));
        svg.appendChild(rect);
      });
      // Linha de engajamento (escala própria)
      var points = days.map(function (x, i) {
        return padL + i * step + step / 2 + "," + (padT + innerH - (x.engagement / maxEng) * innerH);
      });
      svg.appendChild(node("polyline", { points: points.join(" "), class: "chart-line" }));
      // Rótulos do eixo X (até ~8)
      var every = Math.max(1, Math.ceil(days.length / 8));
      days.forEach(function (x, i) {
        var isLast = i === days.length - 1;
        if (i % every !== 0 && !isLast) return;
        if (isLast && i % every !== 0 && i % every < every / 2) return; // perto demais do rótulo anterior
        svg.appendChild(node("text", { x: padL + i * step + step / 2, y: H - 8, class: "chart-axis", "text-anchor": "middle" }, x.date.slice(8, 10) + "/" + x.date.slice(5, 7)));
      });
      wrap.appendChild(svg);
      wrap.appendChild(UI.el("p", { class: "chart-legend" }, [UI.el("span", { class: "legend-bar" }), "Impressões ", UI.el("span", { class: "legend-line" }), "Engajamento (salvamentos + cliques)"]));
    }

    /* ---------- Contas ---------- */

    function renderAccounts(d) {
      var wrap = el("accounts");
      wrap.innerHTML = "";
      if (!d.accounts.length) {
        el("accounts-card").hidden = true;
        return;
      }
      el("accounts-card").hidden = false;
      d.accounts.forEach(function (a) {
        var m = a.metrics;
        wrap.appendChild(UI.el("div", { class: "account-metric" }, [
          UI.el("div", { class: "account-metric-head" }, [UI.el("strong", { text: "@" + a.username + (a.label ? " · " + a.label : "") }), UI.el("span", { class: "hint", text: a.pins_published + (a.pins_published === 1 ? " pin publicado pela plataforma" : " pins publicados pela plataforma") })]),
          m
            ? UI.el("dl", { class: "account-stats" }, [
                UI.el("div", {}, [UI.el("dt", { text: "Impressões" }), UI.el("dd", { text: n(m.impressions) })]),
                UI.el("div", {}, [UI.el("dt", { text: "Engajamento" }), UI.el("dd", { text: n(m.engagement) })]),
                UI.el("div", {}, [UI.el("dt", { text: "Salvamentos" }), UI.el("dd", { text: n(m.saves) })]),
                UI.el("div", {}, [UI.el("dt", { text: "Cliques no link" }), UI.el("dd", { text: n(m.outbound_clicks) })]),
              ])
            : UI.el("p", { class: "hint", text: a.error ? "Sem dados: " + a.error : a.status !== "active" ? "Conta precisa ser reconectada." : "Ainda sem dados da Pinterest para esta conta." }),
        ]));
      });
    }

    /* ---------- Ranking ---------- */

    function pinLine(p, valueText) {
      return UI.el("li", {}, UI.el("a", { href: App.url("pins", p.id), class: "pin-row" }, [
        App.thumb(p.media),
        UI.el("div", { class: "pin-row-text" }, [UI.el("strong", { text: p.title || "(sem título)" }), UI.el("span", { text: (p.account ? "@" + p.account.username : "") + " · " + UI.formatDate(p.published_at) })]),
        UI.el("div", { class: "pin-row-when" }, [UI.el("strong", { text: valueText })]),
      ]));
    }

    function renderTop(d) {
      var pins = filteredPins(d);
      var topWrap = el("top-pins");
      var topVideos = el("top-videos");
      topWrap.innerHTML = "";
      topVideos.innerHTML = "";
      var byImp = pins.slice().sort(function (a, b) { return b.metrics.impressions - a.metrics.impressions; }).slice(0, 5);
      var videos = pins.filter(function (p) { return p.kind === "video"; }).sort(function (a, b) { return (b.metrics.video_views || 0) - (a.metrics.video_views || 0); }).slice(0, 5);
      el("top-card").hidden = !byImp.length;
      if (byImp.length) {
        var ul = UI.el("ul", { class: "pin-list compact" });
        byImp.forEach(function (p) { ul.appendChild(pinLine(p, n(p.metrics.impressions) + " impr.")); });
        topWrap.appendChild(ul);
      }
      el("top-videos-block").hidden = !videos.length;
      if (videos.length) {
        var ul2 = UI.el("ul", { class: "pin-list compact" });
        videos.forEach(function (p) { ul2.appendChild(pinLine(p, n(p.metrics.video_views) + " views")); });
        topVideos.appendChild(ul2);
      }
    }

    /* ---------- Tabela ---------- */

    var COLUMNS = [
      { key: "title", label: "Pin", sortable: false },
      { key: "impressions", label: "Impressões" },
      { key: "saves", label: "Salvos" },
      { key: "pin_clicks", label: "Cliques" },
      { key: "outbound_clicks", label: "Link" },
      { key: "video_views", label: "Views", video: true },
      { key: "video_avg_ms", label: "Tempo médio", video: true },
      { key: "video_95", label: "Até o fim", video: true },
    ];

    function filteredPins(d) {
      return d.pins.filter(function (p) { return !state.kind || p.kind === state.kind; });
    }

    function metricOf(p, key) {
      if (key === "engagement") return p.engagement;
      var v = p.metrics[key];
      return v === null || v === undefined ? -1 : v;
    }

    function renderTable(d) {
      var card = el("table-card");
      card.innerHTML = "";
      var pins = filteredPins(d);
      if (!pins.length) {
        card.appendChild(UI.empty(d.pins.length ? "Nenhum pin desse tipo." : "Nenhum pin publicado ainda.", d.pins.length ? "" : "As métricas aparecem aqui depois que a plataforma publica seus pins na Pinterest.", d.pins.length ? null : UI.el("a", { class: "btn btn-primary", href: App.url("pins", "novo"), text: "Novo pin" })));
        return;
      }
      var showVideo = pins.some(function (p) { return p.kind === "video"; }) && state.kind !== "image";
      var cols = COLUMNS.filter(function (c) { return !c.video || showVideo; });
      pins.sort(function (a, b) {
        var va = metricOf(a, state.sort);
        var vb = metricOf(b, state.sort);
        return state.dir === "desc" ? vb - va : va - vb;
      });
      var table = UI.el("table", { class: "metrics-table" });
      var thead = UI.el("thead", {}, UI.el("tr", {}, cols.map(function (c) {
        if (c.sortable === false) return UI.el("th", { text: c.label });
        var active = state.sort === c.key;
        var b = UI.el("button", { type: "button", class: "th-sort" + (active ? " is-active" : ""), text: c.label + (active ? (state.dir === "desc" ? " ↓" : " ↑") : "") });
        b.addEventListener("click", function () {
          if (state.sort === c.key) state.dir = state.dir === "desc" ? "asc" : "desc";
          else {
            state.sort = c.key;
            state.dir = "desc";
          }
          renderTable(d);
        });
        return UI.el("th", { "aria-sort": active ? (state.dir === "desc" ? "descending" : "ascending") : "none" }, b);
      })));
      var tbody = UI.el("tbody");
      pins.forEach(function (p) {
        var m = p.metrics;
        var cells = [
          UI.el("td", { class: "td-pin" }, UI.el("a", { href: App.url("pins", p.id), class: "pin-cell" }, [
            App.thumb(p.media),
            UI.el("div", { class: "pin-row-text" }, [
              UI.el("strong", { text: p.title || "(sem título)" }),
              UI.el("span", { text: (p.account ? "@" + p.account.username + " · " : "") + UI.formatDate(p.published_at) + (p.pending ? " · aguardando dados" : p.data_status === "PROCESSING" ? " · processando" : "") }),
              p.error ? UI.el("small", { class: "pin-error", text: p.error }) : null,
            ]),
          ])),
          UI.el("td", { class: "num", text: n(m.impressions) }),
          UI.el("td", { class: "num", text: n(m.saves) }),
          UI.el("td", { class: "num", text: n(m.pin_clicks) }),
          UI.el("td", { class: "num", text: n(m.outbound_clicks) }),
        ];
        if (showVideo) {
          cells.push(UI.el("td", { class: "num", text: p.kind === "video" ? n(m.video_views) : "—" }));
          cells.push(UI.el("td", { class: "num", text: p.kind === "video" ? duration(m.video_avg_ms) : "—" }));
          cells.push(UI.el("td", { class: "num", text: p.kind === "video" ? pct(m.video_95, m.video_views) : "—" }));
        }
        tbody.appendChild(UI.el("tr", {}, cells));
      });
      table.appendChild(thead);
      table.appendChild(tbody);
      card.appendChild(UI.el("div", { class: "table-wrap" }, table));
      card.appendChild(UI.el("p", { class: "hint", text: "Views = visualizações de vídeo (MRC, 2 s). Tempo médio = tempo médio assistido. Até o fim = vezes em que 95% do vídeo foi visto, em relação às views. Fonte: API oficial da Pinterest; os números podem demorar até 2 dias para consolidar." }));
    }

    /* ---------- Avisos e carregamento ---------- */

    function renderNotice(d) {
      var parts = [];
      if (!d.pinterest_configured) parts.push("A conexão com a Pinterest ainda não está configurada: os números aparecem quando ela for ligada.");
      if (d.rate_limited) parts.push("A Pinterest limitou as consultas por agora; alguns pins podem estar com dados antigos. Tente de novo mais tarde.");
      if (d.pending > 0 && d.pinterest_configured && !d.rate_limited) parts.push(d.pending + (d.pending === 1 ? " pin ainda está" : " pins ainda estão") + " sem dados atualizados. Recarregue a página para buscar os próximos.");
      notice.hidden = !parts.length;
      notice.textContent = parts.join(" ");
      var updated = el("updated-at");
      var spread = d.oldest_fetch && d.newest_fetch ? new Date(d.newest_fetch) - new Date(d.oldest_fetch) : 0;
      updated.textContent = d.newest_fetch ? "Dados de " + UI.formatRelative(d.newest_fetch) + (spread > 10 * 60 * 1000 ? " (os mais antigos " + UI.formatRelative(d.oldest_fetch) + ")" : "") + ". Período: " + UI.formatDate(d.range.start + "T12:00:00Z") + " a " + UI.formatDate(d.range.end + "T12:00:00Z") + "." : "Período: " + UI.formatDate(d.range.start + "T12:00:00Z") + " a " + UI.formatDate(d.range.end + "T12:00:00Z") + ".";
    }

    function render(d) {
      state.data = d;
      renderStats(d);
      renderChart(d);
      renderAccounts(d);
      renderTop(d);
      renderTable(d);
      renderNotice(d);
    }

    function params() {
      return "days=" + state.days + (state.account ? "&account=" + encodeURIComponent(state.account) : "");
    }

    function load() {
      if (state.loading) return;
      state.loading = true;
      el("table-card").setAttribute("aria-busy", "true");
      UI.api("/api/analytics?" + params()).then(function (r) {
        state.loading = false;
        el("table-card").removeAttribute("aria-busy");
        if (r.status !== 200) return App.errorToast(r);
        render(r.data);
      });
    }

    el("refresh-btn").addEventListener("click", function () {
      var btn = this;
      UI.busy(btn, true, "Buscando na Pinterest...");
      UI.api("/api/analytics/refresh", { method: "POST", body: { days: state.days, account: state.account || undefined } }).then(function (r) {
        UI.busy(btn, false);
        if (r.status !== 200) return App.errorToast(r);
        UI.toast("Dados atualizados.", "ok");
        render(r.data);
      });
    });

    document.querySelectorAll("[data-days]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        document.querySelectorAll("[data-days]").forEach(function (c) { c.setAttribute("aria-pressed", "false"); });
        chip.setAttribute("aria-pressed", "true");
        state.days = Number(chip.getAttribute("data-days"));
        load();
      });
    });
    document.querySelectorAll("[data-kind]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        document.querySelectorAll("[data-kind]").forEach(function (c) { c.setAttribute("aria-pressed", "false"); });
        chip.setAttribute("aria-pressed", "true");
        state.kind = chip.getAttribute("data-kind");
        if (state.data) {
          renderTop(state.data);
          renderTable(state.data);
        }
      });
    });
    accountSel.addEventListener("change", function () {
      state.account = accountSel.value;
      load();
    });

    UI.api("/api/accounts").then(function (r) {
      if (r.status !== 200) return;
      r.data.accounts.forEach(function (a) {
        accountSel.appendChild(UI.el("option", { value: a.id, text: "@" + a.username + (a.label ? " (" + a.label + ")" : "") }));
      });
    });

    load();
  });
})();
