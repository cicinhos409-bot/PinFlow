/**
 * Configurações da landing page.
 * Troque aqui o que muda de um ambiente para outro.
 * (Não coloque nenhum segredo neste arquivo: ele é público no navegador.)
 */
window.APP_CONFIG = {
  // Nome provisório da marca. Aparece em todos os elementos com data-brand.
  // Quando o nome final for decidido, troque aqui e também o <title> do index.html.
  BRAND_NAME: "Pinflow",

  // Endereço que recebe o cadastro da lista de espera (POST com JSON).
  // Deixe vazio até o banco de dados e a rota existirem (ver docs/banco-de-dados/01-landing-lista-de-espera.md).
  // Exemplo quando existir: "/api/waitlist"
  WAITLIST_ENDPOINT: ""
};
