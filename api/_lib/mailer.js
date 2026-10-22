"use strict";

/**
 * Envio de e-mails (redefinir senha, confirmar e-mail, avisos).
 * Usa a API HTTP do Resend quando RESEND_API_KEY e MAIL_FROM estão definidos.
 * Sem configuração: lança MAIL_NOT_CONFIGURED (as telas avisam de forma honesta).
 * Nos testes (MAIL_STORE=memory) os e-mails ficam em memória, sem envio.
 */

const sent = []; // só para testes

function isConfigured() {
  return Boolean((process.env.RESEND_API_KEY && process.env.MAIL_FROM) || process.env.MAIL_STORE === "memory");
}

function brand() {
  return process.env.BRAND_NAME || "Pinflow";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function layout(title, lines, button) {
  const body = lines.map((l) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:#111">${escapeHtml(l)}</p>`).join("");
  const btn = button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:#fe9a00;color:#000;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px">${escapeHtml(button.label)}</a></p>
       <p style="font-size:13px;color:#666">Se o botão não funcionar, copie este endereço: ${escapeHtml(button.url)}</p>`
    : "";
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f4f5;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px">
    <p style="margin:0 0 20px;font-weight:800;font-size:20px;color:#000">${escapeHtml(brand())}</p>
    <h1 style="margin:0 0 18px;font-size:22px;color:#000">${escapeHtml(title)}</h1>
    ${body}${btn}
    <p style="margin-top:28px;font-size:12px;color:#888">Você recebeu este e-mail porque tem uma conta na plataforma ${escapeHtml(brand())}. Esta plataforma não é afiliada à Pinterest.</p>
  </div></body></html>`;
}

async function send({ to, subject, title, lines, button }) {
  if (!isConfigured()) {
    const e = new Error("Envio de e-mail não configurado");
    e.code = "MAIL_NOT_CONFIGURED";
    throw e;
  }
  const text = lines.join("\n\n") + (button ? "\n\n" + button.label + ": " + button.url : "");
  const html = layout(title, lines, button);

  if (process.env.MAIL_STORE === "memory") {
    sent.push({ to, subject, text, html, at: new Date().toISOString() });
    return { id: "memory-" + sent.length };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text, html }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const e = new Error("Falha ao enviar e-mail: " + res.status + " " + detail.slice(0, 200));
    e.code = "MAIL_FAILED";
    throw e;
  }
  return res.json();
}

module.exports = { send, isConfigured, sent, brand };
