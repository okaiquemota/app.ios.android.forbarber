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

    // Avisos no celular da equipe (novo agendamento, remarcação, cancelamento).
    // Ligue só depois de configurar o Firebase e a chave da Apple (ver README):
    // sem o google-services.json, o app Android fecha ao tentar registrar.
    push: false,

    // Endereço onde este sistema está publicado (ex.: https://app.forbarber.com.br/).
    // O app de celular usa para os links que saem dele: e-mails, WhatsApp, compartilhar.
    webUrl: '',

    // Site do produto (repositório movcodebr/site.produto.forbarber)
    siteUrl: 'https://movcodebr.github.io/site.produto.forbarber/',
  };

  /* Descobre a barbearia pelo endereço.
     No Vercel, /greybarber/... é reescrito para /app/... (vercel.json), mas o
     navegador continua vendo /greybarber/: é dali que sai o "slug".
     Acessando /app/ direto (GitHub Pages, arquivo local) vale ?b=slug, e sem
     nada abre a demonstração. */
  // Dentro do app de iPhone/Android (Capacitor) não há endereço por barbearia:
  // a barbearia vem de ?b=nome e fica guardada no aparelho.
  const cap = window.Capacitor;
  const native = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  const store = () => (native ? window.localStorage : window.sessionStorage);

  const script = document.currentScript;
  const appRoot = new URL('../../', script ? script.src : location.href);
  const segment = decodeURIComponent(appRoot.pathname.replace(/\/$/, '').split('/').pop() || '').toLowerCase();
  let slug = segment && segment !== 'app' ? segment : null;
  if (!slug) {
    const fromQuery = new URLSearchParams(location.search).get('b');
    try {
      if (fromQuery) store().setItem('forbarber:slug', fromQuery.toLowerCase());
      slug = (fromQuery || store().getItem('forbarber:slug') || '').toLowerCase() || null;
    } catch (e) {
      slug = fromQuery ? fromQuery.toLowerCase() : null;
    }
  }

  config.slug = slug || 'demo';
  config.appRoot = appRoot.href;
  config.native = native;
  config.platform = native ? cap.getPlatform() : 'web';
  // Endereço público (o que vai em e-mail e WhatsApp) e endereço de outra barbearia
  const web = (config.webUrl || '').replace(/\/?$/, '/');
  config.webBase = native ? web : new URL('../', appRoot).href;
  config.publicRoot = native && config.webUrl ? `${web}${config.slug}/` : appRoot.href;
  config.shopUrl = (s, path = '') => (native
    ? `${appRoot.href}${path}${path.includes('?') ? '&' : '?'}b=${encodeURIComponent(s)}`
    : `${config.webBase}${s}/${path}`);
  config.cloud = !!(config.supabaseUrl && config.supabaseAnonKey);
  config.mode = config.cloud && config.slug !== 'demo' ? 'cloud' : 'local';

  window.FORBARBER = config;
})();
