# Plataforma de Pinterest (SaaS multi-usuário e multi-contas)

> Documento base do projeto. Começamos pela **promessa** e pela **landing page**. O restante (produto, backend, planos) é preenchido nas próximas etapas.

---

## 1. Visão

Uma plataforma **100% focada em Pinterest** onde cada usuário cria sua conta, conecta **várias contas do Pinterest** pelo login oficial e agenda e publica pins (imagem e vídeo) em todas elas, de um painel só.

- Funciona pela **API oficial do Pinterest (v5)** com login OAuth. Nada de pedir senha, nada de robô de navegador.
- Um usuário pode ter várias contas conectadas. Cada conta tem seu próprio token, boards e fila.

---

## 2. Público-alvo

- Afiliados (Shopee, TikTok Shop, produtos digitais) que querem tráfego do Pinterest
- Criadores de conteúdo e donos de lojas que gerenciam mais de uma conta
- Agências e social media que postam para vários clientes

**Dor principal:** postar no Pinterest manualmente, conta por conta, toma muito tempo, e manter constância é difícil.

---

## 3. A promessa

**Promessa principal (rascunho):**
> Conecte suas contas do Pinterest, programe seus pins uma vez e deixe a plataforma publicar por você, com segurança e sem dar sua senha.

**Variações de headline para testar:**
1. "Seus pins publicados no piloto automático. Em todas as suas contas do Pinterest."
2. "Programe um mês de pins em minutos."
3. "Várias contas do Pinterest. Um painel. Zero trabalho manual."

**Subtítulo:**
> Agende imagens e vídeos, organize por board e acompanhe tudo em um só lugar, usando a conexão oficial do Pinterest.

**Os 3 pilares da promessa:**
| Pilar | Mensagem |
|---|---|
| **Tempo** | Programe em lote e pare de postar pin por pin |
| **Escala** | Várias contas do Pinterest no mesmo painel |
| **Segurança** | Conexão oficial: você autoriza no Pinterest e nunca compartilha senha |

---

## 4. O que NÃO prometer

Pontos importantes para a landing e para a aprovação do app no Pinterest:

- Não prometer viralizar, ranquear ou "furar o algoritmo"
- Não prometer volume absurdo de pins ou "postar sem limite"
- Não sugerir que burla regras de spam do Pinterest (o app inteiro pode receber strikes, e 3 strikes banem o app)
- Não usar a palavra "Pinterest" no **nome do app** registrado no portal de desenvolvedores (regra deles). Vale evitar também no nome da marca para não parecer produto oficial
- Não se apresentar como parceiro ou produto oficial do Pinterest
- Não falar de "robô" ou "automação de navegador". Falar em **agendamento** e **publicação**

---

## 5. Estrutura da landing page

### 5.1 Hero
- Headline + subtítulo (ver seção 3)
- Botão principal: **"Começar grátis"** (ou "Conectar minha conta")
- Botão secundário: **"Ver como funciona"**
- Visual: mockup do painel com calendário de pins e contas conectadas

### 5.2 Faixa de confiança
- "Conexão oficial via login do Pinterest"
- "Sem compartilhar senha"
- "Você controla quais contas conectar e pode desconectar quando quiser"

### 5.3 O problema
Texto curto sobre a dor: postar manualmente, perder constância, gerenciar várias contas em abas diferentes.

### 5.4 Como funciona (3 passos)
1. **Conecte** suas contas do Pinterest com um clique
2. **Programe** imagens e vídeos, escolhendo conta, board e horário
3. **Acompanhe** o que foi publicado e o desempenho

### 5.5 Recursos
- Várias contas do Pinterest em um painel
- Agendamento de pins com imagem e vídeo (com capa)
- Escolha de board (e seção) por pin
- Fila e calendário visual
- Postagem em lote
- Intervalos inteligentes entre pins (proteção contra spam)
- Métricas básicas dos pins

### 5.6 Segurança e transparência
- Login oficial (OAuth), tokens guardados com criptografia
- Respeito às regras e limites do Pinterest
- Link para Política de Privacidade e Termos de Uso

