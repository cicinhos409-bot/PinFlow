"use strict";

/**
 * Testes do sistema de contas (cadastro, login, sair, sessão, limites).
 * Usa um arquivo temporário como banco e um servidor local numa porta livre.
 *
 *   npm run test:auth
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pinflow-auth-"));
process.env.AUTH_STORE = "file";
process.env.AUTH_FILE_PATH = path.join(tmp, "db.json");
process.env.SESSION_SECRET = "segredo-de-teste-com-mais-de-16-caracteres";
delete process.env.VERCEL;

const { createServer } = require("./dev-server");

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
  if (o.body !== undefined && !o.noContentType) headers["Content-Type"] = o.contentType || "application/json";
  if (o.cookie) headers.Cookie = o.cookie;
  const res = await fetch(base + url, {
    method,
    headers,
    body: o.body !== undefined ? (typeof o.body === "string" ? o.body : JSON.stringify(o.body)) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (e) {
    /* resposta sem JSON */
  }
  const setCookie = res.headers.get("set-cookie");
  const cookie = setCookie ? setCookie.split(";")[0] : null;
  return { status: res.status, data, setCookie, cookie, text };
}

const GOOD_PASSWORD = "uma frase longa e boa 2026";

function newUser(email, extra) {
  return Object.assign({ email, password: GOOD_PASSWORD, acceptTerms: true, name: "Teste" }, extra || {});
}

