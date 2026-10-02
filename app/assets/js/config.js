/* ==========================================================================
   CONFIGURAÇÃO DO FORBARBER — o único arquivo para editar ao implantar.
   Sem supabaseUrl o sistema roda só em modo demonstração (dados no navegador).
   ========================================================================== */
(function () {
  'use strict';

  const config = {
    productName: 'ForBarber',

    // Projeto Supabase (Project Settings > API). A chave "anon" é pública por design.
    supabaseUrl: '',
    supabaseAnonKey: '',

    // Fuso usado para "hoje" e "agora" nas regras de agendamento
    timezone: 'America/Sao_Paulo',

    trialDays: 14,

    // Planos de assinatura. checkoutUrl = link de pagamento recorrente (ex.: Mercado Pago).
    // Sem link, o botão "Assinar" abre o WhatsApp de vendas.
    plans: [
      { id: 'solo', name: 'Solo', price: 49.9, barbers: 1, checkoutUrl: '' },
      { id: 'equipe', name: 'Equipe', price: 89.9, barbers: 4, checkoutUrl: '' },
      { id: 'premium', name: 'Premium', price: 149.9, barbers: 99, checkoutUrl: '' },
    ],

    salesWhatsapp: '5516982157266',
    salesUrl: 'https://movcode.com.br/sistema-para-barbearia',
  };

  /* Descobre a barbearia pelo endereço.
     No Vercel, /greybarber/... é reescrito para /app/... (vercel.json), mas o
     navegador continua vendo /greybarber/: é dali que sai o "slug".
     Acessando /app/ direto (GitHub Pages, arquivo local) vale ?b=slug, e sem
     nada abre a demonstração. */
  const script = document.currentScript;
  const appRoot = new URL('../../', script ? script.src : location.href);
  const segment = decodeURIComponent(appRoot.pathname.replace(/\/$/, '').split('/').pop() || '').toLowerCase();
  let slug = segment && segment !== 'app' ? segment : null;
  if (!slug) {
    const fromQuery = new URLSearchParams(location.search).get('b');
    try {
      if (fromQuery) window.sessionStorage.setItem('forbarber:slug', fromQuery.toLowerCase());
      slug = (fromQuery || window.sessionStorage.getItem('forbarber:slug') || '').toLowerCase() || null;
    } catch (e) {
      slug = fromQuery ? fromQuery.toLowerCase() : null;
    }
  }

  config.slug = slug || 'demo';
  config.appRoot = appRoot.href;
  config.cloud = !!(config.supabaseUrl && config.supabaseAnonKey);
  config.mode = config.cloud && config.slug !== 'demo' ? 'cloud' : 'local';

  window.FORBARBER = config;
})();
