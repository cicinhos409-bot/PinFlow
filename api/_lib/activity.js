"use strict";

const { randomId } = require("./crypto");

/**
 * Registro de atividade: o que aconteceu, em português claro, para a pessoa ver no Histórico.
 * kind (tipo) é um código estável; message é o texto exibido.
 */
async function log(db, entry) {
  try {
    return await db.insert("activity", {
      id: randomId(),
      user_id: entry.user_id,
      account_id: entry.account_id || null,
      pin_id: entry.pin_id || null,
      kind: entry.kind,
      message: entry.message,
      data: entry.data || null,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[activity] não registrou:", e && e.message);
    return null;
  }
}

module.exports = { log };
