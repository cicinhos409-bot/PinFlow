"use strict";

/**
 * Pinterest de mentira para os testes automáticos: imita o login (OAuth) e os endpoints da
 * API v5 que a plataforma usa, sem tocar na Pinterest de verdade.
 *
 * Truques para simular erros (pelo título do pin):
 *   "FALHA400" -> 400 (rejeitado, não tenta de novo)
 *   "FALHA429" -> 429 (limite, tenta de novo mais tarde)
 *   "FALHA401" -> 401 na primeira chamada (força renovação do token), depois funciona
 */

const http = require("http");

function createFakePinterest() {
  const state = {
    tokens: new Map(), // access_token -> { user, refresh }
    boards: [
      { id: "900100", name: "Receitas", description: "", privacy: "PUBLIC", pin_count: 3, media: { image_cover_url: "" } },
      { id: "900200", name: "Decoração", description: "Casa", privacy: "PUBLIC", pin_count: 10, media: { image_cover_url: "" } },
    ],
    pins: [],
    media: new Map(),
    uploads: [],
    calls: [],
    refreshCount: 0,
    failed401Once: new Set(),
    nextId: 1,
  };

  function json(res, status, body) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
  }

  function readBody(req) {
    return new Promise((resolve) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks)));
    });
  }

  function issueTokens() {
    const access = "pina_" + Math.random().toString(36).slice(2);
    const refresh = "pinr_" + Math.random().toString(36).slice(2);
    state.tokens.set(access, { refresh });
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: "bearer",
      expires_in: 2592000,
      refresh_token_expires_in: 5184000,
      refresh_token_expires_at: Math.floor(Date.now() / 1000) + 5184000,
      scope: "boards:read boards:write pins:read pins:write user_accounts:read",
    };
  }

  function bearer(req) {
    const h = String(req.headers.authorization || "");
    return h.startsWith("Bearer ") ? h.slice(7) : null;
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname;
    state.calls.push({ method: req.method, path: p });

    // Tela de autorização (imita o login oficial): o botão volta para o redirect_uri com o código.
    if (p === "/oauth/" && req.method === "GET") {
      const back = new URL(url.searchParams.get("redirect_uri") || "http://localhost/");
      back.searchParams.set("code", "codigo-valido");
      back.searchParams.set("state", url.searchParams.get("state") || "");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end(
        "<!doctype html><html lang=\"pt-BR\"><body style=\"font-family:sans-serif;padding:40px;background:#fff\">" +
          "<h1>Pinterest (simulação)</h1><p>O app <b>" + (url.searchParams.get("client_id") || "") + "</b> pede acesso: " + (url.searchParams.get("scope") || "") + "</p>" +
          "<p><a id=\"authorize\" href=\"" + back.toString() + "\">Autorizar</a> · <a id=\"deny\" href=\"" + back.origin + "/api/pinterest/callback?error=access_denied&state=" + encodeURIComponent(url.searchParams.get("state") || "") + "\">Recusar</a></p></body></html>"
      );
    }

    // Upload do vídeo (sem Bearer)
    if (p === "/upload" && req.method === "POST") {
      const body = await readBody(req);
      state.uploads.push({ size: body.length, contentType: req.headers["content-type"] });
      res.statusCode = 204;
      return res.end();
    }

    if (p === "/v5/oauth/token" && req.method === "POST") {
      const auth = String(req.headers.authorization || "");
      const expected = "Basic " + Buffer.from(process.env.PINTEREST_APP_ID + ":" + process.env.PINTEREST_APP_SECRET).toString("base64");
      if (auth !== expected) return json(res, 401, { code: 2, message: "Authentication failed." });
      const form = new URLSearchParams((await readBody(req)).toString());
      const grant = form.get("grant_type");
      if (grant === "authorization_code") {
        if (form.get("code") !== "codigo-valido") return json(res, 400, { code: 1, message: "Invalid code" });
        return json(res, 200, Object.assign(issueTokens(), { response_type: "authorization_code" }));
      }
      if (grant === "refresh_token") {
        const ok = [...state.tokens.values()].some((t) => t.refresh === form.get("refresh_token"));
        if (!ok) return json(res, 401, { code: 2, message: "Invalid refresh token" });
        state.refreshCount++;
        return json(res, 200, Object.assign(issueTokens(), { response_type: "refresh_token" }));
      }
      return json(res, 400, { code: 1, message: "Unsupported grant" });
    }

    // Daqui para baixo tudo exige um token válido
    let m;
    const token = bearer(req);
    if (!token || !state.tokens.has(token)) return json(res, 401, { code: 2, message: "Authentication failed." });

    // Análises: números determinísticos (dependem do id e da data) para os testes conferirem somas.
    function dailyFor(seed, start, end, metricTypes) {
      const days = [];
      for (let t = Date.parse(start); t <= Date.parse(end); t += 86400000) {
        const date = new Date(t).toISOString().slice(0, 10);
        const base = (seed + Number(date.replace(/-/g, "")) % 97) % 50;
        const metrics = {};
        metricTypes.forEach((m, i) => { metrics[m] = m.endsWith("_RATE") ? 0.1 : base + i; });
        days.push({ date, data_status: "READY", metrics });
      }
      return days;
    }
    function summaryOf(days) {
      const s = {};
      days.forEach((d) => Object.keys(d.metrics).forEach((k) => { s[k] = (s[k] || 0) + d.metrics[k]; }));
      return s;
    }
    m = /^\/v5\/pins\/(\d+)\/analytics$/.exec(p);
    if (m && req.method === "GET") {
      const pin = state.pins.find((x) => x.id === m[1]);
      if (!pin) return json(res, 404, { code: 4, message: "Pin not found" });
      state.analyticsCalls = (state.analyticsCalls || 0) + 1;
      if (state.analyticsRateLimit) return json(res, 429, { code: 8, message: "Rate limit exceeded" });
      const types = String(url.searchParams.get("metric_types") || "IMPRESSION").split(",");
      const days = dailyFor(Number(m[1]), url.searchParams.get("start_date"), url.searchParams.get("end_date"), types);
      return json(res, 200, { all: { daily_metrics: days, summary_metrics: summaryOf(days), lifetime_metrics: { TOTAL_COMMENTS: 2, TOTAL_REACTIONS: 5 } } });
    }
    if (p === "/v5/user_account/analytics" && req.method === "GET") {
      state.analyticsCalls = (state.analyticsCalls || 0) + 1;
      const types = String(url.searchParams.get("metric_types") || "IMPRESSION").split(",");
      const days = dailyFor(4242, url.searchParams.get("start_date"), url.searchParams.get("end_date"), types);
      return json(res, 200, { all: { daily_metrics: days, summary_metrics: summaryOf(days) } });
    }

    if (p === "/v5/user_account" && req.method === "GET") {
      return json(res, 200, { id: "4242", username: "maria_pins", account_type: "BUSINESS", profile_image: "https://i.pinimg.com/fake.jpg", business_name: "Maria Pins", website_url: "https://exemplo.com" });
    }

    if (p === "/v5/boards" && req.method === "GET") {
      return json(res, 200, { items: state.boards, bookmark: null });
    }
    if (p === "/v5/boards" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString() || "{}");
      const board = { id: String(900300 + state.nextId++), name: body.name, description: body.description || "", privacy: body.privacy || "PUBLIC", pin_count: 0, media: {} };
      state.boards.push(board);
      return json(res, 201, board);
    }
    m = /^\/v5\/boards\/(\d+)$/.exec(p);
    if (m && req.method === "PATCH") {
      const board = state.boards.find((b) => b.id === m[1]);
      if (!board) return json(res, 404, { code: 4, message: "Board not found" });
      Object.assign(board, JSON.parse((await readBody(req)).toString() || "{}"));
      return json(res, 200, board);
    }
    if (m && req.method === "DELETE") {
      state.boards = state.boards.filter((b) => b.id !== m[1]);
      res.statusCode = 204;
      return res.end();
    }

    if (p === "/v5/media" && req.method === "POST") {
      const id = "media-" + state.nextId++;
      state.media.set(id, { polls: 0 });
      return json(res, 201, { media_id: id, media_type: "video", upload_url: "http://127.0.0.1:" + server.address().port + "/upload", upload_parameters: { key: "chave-" + id, policy: "p" } });
    }
    m = /^\/v5\/media\/([^/]+)$/.exec(p);
    if (m && req.method === "GET") {
      const media = state.media.get(m[1]);
      if (!media) return json(res, 404, { code: 4, message: "Media not found" });
      media.polls++;
      return json(res, 200, { media_id: m[1], media_type: "video", status: media.polls >= 2 ? "succeeded" : "processing" });
    }

    if (p === "/v5/pins" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString() || "{}");
      const title = String(body.title || "");
      if (title.includes("FALHA400")) return json(res, 400, { code: 1, message: "Invalid board or media" });
      if (title.includes("FALHA429")) return json(res, 429, { code: 8, message: "Rate limit exceeded" });
      if (title.includes("FALHA401") && !state.failed401Once.has(title)) {
        state.failed401Once.add(title);
        return json(res, 401, { code: 2, message: "Authentication failed." });
      }
      if (!body.board_id || !body.media_source) return json(res, 400, { code: 1, message: "board_id and media_source are required" });
      if (body.media_source.source_type === "video_id" && !body.media_source.cover_image_url) return json(res, 400, { code: 1, message: "cover image required" });
      const pin = Object.assign({ id: String(700000 + state.nextId++), created_at: new Date().toISOString() }, body);
      state.pins.push(pin);
      return json(res, 201, pin);
    }
    m = /^\/v5\/pins\/(\d+)$/.exec(p);
    if (m && req.method === "PATCH") {
      const pin = state.pins.find((x) => x.id === m[1]);
      if (!pin) return json(res, 404, { code: 4, message: "Pin not found" });
      Object.assign(pin, JSON.parse((await readBody(req)).toString() || "{}"));
      return json(res, 200, pin);
    }
    if (m && req.method === "DELETE") {
      const before = state.pins.length;
      state.pins = state.pins.filter((x) => x.id !== m[1]);
      if (before === state.pins.length) return json(res, 404, { code: 4, message: "Pin not found" });
      res.statusCode = 204;
      return res.end();
    }

    json(res, 404, { code: 4, message: "Not found: " + req.method + " " + p });
  });

  return { server, state };
}

module.exports = { createFakePinterest };
