"use strict";

/**
 * Testes de ponta a ponta da API: contas da Pinterest (login oficial simulado), pastas,
 * mídia, pins (criar/editar/cancelar/duplicar/apagar), fila de publicação (imagem e vídeo,
 * falhas e novas tentativas), histórico, sessões, e-mails e exclusão da conta.
 *
 *   npm run test:api
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pinflow-api-"));
if (!process.env.DATABASE_URL) process.env.AUTH_STORE = "file";
process.env.MEDIA_STORE = "file";
process.env.AUTH_FILE_PATH = path.join(tmp, "db.json");
process.env.MEDIA_FILE_DIR = path.join(tmp, "media");
process.env.SESSION_SECRET = "segredo-de-teste-com-mais-de-16-caracteres";
process.env.TOKEN_ENCRYPTION_KEY = require("crypto").randomBytes(32).toString("base64");
process.env.PINTEREST_APP_ID = "app-de-teste";
process.env.PINTEREST_APP_SECRET = "segredo-de-teste";
process.env.MAIL_STORE = "memory";
process.env.CRON_SECRET = "cron-secreto";
process.env.PF_MIN_GAP_SECONDS = "0";
process.env.PF_MEDIA_POLL_MS = "10";
process.env.PF_WORKER_MIN_INTERVAL_MS = "0";
delete process.env.VERCEL;

const { createFakePinterest } = require("./fake-pinterest");

let base = "";
let passed = 0;
let failed = 0;

function check(name, condition, extra) {
  if (condition) {
    passed++;
    console.log("  ok   " + name);
  } else {
    failed++;
    console.log("  FALHA " + name + (extra ? "  -> " + extra : ""));
  }
}

async function call(method, url, opts) {
  const o = opts || {};
  const headers = Object.assign({}, o.headers || {});
  if (o.body !== undefined && !o.raw) headers["Content-Type"] = "application/json";
  if (o.cookie) headers.Cookie = o.cookie;
  const res = await fetch(base + url, {
    method,
    headers,
    body: o.body === undefined ? undefined : o.raw ? o.body : JSON.stringify(o.body),
    redirect: "manual",
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (e) {
    /* sem JSON */
  }
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
  return { status: res.status, data, text, headers: res.headers, setCookie, location: res.headers.get("location") };
}

function cookieFrom(setCookies, name) {
  for (const c of setCookies || []) if (c.startsWith(name + "=")) return c.split(";")[0];
  return null;
}