async function main() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = "http://127.0.0.1:" + server.address().port;
  console.log("Servidor de teste em " + base + "\n");

  console.log("Proteções básicas");
  let r = await call("GET", "/api/auth/me");
  check("me sem sessão -> 401", r.status === 401 && r.data && r.data.error.code === "unauthenticated");

  r = await call("POST", "/api/auth/register", { body: "email=a", contentType: "application/x-www-form-urlencoded" });
  check("formulário comum (não JSON) -> 415", r.status === 415);

  r = await call("POST", "/api/auth/register", { body: newUser("x@exemplo.com"), headers: { Origin: "https://site-malicioso.example" } });
  check("origem de outro site -> 403", r.status === 403);

  r = await call("GET", "/api/auth/register");
  check("GET em rota de cadastro -> 405", r.status === 405);

  r = await call("POST", "/api/auth/register", { body: "{ isso não é json" });
  check("JSON quebrado -> 400", r.status === 400);

  console.log("\nCadastro");
  r = await call("POST", "/api/auth/register", { body: newUser("Teste@Exemplo.com", { password: "123456" }) });
  check("senha curta -> 422", r.status === 422 && r.data.error.field === "password");

  r = await call("POST", "/api/auth/register", { body: newUser("Teste@Exemplo.com", { password: "senha123" }) });
  check("senha comum -> 422", r.status === 422 && r.data.error.code === "weak_password");

  r = await call("POST", "/api/auth/register", { body: newUser("Teste@Exemplo.com", { password: "x".repeat(129) }) });
  check("senha acima de 128 caracteres -> 422", r.status === 422);

  r = await call("POST", "/api/auth/register", { body: newUser("isso-nao-e-email") });
  check("e-mail inválido -> 422", r.status === 422 && r.data.error.field === "email");

  r = await call("POST", "/api/auth/register", { body: newUser("teste@exemplo.com", { acceptTerms: false }) });
  check("sem aceitar os termos -> 422", r.status === 422 && r.data.error.field === "acceptTerms");

  r = await call("POST", "/api/auth/register", { body: newUser("robo@exemplo.com", { website: "http://spam" }) });
  check("campo isca preenchido -> 400", r.status === 400);

  r = await call("POST", "/api/auth/register", { body: newUser("Teste@Exemplo.com") });
  check("cadastro válido -> 201", r.status === 201 && r.data.ok === true, JSON.stringify(r.data));
  check("e-mail salvo em minúsculas", r.data && r.data.user && r.data.user.email === "teste@exemplo.com");
  check("resposta não traz senha nem hash", r.text.indexOf("password") === -1 && r.text.indexOf("scrypt") === -1);
  check("cookie de sessão é HttpOnly + SameSite=Lax", /HttpOnly/i.test(r.setCookie || "") && /SameSite=Lax/i.test(r.setCookie || ""));
  check("sem Secure em http local", !/;\s*Secure/i.test(r.setCookie || ""));
  const cookieA = r.cookie;

  r = await call("POST", "/api/auth/register", { body: newUser("TESTE@exemplo.com") });
  check("e-mail repetido (maiúsculas diferentes) -> 409", r.status === 409 && r.data.error.code === "email_taken");

  console.log("\nSessão e sair");
  r = await call("GET", "/api/auth/me", { cookie: cookieA });
  check("me com sessão -> 200 e dados corretos", r.status === 200 && r.data.user.email === "teste@exemplo.com" && r.data.user.name === "Teste");

  r = await call("GET", "/api/auth/me", { cookie: "pf_session=token-inventado-que-nao-existe-xxxxxxxx" });
  check("cookie inventado -> 401", r.status === 401);

  r = await call("POST", "/api/auth/logout", { body: {}, cookie: cookieA });
  check("sair -> 200 e limpa o cookie", r.status === 200 && /Max-Age=0/i.test(r.setCookie || ""));

  r = await call("GET", "/api/auth/me", { cookie: cookieA });
  check("cookie antigo não vale mais após sair -> 401", r.status === 401);

  console.log("\nEntrar");
  r = await call("POST", "/api/auth/login", { body: { email: "teste@exemplo.com", password: "senha errada de proposito" } });
  const wrongMessage = r.data && r.data.error && r.data.error.message;
  check("senha errada -> 401", r.status === 401 && r.data.error.code === "invalid_credentials");

  r = await call("POST", "/api/auth/login", { body: { email: "naoexiste@exemplo.com", password: "qualquer coisa aqui" } });
  check("e-mail inexistente dá a MESMA resposta (não revela quem tem conta)", r.status === 401 && r.data.error.message === wrongMessage);

  r = await call("POST", "/api/auth/login", { body: { email: "", password: "" } });
  check("campos vazios -> 400", r.status === 400);

  r = await call("POST", "/api/auth/login", { body: { email: " TESTE@exemplo.com ", password: GOOD_PASSWORD } });
  check("entrar com a senha certa -> 200 (e-mail com espaços/maiúsculas)", r.status === 200 && r.data.ok === true && !!r.cookie);
  const cookieB = r.cookie;

  r = await call("GET", "/api/auth/me", { cookie: cookieB });
  check("sessão nova funciona", r.status === 200);

  console.log("\nBloqueio por tentativas erradas");
  r = await call("POST", "/api/auth/register", { body: newUser("bloqueio@exemplo.com") });
  check("cria conta para o teste de bloqueio", r.status === 201);
  let last = null;
  for (let i = 0; i < 5; i++) {
    last = await call("POST", "/api/auth/login", { body: { email: "bloqueio@exemplo.com", password: "errada errada " + i } });
  }
  check("5 tentativas erradas ainda respondem 401", last.status === 401);
  r = await call("POST", "/api/auth/login", { body: { email: "bloqueio@exemplo.com", password: GOOD_PASSWORD } });
  check("6ª tentativa é bloqueada (429) mesmo com a senha certa", r.status === 429 && r.data.error.code === "rate_limited");

  console.log("\nLimite de cadastros por IP");
  let blocked = null;
  for (let i = 0; i < 12; i++) {
    r = await call("POST", "/api/auth/register", { body: newUser("lote" + i + "@exemplo.com") });
    if (r.status === 429) {
      blocked = i;
      break;
    }
  }
  check("passou do limite -> 429", blocked !== null, "nenhum bloqueio em 12 tentativas");

  console.log("\nO que ficou guardado");
  const raw = fs.readFileSync(process.env.AUTH_FILE_PATH, "utf8");
  check("senha em texto aberto não aparece no banco", raw.indexOf(GOOD_PASSWORD) === -1);
  check("senha guardada como hash scrypt", raw.indexOf('"password_hash": "scrypt$') !== -1);
  const tokenA = decodeURIComponent((cookieA || "").split("=")[1] || "");
  check("o token da sessão em si não é guardado (só o hash)", tokenA.length > 20 && raw.indexOf(tokenA) === -1);
  check("IP puro não é guardado", raw.indexOf("127.0.0.1") === -1);

  console.log("\nBanco não configurado");
  process.env.AUTH_STORE = "";
  r = await call("GET", "/api/auth/me");
  check("sem banco -> 503 com mensagem clara", r.status === 503 && r.data.error.code === "not_configured");
  r = await call("POST", "/api/auth/logout", { body: {}, cookie: cookieB });
  check("sair continua funcionando sem banco (limpa o cookie)", r.status === 200 && /Max-Age=0/i.test(r.setCookie || ""));
  process.env.AUTH_STORE = "file";
  process.env.VERCEL = "1";
  r = await call("GET", "/api/auth/me");
  check("armazenamento em arquivo é recusado quando roda na Vercel", r.status === 503);
  delete process.env.VERCEL;

  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log("\n" + passed + " ok, " + failed + " com falha");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("Erro no teste:", e);
  process.exit(1);
});