### 5.7 Planos
Estrutura sugerida (valores a definir):
| Plano | Foco | Limites a definir |
|---|---|---|
| Grátis / Teste | Experimentar | 1 conta, poucos pins por semana |
| Pro | Criador / afiliado | Algumas contas, mais pins |
| Agência | Vários clientes | Muitas contas, equipe |

### 5.8 FAQ
- Preciso dar minha senha? (Não)
- Funciona com conta pessoal? (Dar preferência a conta **Business**; ver observação técnica abaixo)
- Posso conectar várias contas? (Sim)
- Quantos pins posso postar por dia? (Há limites para proteger sua conta)
- Posso desconectar a qualquer momento? (Sim)
- A plataforma é oficial do Pinterest? (Não, usa a API oficial)

### 5.9 CTA final
"Pare de postar pin por pin. Conecte sua primeira conta agora."

### 5.10 Rodapé
Política de Privacidade, Termos de Uso, contato, aviso: "Pinterest é marca registrada de seus respectivos donos. Esta plataforma não é afiliada ao Pinterest."

---

## 6. Direção visual

- Visual limpo e moderno, que remeta a inspiração e mural de imagens
- **Tema escuro: preto puro e âmbar**, com o mesmo âmbar do Umbra Copywriter. Diferente do vermelho do Pinterest, para não parecer produto oficial

| Papel | Cor | Código |
|---|---|---|
| Fundo da página | Preto puro | `#000000` |
| Cartões e seções | Preto suave | `#0a0a0a` / `#141414` |
| Linhas e bordas | Grafite | `#222226` |
| Texto | Branco | `#ffffff` |
| Texto secundário | Cinza | `#a1a1aa` |
| Âmbar principal (botões, selos, ícones) | Âmbar | `#fe9a00` |
| Âmbar ao passar o mouse | Âmbar claro | `#ffb21f` |
| Destaque em gradiente (títulos) | Amarelo → laranja | `#ffc820` → `#ff7b00` |

O âmbar foi medido em uma captura de tela do Umbra Copywriter, e não no código do site. Se o código original tiver outro valor, é só trocar `--amber` no topo de `css/style.css` (`:root`).
- Mockups reais do painel (calendário, grade de pins, seletor de contas)
- Mobile primeiro: boa parte do público vai abrir pelo celular

---

## 7. Requisitos que impactam a landing

- **Política de Privacidade** e **Termos de Uso** publicados (esperados na aprovação do app e na autorização dos clientes)
- Fluxo de login e conexão visível e claro, pois será mostrado no **vídeo de aprovação do acesso Standard**
- Domínio próprio com HTTPS

---

## 8. Base técnica (resumo para as próximas etapas)

- Pinterest API v5, login OAuth 2, um app único para todos os clientes
- Scopes: `boards:read`, `boards:write`, `pins:read`, `pins:write`
- Acesso **Trial** (só o dono vê os pins) até aprovação do **Standard** (necessário para postar de verdade para clientes)
- Vídeo: registrar upload, enviar arquivo, conferir status, criar pin com capa obrigatória
- Agendamento feito pela própria plataforma (fila + worker), já que a documentação não lista endpoint de agendamento
- Apps registrados a partir de 14/09/2026 podem receber erro 403 em contas não Business: exigir ou recomendar conta Business
- Limites por conta, intervalos, bloqueio de conteúdo duplicado e rate limit desde o início

---

## 9. Roadmap

1. **Promessa e landing** (este documento)
2. Registrar o app no portal de desenvolvedores e pedir Trial
3. Núcleo: cadastro, conectar conta Pinterest, listar boards, criar pin (imagem e vídeo)
4. Gravar o vídeo de aprovação e pedir Standard
5. Fila, calendário, postagem em lote, métricas
6. Planos, cobrança e painel de administração

---

## 10. Decisões em aberto

- [ ] Nome da plataforma (sem a palavra "Pinterest")
- [ ] Público principal: afiliados, criadores ou agências?
- [ ] Planos e preços
- [ ] Integração com o ecossistema atual (Umbra Poster, UmbraBot) ou marca separada?
- [ ] Domínio
- [x] Cores: âmbar e preto (definido). Falta definir o logotipo final
- [ ] Teste grátis: quantos dias ou quais limites?
