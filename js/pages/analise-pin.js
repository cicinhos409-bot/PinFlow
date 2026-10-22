/* Análise completa de um pin ou vídeo. */
(function () {
  "use strict";

  App.ready(function () {
    var pinId = App.item();
    var el = function (id) { return document.getElementById(id); };
    var state = { days: 30, data: null };
    var fmt = new Intl.NumberFormat("pt-BR");
    function n(v) { return fmt.format(Math.round(v || 0)); }
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
    function diff(value, avg) {
      if (avg === null || avg === undefined || !avg) return null;
      var d = ((value - avg) / avg) * 100;
      return (d >= 0 ? "+" : "") + Math.round(d) + "% vs. média";
    }

    if (App.preview) {
      el("pin-head").appendChild(UI.empty("Modo de visualização", "Conecte o banco de dados para ver as métricas dos seus pins."));
      el("content").hidden = true;
      return;
    }

    function renderHead(d) {
      var head = el("pin-head");
      head.innerHTML = "";
      var preview = UI.el("div", { class: "pin-preview small" });
      if (d.media) {
        if (d.media.kind === "video") preview.appendChild(UI.el("video", { src: d.media.url, controls: true, playsinline: true, poster: d.cover ? d.cover.url : null }));
        else preview.appendChild(UI.el("img", { src: d.media.url, alt: "" }));
      }
      var info = UI.el("div", { class: "pin-info" }, [
        UI.el("div", { class: "pin-status-line" }, [UI.el("span", { class: "badge " + (d.kind === "video" ? "is-publishing" : "is-published"), text: d.kind === "video" ? "Vídeo" : "Imagem" }), UI.el("span", { text: "publicado em " + UI.formatDateTime(d.published_at, { year: "numeric" }) })]),
        UI.el("h1", { text: d.title || "(sem título)" }),
        UI.el("p", { class: "section-intro", text: (d.account ? "@" + d.account.username : "") + (d.board ? " · " + d.board.name : "") + (d.link ? " · " + d.link : "") }),
        UI.el("div", { class: "card-actions" }, [
          d.pinterest_url ? UI.el("a", { class: "btn btn-small btn-ghost", href: d.pinterest_url, target: "_blank", rel: "noopener", text: "Ver na Pinterest" }) : null,
          UI.el("a", { class: "btn btn-small btn-ghost", href: App.url("pins", d.id), text: "Abrir pin" }),
          UI.el("button", { class: "btn btn-small btn-primary", type: "button", id: "refresh-pin", text: "Atualizar dados" }),
        ]),
      ]);
      head.appendChild(preview);
      head.appendChild(info);
      el("refresh-pin").addEventListener("click", refresh);
    }

    function tile(label, value, note, cls) {
      return UI.el("div", { class: "stat" + (cls ? " " + cls : "") }, [UI.el("span", { class: "stat-label", text: label }), UI.el("strong", { class: "stat-value", text: value }), note ? UI.el("span", { class: "stat-note", text: note }) : null]);
    }

    function renderStats(d) {
      var m = d.metrics;
      var a = d.average;
      var wrap = el("stats");
      wrap.innerHTML = "";
      wrap.appendChild(tile("Impressões", n(m.impressions), diff(m.impressions, a && a.impressions) || "vezes que o pin apareceu"));
      wrap.appendChild(tile("Engajamento", n(d.engagement), diff(d.engagement, a && a.engagement) || "salvamentos + cliques"));
      wrap.appendChild(tile("Salvamentos", n(m.saves), pct(m.saves, m.impressions) + " das impressões"));
      wrap.appendChild(tile("Cliques no pin", n(m.pin_clicks), pct(m.pin_clicks, m.impressions) + " das impressões"));
      wrap.appendChild(tile("Cliques no link", n(m.outbound_clicks), pct(m.outbound_clicks, m.impressions) + " das impressões"));
      wrap.appendChild(tile("Comentários e reações", n(m.comments) + " · " + n(m.reactions), "desde a publicação"));
      var avgNote = el("avg-note");
      avgNote.textContent = a ? "Média calculada com " + a.count + (a.count === 1 ? " outro pin seu" : " outros pins seus") + (d.kind === "video" ? " de vídeo" : " de imagem") + " no mesmo período." : "Ainda não há outros pins seus do mesmo tipo com dados para comparar.";
    }

    function renderVideo(d) {
      var card = el("video-card");
      if (d.kind !== "video") {
        card.hidden = true;
        return;
      }
      card.hidden = false;
      var m = d.metrics;
      var wrap = el("video-stats");
      wrap.innerHTML = "";
      wrap.appendChild(tile("Iniciaram", n(m.video_starts), "deram play"));
      wrap.appendChild(tile("Visualizações", n(m.video_views), "assistiram 2 s ou mais (MRC)"));
      wrap.appendChild(tile("10 segundos", n(m.video_10s), pct(m.video_10s, m.video_views) + " das views"));
      wrap.appendChild(tile("Até o fim", n(m.video_95), pct(m.video_95, m.video_views) + " viram 95% ou mais"));
      wrap.appendChild(tile("Tempo médio", duration(m.video_avg_ms), "por visualização"));
      wrap.appendChild(tile("Tempo total", duration(m.video_total_ms), "assistido no período"));
      // Funil
      var funnel = el("funnel");
      funnel.innerHTML = "";
      var steps = [["Impressões", m.impressions], ["Deram play", m.video_starts], ["Views (2 s+)", m.video_views], ["10 s", m.video_10s], ["Até o fim", m.video_95]];
      var max = Math.max.apply(null, steps.map(function (s) { return s[1] || 0; }).concat([1]));
      steps.forEach(function (s) {
        funnel.appendChild(UI.el("div", { class: "funnel-row" }, [
          UI.el("span", { class: "funnel-label", text: s[0] }),
          UI.el("div", { class: "funnel-bar" }, UI.el("i", { style: "width:" + Math.max(2, ((s[1] || 0) / max) * 100) + "%" })),
          UI.el("span", { class: "funnel-value", text: n(s[1]) }),
        ]));
      });
    }

    function renderDaily(d) {
      Chart.daily(el("chart"), d.daily, { bar: "impressions", line: "engagement" });
      var vc = el("chart-video");
      if (d.kind === "video") {
        el("chart-video-card").hidden = false;
        Chart.daily(vc, d.daily, { bar: "video_views", line: "saves", barLabel: "Visualizações", lineLabel: "Salvamentos" });
      } else el("chart-video-card").hidden = true;
    }

    function renderNote(d) {
      var parts = [];
      if (!d.pinterest_configured) parts.push("A conexão com a Pinterest ainda não está configurada.");
      if (d.account_status && d.account_status !== "active") parts.push("A conta deste pin precisa ser reconectada para atualizar os dados.");
      if (d.fetch_error) parts.push("Não foi possível buscar dados novos agora: " + d.fetch_error);
      if (d.error) parts.push(d.error);
      if (d.data_status === "PROCESSING") parts.push("A Pinterest ainda está processando os últimos dias.");
      var notice = el("pin-notice");
      notice.hidden = !parts.length;
      notice.textContent = parts.join(" ");
      el("updated-at").textContent = (d.fetched_at ? "Dados de " + UI.formatRelative(d.fetched_at) + ". " : d.pending ? "Ainda sem dados da Pinterest. " : "") + "Período: " + UI.formatDate(d.range.start + "T12:00:00Z") + " a " + UI.formatDate(d.range.end + "T12:00:00Z") + ".";
    }

    function render(d) {
      state.data = d;
      if (!el("refresh-pin")) renderHead(d);
      renderStats(d);
      renderVideo(d);
      renderDaily(d);
      renderNote(d);
    }

    function load() {
      UI.api("/api/analytics/pin/" + encodeURIComponent(pinId) + "?days=" + state.days).then(function (r) {
        if (r.status === 404) {
          el("pin-head").appendChild(UI.empty("Pin não encontrado.", "", UI.el("a", { class: "btn btn-primary", href: App.url("analises"), text: "Ver análises" })));
          el("content").hidden = true;
          return;
        }
        if (r.status !== 200) return App.errorToast(r);
        if (!r.data.available) {
          el("pin-head").appendChild(UI.empty("Ainda sem métricas.", r.data.reason, UI.el("a", { class: "btn btn-primary", href: App.url("pins", pinId), text: "Abrir pin" })));
          el("content").hidden = true;
          return;
        }
        render(r.data);
      });
    }

    function refresh() {
      var btn = el("refresh-pin");
      UI.busy(btn, true, "Buscando...");
      UI.api("/api/analytics/pin/" + encodeURIComponent(pinId) + "/refresh", { method: "POST", body: { days: state.days } }).then(function (r) {
        UI.busy(btn, false);
        if (r.status !== 200) return App.errorToast(r);
        UI.toast("Dados atualizados.", "ok");
        render(r.data);
      });
    }

    document.querySelectorAll("[data-days]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        document.querySelectorAll("[data-days]").forEach(function (c) { c.setAttribute("aria-pressed", "false"); });
        chip.setAttribute("aria-pressed", "true");
        state.days = Number(chip.getAttribute("data-days"));
        load();
      });
    });

    load();
  });
})();