async function main() {
  const fake = createFakePinterest();
  await new Promise((r) => fake.server.listen(0, "127.0.0.1", r));
  const fakePort = fake.server.address().port;
  process.env.PINTEREST_API_BASE = "http://127.0.0.1:" + fakePort + "/v5";
  process.env.PINTEREST_OAUTH_URL = "http://127.0.0.1:" + fakePort + "/oauth/";

  const { createServer } = require("./dev-server");
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port;
  process.env.APP_URL = base;
  console.log("Servidor de teste em " + base + " (Pinterest falsa em :" + fakePort + ")\n");

  console.log("Estado dos serviços");
  let r = await call("GET", "/api/status");
  check("status público", r.status === 200 && r.data.db === true && r.data.storage === "file" && r.data.pinterest === true && r.data.mail === true);
  r = await call("GET", "/api/nao-existe");
  check("rota desconhecida -> 404", r.status === 404);

  console.log("\nConta na plataforma");
  r = await call("POST", "/api/auth/register", { body: { email: "maria@exemplo.com", password: "uma frase longa e boa 2026", acceptTerms: true, name: "Maria" } });
  check("cadastro", r.status === 201, r.text);
  const cookie = cookieFrom(r.setCookie, "pf_session");
  const uid = r.data.user.id;
  const mailer = require("../api/_lib/mailer");
  await new Promise((r) => setTimeout(r, 100)); // o e-mail de confirmação sai em segundo plano
  check("e-mail de confirmação enviado", mailer.sent.some((m) => m.to === "maria@exemplo.com" && /Confirme/.test(m.subject)));

  r = await call("GET", "/api/accounts", { cookie });
  check("lista de contas vazia", r.status === 200 && r.data.accounts.length === 0 && r.data.pinterest_configured === true);

  console.log("\nLogin oficial da Pinterest");
  r = await call("GET", "/api/pinterest/connect");
  check("conectar sem sessão -> vai para o login", r.status === 302 && r.location === "/app/login");
  r = await call("GET", "/api/pinterest/connect", { cookie });
  check("conectar -> redireciona para a Pinterest", r.status === 302 && String(r.location).startsWith(process.env.PINTEREST_OAUTH_URL), r.location);
  const authUrl = new URL(r.location);
  check("pede os escopos certos", /boards:read/.test(authUrl.searchParams.get("scope")) && /pins:write/.test(authUrl.searchParams.get("scope")));
  check("redirect_uri aponta para o callback", authUrl.searchParams.get("redirect_uri") === base + "/api/pinterest/callback");
  const state = authUrl.searchParams.get("state");
  const oauthCookie = cookieFrom(r.setCookie, "pf_oauth");
  check("cookie de estado criado (HttpOnly)", Boolean(oauthCookie) && r.setCookie.some((c) => c.startsWith("pf_oauth=") && /HttpOnly/.test(c)));

  r = await call("GET", "/api/pinterest/callback?code=codigo-valido&state=errado", { cookie: cookie + "; " + oauthCookie });
  check("estado errado é recusado", r.status === 302 && /erro=estado_invalido/.test(r.location));
  r = await call("GET", "/api/pinterest/callback?code=codigo-valido&state=" + state, { cookie: cookie + "; " + oauthCookie });
  check("callback conecta a conta", r.status === 302 && /conectada=1/.test(r.location), r.location);
  const accId = String(r.location).split("/")[4].split("?")[0];

  r = await call("GET", "/api/accounts", { cookie });
  check("conta aparece na lista", r.data.accounts.length === 1 && r.data.accounts[0].username === "maria_pins" && r.data.accounts[0].is_business === true);
  check("pastas sincronizadas no callback", r.data.accounts[0].boards_count === 2);
  const dbDirect = require("../api/_lib/db").getDb();
  const accRow = (await dbDirect.findMany("pinterest_accounts", {}, { limit: 1 }))[0];
  check("tokens guardados só criptografados", /^v1:/.test(accRow.access_token_enc) && !JSON.stringify(accRow).includes("pina_"));

  r = await call("GET", "/api/pinterest/callback?code=codigo-valido&state=" + state, { cookie: cookie + "; " + oauthCookie });
  r = await call("GET", "/api/accounts", { cookie });
  check("reconectar a mesma conta não duplica", r.data.accounts.length === 1);

  console.log("\nPastas");
  r = await call("GET", "/api/accounts/" + accId, { cookie });
  check("detalhe da conta com pastas", r.status === 200 && r.data.boards.length === 2 && r.data.boards[0].name === "Decoração");
  const boardId = r.data.boards.find((b) => b.name === "Receitas").id;
  r = await call("POST", "/api/accounts/" + accId + "/boards", { body: { name: "Nova pasta", privacy: "SECRET" }, cookie });
  check("criar pasta na Pinterest", r.status === 201 && r.data.board.name === "Nova pasta" && r.data.board.privacy === "SECRET");
  const newBoardId = r.data.board.id;
  r = await call("PATCH", "/api/accounts/" + accId + "/boards/" + newBoardId, { body: { name: "Pasta renomeada" }, cookie });
  check("renomear pasta", r.status === 200 && r.data.board.name === "Pasta renomeada");
  r = await call("POST", "/api/accounts/" + accId + "/sync", { body: {}, cookie });
  check("sincronizar pastas", r.status === 200 && r.data.boards.length === 3);
  r = await call("PATCH", "/api/accounts/" + accId, { body: { daily_limit: 10, label: "Loja" }, cookie });
  check("limite diário e apelido da conta", r.status === 200 && r.data.account.daily_limit === 10 && r.data.account.label === "Loja");
  r = await call("PATCH", "/api/accounts/" + accId, { body: { daily_limit: 999 }, cookie });
  check("limite diário acima do máximo -> 422", r.status === 422);

  console.log("\nMídia");
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  r = await call("PUT", "/api/media/upload-local?filename=foto.png", { body: png, raw: true, cookie, headers: { "Content-Type": "application/octet-stream" } });
  check("upload local", r.status === 200 && /^\/media-local\//.test(r.data.url), r.text);
  r = await call("POST", "/api/media", { body: { url: r.data.url, content_type: "image/png", filename: "foto.png", width: 1000, height: 1500 }, cookie });
  check("registrar imagem", r.status === 201 && r.data.media.kind === "image");
  const imageId = r.data.media.id;
  r = await call("POST", "/api/media", { body: { url: "https://site-de-fora.example/x.png", content_type: "image/png" }, cookie });
  check("URL de fora do armazenamento é recusada", r.status === 422);
  r = await call("PUT", "/api/media/upload-local?filename=video.mp4", { body: Buffer.alloc(5000, 1), raw: true, cookie, headers: { "Content-Type": "application/octet-stream" } });
  r = await call("POST", "/api/media", { body: { url: r.data.url, content_type: "video/mp4", filename: "video.mp4", duration_ms: 12000 }, cookie });
  check("registrar vídeo", r.status === 201 && r.data.media.kind === "video");
  const videoId = r.data.media.id;
  r = await call("GET", "/api/media", { cookie });
  check("biblioteca lista 2 arquivos", r.status === 200 && r.data.total === 2);

  console.log("\nPins");
  r = await call("POST", "/api/pins", { body: { targets: [], media_id: imageId, publish_now: true }, cookie });
  check("sem destino -> 422", r.status === 422 && r.data.error.field === "targets");
  r = await call("POST", "/api/pins", { body: { targets: [{ account: accId, board: boardId }], media_id: imageId, title: "x".repeat(101), publish_now: true }, cookie });
  check("título longo demais -> 422", r.status === 422 && r.data.error.field === "title");
  r = await call("POST", "/api/pins", { body: { targets: [{ account: accId, board: boardId }], media_id: imageId, link: "javascript:alert(1)", publish_now: true }, cookie });
  check("link inválido -> 422", r.status === 422 && r.data.error.field === "link");
  r = await call("POST", "/api/pins", { body: { targets: [{ account: accId, board: boardId }], media_id: videoId, publish_now: true }, cookie });
  check("vídeo sem capa -> 422", r.status === 422 && r.data.error.code === "cover_required");
  r = await call("POST", "/api/pins", { body: { targets: [{ account: accId, board: boardId }], media_id: imageId, scheduled_at: "2020-01-01T00:00:00Z" }, cookie });
  check("data no passado -> 422", r.status === 422 && r.data.error.code === "date_in_past");

  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  r = await call("POST", "/api/pins", {
    body: { targets: [{ account: accId, board: boardId }, { account: accId, board: newBoardId }], media_id: imageId, title: "Bolo de cenoura", description: "Receita fácil", link: "https://exemplo.com/bolo", alt_text: "Bolo", scheduled_at: future },
    cookie,
  });
  check("criar pins para 2 pastas de uma vez", r.status === 201 && r.data.pins.length === 2 && r.data.pins[0].status === "scheduled", r.text);
  const pinA = r.data.pins[0].id;
  const pinB = r.data.pins[1].id;

  r = await call("GET", "/api/pins?status=scheduled", { cookie });
  check("lista de programados", r.status === 200 && r.data.total === 2 && r.data.pins[0].media.kind === "image" && r.data.pins[0].account.username === "maria_pins");

  r = await call("PATCH", "/api/pins/" + pinA, { body: { title: "Bolo de cenoura com cobertura", publish_now: true }, cookie });
  check("editar pin programado e publicar agora", r.status === 200 && r.data.pin.title === "Bolo de cenoura com cobertura");
  r = await call("POST", "/api/pins/" + pinB + "/cancel", { body: {}, cookie });
  check("cancelar pin", r.status === 200 && r.data.pin.status === "canceled");
  r = await call("POST", "/api/pins/" + pinB + "/retry", { body: {}, cookie });
  check("recolocar na fila", r.status === 200 && r.data.pin.status === "scheduled");
  r = await call("POST", "/api/pins/" + pinB + "/cancel", { body: {}, cookie });

  console.log("\nFila de publicação (imagem)");
  r = await call("POST", "/api/worker/run", { body: {} });
  check("worker roda sem login", r.status === 200 && r.data.claimed === 1 && r.data.published === 1, r.text);
  r = await call("GET", "/api/pins/" + pinA, { cookie });
  check("pin publicado com id e link da Pinterest", r.data.pin.status === "published" && /pinterest\.com\/pin\//.test(r.data.pin.pinterest_url) && r.data.pin.editable === false);
  check("histórico do pin registrado", r.data.events.some((e) => e.kind === "pin_published"));
  const sent = fake.state.pins[0];
  check("Pinterest recebeu board_id e image_url", sent.board_id === "900100" && sent.media_source.source_type === "image_url" && /^http/.test(sent.media_source.url));
  check("título, descrição, link e alt enviados", sent.title === "Bolo de cenoura com cobertura" && sent.description === "Receita fácil" && sent.link === "https://exemplo.com/bolo" && sent.alt_text === "Bolo");

  r = await call("PATCH", "/api/pins/" + pinA, { body: { title: "Título novo", link: "https://exemplo.com/novo" }, cookie });
  check("editar pin publicado atualiza na Pinterest", r.status === 200 && fake.state.pins[0].title === "Título novo" && fake.state.pins[0].link === "https://exemplo.com/novo");
  r = await call("PATCH", "/api/pins/" + pinA, { body: { scheduled_at: future }, cookie });
  check("data de pin publicado não muda", r.status === 200 && r.data.pin.status === "published");

  console.log("\nFila de publicação (vídeo)");
  r = await call("POST", "/api/pins", { body: { targets: [{ account: accId, board: boardId }], media_id: videoId, cover_media_id: imageId, title: "Vídeo da receita", publish_now: true }, cookie });
  check("criar pin de vídeo com capa", r.status === 201, r.text);
  const pinV = r.data.pins[0].id;
  r = await call("POST", "/api/worker/run", { body: {} });
  check("vídeo publicado", r.data.published === 1, r.text);
  const sentV = fake.state.pins[1];
  check("4 passos: registrar, enviar, confirmar, criar com video_id + capa", fake.state.uploads.length === 1 && sentV.media_source.source_type === "video_id" && /^media-/.test(sentV.media_source.media_id) && /^http/.test(sentV.media_source.cover_image_url));

  console.log("\nFalhas e novas tentativas");
  r = await call("POST", "/api/pins", { body: { targets: [{ account: accId, board: boardId }], media_id: imageId, title: "FALHA400 pin ruim", publish_now: true }, cookie });
  const pinBad = r.data.pins[0].id;
  r = await call("POST", "/api/pins", { body: { targets: [{ account: accId, board: boardId }], media_id: imageId, title: "FALHA429 limite", publish_now: true }, cookie });
  const pinLimit = r.data.pins[0].id;
  r = await call("POST", "/api/pins", { body: { targets: [{ account: accId, board: boardId }], media_id: imageId, title: "FALHA401 token", publish_now: true }, cookie });
  const pin401 = r.data.pins[0].id;
  const refreshBefore = fake.state.refreshCount;
  r = await call("POST", "/api/worker/run", { body: {} });
  check("worker processou os 3", r.data.claimed === 3, r.text);
  r = await call("GET", "/api/pins/" + pinBad, { cookie });
  check("400 -> falhou de vez com mensagem em português", r.data.pin.status === "failed" && /rejeitou/.test(r.data.pin.error_message));
  r = await call("GET", "/api/pins/" + pinLimit, { cookie });
  check("429 -> volta para a fila com nova tentativa marcada", r.data.pin.status === "scheduled" && r.data.pin.attempts === 1 && new Date(r.data.pin.next_attempt_at) > new Date(), JSON.stringify({ status: r.data.pin.status, attempts: r.data.pin.attempts, next: r.data.pin.next_attempt_at, err: r.data.pin.error_message }));
  r = await call("GET", "/api/pins/" + pin401, { cookie });
  check("401 -> renovou o token e publicou", r.data.pin.status === "published" && fake.state.refreshCount === refreshBefore + 1);
  r = await call("POST", "/api/pins/" + pinBad + "/retry", { body: {}, cookie });
  check("tentar de novo um pin com falha", r.status === 200 && r.data.pin.status === "scheduled" && r.data.pin.attempts === 0);
  r = await call("POST", "/api/pins/" + pinBad + "/cancel", { body: {}, cookie });

  console.log("\nLimite diário por conta");
  r = await call("PATCH", "/api/accounts/" + accId, { body: { daily_limit: 3 }, cookie });
  r = await call("GET", "/api/accounts/" + accId, { cookie });
  check("3 publicados nas últimas 24h (limite 3)", r.data.account.published_today === 3, JSON.stringify(r.data.account));
  r = await call("POST", "/api/pins", { body: { targets: [{ account: accId, board: boardId }], media_id: imageId, title: "Quarto pin", publish_now: true }, cookie });
  const pin4 = r.data.pins[0].id;
  r = await call("POST", "/api/worker/run", { body: {} });
  check("acima do limite -> adiado, não publicado", r.data.postponed === 1 && r.data.published === 0, r.text);
  r = await call("GET", "/api/pins/" + pin4, { cookie });
  check("pin adiado continua programado com aviso", r.data.pin.status === "scheduled" && /Limite diário/.test(r.data.pin.error_message || ""));
  r = await call("POST", "/api/pins/" + pin4 + "/cancel", { body: {}, cookie });

  console.log("\nDuplicar, apagar, dashboard e histórico");
  r = await call("POST", "/api/pins/" + pinA + "/duplicate", { body: { scheduled_at: future }, cookie });
  check("duplicar pin publicado como programado", r.status === 201 && r.data.pin.status === "scheduled" && r.data.pin.title === "Título novo");
  const dup = r.data.pin.id;
  r = await call("DELETE", "/api/pins/" + dup, { cookie });
  check("apagar pin programado", r.status === 200);
  r = await call("GET", "/api/pins/" + dup, { cookie });
  check("pin apagado some", r.status === 404);
  const remoteBefore = fake.state.pins.length;
  r = await call("DELETE", "/api/pins/" + pinA + "?pinterest=1", { cookie });
  check("apagar pin publicado também na Pinterest", r.status === 200 && r.data.removed_on_pinterest === true && fake.state.pins.length === remoteBefore - 1);
  r = await call("GET", "/api/dashboard", { cookie });
  check("dashboard com números reais", r.status === 200 && r.data.stats.accounts === 1 && r.data.stats.published_7d === 2 && Array.isArray(r.data.activity));
  r = await call("GET", "/api/activity", { cookie });
  check("histórico lista eventos", r.status === 200 && r.data.total > 5 && r.data.activity[0].message.length > 0);
  r = await call("DELETE", "/api/media/" + imageId, { cookie });
  check("mídia em uso por pin programado não pode ser apagada", r.status === 409);

  console.log("\nSessões e e-mail");
  r = await call("GET", "/api/auth/sessions", { cookie });
  check("lista de aparelhos conectados", r.status === 200 && r.data.sessions.length >= 1 && r.data.sessions.some((s) => s.current));
  r = await call("POST", "/api/auth/login", { body: { email: "maria@exemplo.com", password: "uma frase longa e boa 2026" } });
  const cookie2 = cookieFrom(r.setCookie, "pf_session");
  r = await call("POST", "/api/auth/sessions/revoke-others", { body: {}, cookie });
  r = await call("GET", "/api/auth/me", { cookie: cookie2 });
  check("sair de todos os outros aparelhos", r.status === 401);
  r = await call("POST", "/api/auth/forgot", { body: { email: "maria@exemplo.com" } });
  check("esqueci a senha responde igual sempre", r.status === 200);
  const resetMail = mailer.sent.find((m) => /Redefinir/.test(m.subject));
  const token = resetMail && /\/app\/redefinir\/([A-Za-z0-9_-]+)/.exec(resetMail.text);
  check("e-mail de redefinição com link", Boolean(token));
  r = await call("POST", "/api/auth/reset", { body: { token: token[1], password: "123456" } });
  check("senha fraca na redefinição -> 422", r.status === 422);
  r = await call("POST", "/api/auth/reset", { body: { token: token[1], password: "senha nova e comprida 2027" } });
  check("redefinir senha entra direto", r.status === 200 && Boolean(cookieFrom(r.setCookie, "pf_session")));
  const cookie3 = cookieFrom(r.setCookie, "pf_session");
  r = await call("POST", "/api/auth/reset", { body: { token: token[1], password: "outra senha comprida 2028" } });
  check("link usado não vale de novo", r.status === 400);
  r = await call("GET", "/api/auth/me", { cookie });
  check("sessão antiga caiu após redefinir", r.status === 401);
  r = await call("PATCH", "/api/auth/profile", { body: { timezone: "America/Fortaleza", notify_failures: false }, cookie: cookie3 });
  check("preferências: fuso e notificações", r.status === 200 && r.data.user.timezone === "America/Fortaleza" && r.data.user.notify_failures === false);
  r = await call("PATCH", "/api/auth/profile", { body: { timezone: "Marte/Olympus" }, cookie: cookie3 });
  check("fuso inválido -> 422", r.status === 422);

  console.log("\nCron e manutenção");
  r = await call("GET", "/api/cron/daily");
  check("cron sem segredo -> 401", r.status === 401);
  r = await call("GET", "/api/cron/daily", { headers: { Authorization: "Bearer cron-secreto" } });
  check("cron diário roda manutenção e fila", r.status === 200 && r.data.maintenance && r.data.queue, r.text);
  r = await call("GET", "/api/cron/queue?key=cron-secreto");
  check("fila por agendador externo", r.status === 200 && typeof r.data.claimed === "number");

  console.log("\nDesconectar conta e excluir cadastro");
  r = await call("DELETE", "/api/accounts/" + accId, { cookie: cookie3 });
  check("desconectar conta cancela os programados", r.status === 200 && r.data.canceled === 1, r.text);
  r = await call("GET", "/api/accounts", { cookie: cookie3 });
  check("conta some da lista", r.data.accounts.length === 0);
  r = await call("POST", "/api/auth/delete-account", { body: { password: "senha nova e comprida 2027", confirm: "excluir" }, cookie: cookie3 });
  check("exclusão exige a palavra EXCLUIR", r.status === 422);
  r = await call("POST", "/api/auth/delete-account", { body: { password: "senha nova e comprida 2027", confirm: "EXCLUIR" }, cookie: cookie3 });
  check("conta excluída", r.status === 200);
  const counts = await Promise.all(["users", "pins", "pinterest_accounts", "media", "sessions"].map((t) => dbDirect.count(t, {})));
  check("tudo do usuário foi apagado (LGPD)", counts.every((n) => n === 0), counts.join(","));
  check("arquivos de mídia apagados do disco", fs.readdirSync(process.env.MEDIA_FILE_DIR).length === 0);

  server.close();
  fake.server.close();
  if (dbDirect.close) await dbDirect.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("\n" + passed + " ok, " + failed + " com falha");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("Erro no teste:", e);
  process.exit(1);
});
