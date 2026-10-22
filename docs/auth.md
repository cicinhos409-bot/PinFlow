# Contas: cadastro, entrar e sair

## Telas
`/cadastro`, `/entrar`, `/painel` (só para quem está conectado). Lógica em `js/auth.js`.

## Endpoints (`/api/auth/*`, todos JSON)
| Rota | Método | O que faz |
|---|---|---|
| `register` | POST | Cria conta e já entra. 201, 409 (e-mail já usado), 422 (dados), 429 (limite) |
| `login` | POST | Entra. 401 genérico "E-mail ou senha incorretos.", 429 após muitas falhas |
| `logout` | POST | Encerra a sessão e apaga o cookie |
| `me` | GET | Dados do usuário conectado ou 401 |

Sem banco configurado, todas respondem 503 `not_configured` (mensagem honesta, nada falso).

## Decisões de segurança
- Senha: scrypt (N=32768, r=8, p=1), sal único, parâmetros dentro do hash. Nunca guardada em texto.
- Sessão: token aleatório de 32 bytes; no banco só o SHA-256. Cookie `pf_session` HttpOnly, SameSite=Lax, 30 dias, Secure em https.
- CSRF: exige mesma origem e `Content-Type: application/json`.
- Erro de login igual para e-mail inexistente e senha errada, com tempo equalizado.
- Limites: login 5 falhas por e-mail+IP e 20 por IP em 15 min; cadastro 10 por IP por hora.
- IP guardado só como HMAC (usa `SESSION_SECRET`). Campo isca `website` contra robôs.
- Trade-off: o cadastro avisa "e-mail já em uso" (409).

## Ainda não feito
Recuperar senha e confirmar e-mail (precisam de envio de e-mail); autenticação em dois fatores.

## Ligar um banco de verdade
`api/_lib/db.js` escolhe o adaptador. Criar `db-postgres.js` (usando `DATABASE_URL`) com a mesma interface de `db-file.js`: `findUserByEmail`, `findUserById`, `createUser` (erro `EMAIL_TAKEN`), `touchLogin`, `createSession`, `findSessionByTokenHash`, `revokeSession`, `recordAttempt`, `countAttempts`. Tabelas: ver `docs/banco-de-dados/02-usuarios-e-autenticacao.md`.

## Testes
`npm run test:auth` (37 verificações) e `npm run dev:local` (site + API local com banco em arquivo, só para testes; é recusado na Vercel).
