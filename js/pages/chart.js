/* Gráfico diário em SVG (barras + linha), sem dependências. Expõe window.Chart.daily. */
(function () {
  "use strict";

  var fmt = new Intl.NumberFormat("pt-BR");
  var svgNS = "http://www.w3.org/2000/svg";

  function node(tag, attrs, text) {
    var e = document.createElementNS(svgNS, tag);
    Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /**
   * Chart.daily(container, days, { bar: "impressions", line: "engagement", barLabel, lineLabel, empty })
   * days: [{ date: "YYYY-MM-DD", ...métricas }]
   */
  window.Chart = {
    daily: function (container, days, opts) {
      var o = opts || {};
      var barKey = o.bar || "impressions";
      var lineKey = o.line || "engagement";
      container.innerHTML = "";
      if (!days || !days.length || !days.some(function (x) { return x[barKey] > 0 || x[lineKey] > 0; })) {
        container.appendChild(UI.el("p", { class: "hint", text: o.empty || "Sem dados diários ainda. A Pinterest leva de 1 a 2 dias para consolidar os números." }));
        return;
      }
      var W = 720, H = 220, padL = 44, padR = 12, padT = 14, padB = 30;
      var maxBar = Math.max.apply(null, days.map(function (x) { return x[barKey] || 0; }).concat([1]));
      var maxLine = Math.max.apply(null, days.map(function (x) { return x[lineKey] || 0; }).concat([1]));
      var innerW = W - padL - padR;
      var innerH = H - padT - padB;
      var step = innerW / days.length;
      var svg = node("svg", { viewBox: "0 0 " + W + " " + H, class: "chart-svg", role: "img", "aria-label": (o.barLabel || "Impressões") + " por dia (barras) e " + (o.lineLabel || "engajamento") + " (linha)" });
      for (var g = 0; g <= 3; g++) {
        var y = padT + innerH - (innerH * g) / 3;
        svg.appendChild(node("line", { x1: padL, x2: W - padR, y1: y, y2: y, class: "chart-grid" }));
        svg.appendChild(node("text", { x: padL - 6, y: y + 4, class: "chart-axis", "text-anchor": "end" }, fmt.format(Math.round((maxBar * g) / 3))));
      }
      days.forEach(function (x, i) {
        var h = ((x[barKey] || 0) / maxBar) * innerH;
        var bw = Math.max(2, step * 0.7);
        var rect = node("rect", { x: padL + i * step + step * 0.15, y: padT + innerH - h, width: bw, height: h, rx: Math.min(3, bw / 2), class: "chart-bar" + (x.status && x.status !== "READY" ? " is-partial" : "") });
        rect.appendChild(node("title", {}, UI.formatDate(x.date + "T12:00:00Z") + ": " + fmt.format(Math.round(x[barKey] || 0)) + " " + (o.barLabel || "impressões").toLowerCase() + " · " + fmt.format(Math.round(x[lineKey] || 0)) + " " + (o.lineLabel || "engajamento").toLowerCase()));
        svg.appendChild(rect);
      });
      var points = days.map(function (x, i) {
        return padL + i * step + step / 2 + "," + (padT + innerH - ((x[lineKey] || 0) / maxLine) * innerH);
      });
      svg.appendChild(node("polyline", { points: points.join(" "), class: "chart-line" }));
      var every = Math.max(1, Math.ceil(days.length / 8));
      days.forEach(function (x, i) {
        var isLast = i === days.length - 1;
        if (i % every !== 0 && !isLast) return;
        if (isLast && i % every !== 0 && i % every < every / 2) return;
        svg.appendChild(node("text", { x: padL + i * step + step / 2, y: H - 8, class: "chart-axis", "text-anchor": "middle" }, x.date.slice(8, 10) + "/" + x.date.slice(5, 7)));
      });
      container.appendChild(svg);
      container.appendChild(UI.el("p", { class: "chart-legend" }, [UI.el("span", { class: "legend-bar" }), (o.barLabel || "Impressões") + " ", UI.el("span", { class: "legend-line" }), o.lineLabel || "Engajamento (salvamentos + cliques)"]));
    },
  };
})();
