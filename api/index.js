"use strict";

/**
 * Única função da API na Vercel. Todas as rotas /api/* chegam aqui
 * (vercel.json reescreve /api/:path* -> /api/index?__path=:path*) e o roteador
 * em _lib/router.js decide o que fazer. Motivo: o plano Hobby da Vercel permite
 * no máximo 12 funções por deploy.
 */

const router = require("./_lib/router");

require("./_lib/routes/auth");
require("./_lib/routes/accounts");
require("./_lib/routes/media");
require("./_lib/routes/pins");
require("./_lib/routes/misc");

module.exports = (req, res) => router.dispatch(req, res);
