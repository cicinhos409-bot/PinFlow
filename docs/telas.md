# Mapa de telas da plataforma

O que cada tela faz, o que vai dentro dela e por que ela precisa existir.
Ordem de construção: **Fase 1** (lançar), **Fase 2** (cobrar e crescer), **Fase 3** (equipe e escala).

Regra que vale para todas: nada de dado falso. Se não há informação, a tela mostra o estado vazio com o próximo passo.

---

## A. Fora do login (público)

| # | Tela | Endereço | Fase |
|---|------|----------|------|
| 1 | Landing | `/` | 1 ✅ |
| 2 | Termos de Uso | `/termos` | 1 ✅ (rascunho) |
| 3 | Política de Privacidade | `/privacidade` | 1 ✅ (rascunho) |
| 4 | Login | `/app/login` | 1 ✅ |
| 5 | Criar conta | `/app/cadastro` | 1 ✅ |
| 6 | Esqueci a senha | `/app/esqueci-senha` | 1 |
| 7 | Redefinir senha | `/app/redefinir/<token>` | 1 |
| 8 | Confirmar e-mail | `/app/confirmar/<token>` | 1 |

**1. Landing.** Promessa, como funciona, segurança, planos, FAQ, lista de espera. Existe para transformar visitante em cadastro.

**2–3. Termos e Privacidade.** Obrigatórios para a Pinterest aprovar o app (ela pede o link da política) e pela LGPD. Precisam de revisão de advogado antes de abrir o cadastro ao público.

**4–5. Login e Criar conta.** Porta de entrada. Já feitas.

**6–7. Esqueci / Redefinir senha.** Sem isso, quem perde a senha perde a conta e vira ticket de suporte. Precisa de envio de e-mail (Resend, Postmark ou similar).

**8. Confirmar e-mail.** Garante que o e-mail é da pessoa (evita contas falsas e e-mails errados) e libera recuperar senha com segurança.

---

## B. Dentro da plataforma (barra lateral)

| # | Tela | Endereço | Fase |
|---|------|----------|------|
| 9 | Dashboard | `/app/dashboard/<id>` | 1 ✅ |
| 10 | Contas do Pinterest | `/app/contas/<id>` | 1 ✅ (vazia) |
| 11 | Detalhe da conta | `/app/contas/<id>/<conta>` | 1 |
| 12 | Novo pin (agendar) | `/app/pins/<id>/novo` | 1 |
| 13 | Pins programados (fila) | `/app/pins/<id>` | 1 ✅ (vazia) |
| 14 | Detalhe do pin | `/app/pins/<id>/<pin>` | 1 |
| 15 | Histórico / Atividade | `/app/historico/<id>` | 1 |
| 16 | Configurações | `/app/configuracoes/<id>` | 1 ✅ |
| 17 | Biblioteca de mídia | `/app/midia/<id>` | 2 |
| 18 | Métricas | `/app/metricas/<id>` | 2 |
| 19 | Plano e cobrança | `/app/plano/<id>` | 2 |
| 20 | Equipe | `/app/equipe/<id>` | 3 |

**9. Dashboard.** Resumo: contas conectadas, pins na fila, publicados e falhas (7 dias), próximos pins, passos iniciais. Existe para a pessoa saber em 5 segundos se está tudo bem e qual é o próximo passo.

**10. Contas do Pinterest.** Lista das contas conectadas com status (ativa, token expirado, desconectada), botão "Conectar conta" (abre o login oficial do Pinterest) e "Reconectar". É o coração do multi-contas: sem conta conectada, nada funciona. Mostra também o aviso de acesso Trial vs Standard da Pinterest.

**11. Detalhe da conta.** Pastas (boards) daquela conta, sincronizar pastas, criar pasta, limites de publicação por dia, desconectar. Existe porque cada conta tem suas próprias pastas e limites, e a pessoa precisa gerenciar uma sem mexer nas outras.

**12. Novo pin.** O formulário principal: imagem ou vídeo (vídeo exige capa), título, descrição, link de destino, texto alternativo, conta(s) e pasta(s), data e hora (fuso da pessoa), opção "publicar agora". Permite escolher várias contas de uma vez e cria um pin por conta. Existe porque é o motivo de a plataforma existir.

**13. Pins programados.** Fila em lista e em calendário, filtros por conta, pasta e status (agendado, publicando, publicado, falhou, cancelado). Ações: editar, reprogramar, duplicar, cancelar. Existe para a pessoa enxergar e controlar o que vai sair e quando.

**14. Detalhe do pin.** Prévia, dados enviados, histórico de tentativas, erro retornado pela Pinterest em português claro, link do pin publicado, botão "tentar de novo". Existe porque quando algo falha a pessoa precisa entender o motivo sem abrir suporte.

**15. Histórico / Atividade.** Tudo que aconteceu: publicado, falhou, conta reconectada, limite atingido. Existe para auditoria e confiança: a pessoa vê que a plataforma fez o que prometeu.

**16. Configurações.** Perfil (nome, e-mail), senha, sessões ativas ("sair de todos os aparelhos"), fuso horário, notificações por e-mail (falhas, token expirando), excluir conta (LGPD). Existe porque são as coisas que a pessoa precisa controlar sobre si mesma.

**17. Biblioteca de mídia.** Imagens e vídeos já enviados, para reutilizar em outros pins e contas sem subir de novo. Existe porque quem gerencia várias contas repete muita mídia; economiza tempo e armazenamento.

**18. Métricas.** Por conta e por pin: impressões, cliques, salvamentos (vêm da API de analytics da Pinterest, que exige conta Business). Existe para mostrar resultado e justificar a assinatura.

**19. Plano e cobrança.** Plano atual, limites usados (contas, pins/mês), trocar plano, faturas, cartão. Existe para a plataforma virar negócio.

**20. Equipe.** Convidar pessoas para o mesmo espaço (social media, cliente) com papéis (admin, editor, leitura). Existe porque agências e times gerenciam contas de outras pessoas. Fica para a fase 3 porque muda a estrutura do banco (espaço de trabalho em vez de usuário).

---

## C. Administração interna (só você)

| # | Tela | Endereço | Fase |
|---|------|----------|------|
| 21 | Painel admin: usuários | `/admin/usuarios` | 2 |
| 22 | Painel admin: saúde da fila | `/admin/fila` | 2 |
| 23 | Painel admin: antispam e limites | `/admin/limites` | 2 |

**Por que existem:** na Pinterest, as punições de spam caem sobre o **app inteiro** (3 strikes = app banido). Um usuário mal-intencionado derruba todos os outros. Você precisa ver quem está publicando demais, pausar contas, ajustar limites e acompanhar se o robô de publicação está travado antes que vire reclamação.

---

## D. Telas de apoio (pequenas, mas obrigatórias)

- **404** e **erro geral**: com o visual da plataforma e caminho de volta.
- **Manutenção**: para quando o banco ou a Pinterest estiverem fora.
- **Retorno do Pinterest** (`/api/pinterest/callback`): não é tela, é a página de "conectando..." que recebe a autorização e volta para Contas.
- **E-mails** (não são telas, mas fazem parte da experiência): confirmar e-mail, redefinir senha, token do Pinterest expirando, pin falhou, resumo semanal.

---

## Resumo

| Fase | Telas | Resultado |
|------|-------|-----------|
| 1 | 1–16 (+ apoio) | Alguém consegue criar conta, conectar o Pinterest, agendar e ver o resultado |
| 2 | 17–19, 21–23 | Dá para cobrar, acompanhar resultado e proteger o app |
| 3 | 20 | Agências e times |

Já feitas: 1, 2, 3 (rascunhos), 4, 5, 9, 10, 13 (vazias), 16.
Próxima: conexão com o Pinterest (10 e 11), que depende do banco de dados.
