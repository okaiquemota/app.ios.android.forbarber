/* ==========================================================================
   APP INSTALÁVEL (window.App.pwa)
   Cada barbearia vira um app com o próprio nome e logo: o manifesto é
   montado aqui com os dados da barbearia, o service worker guarda as telas
   para abrir rápido (e sem internet) e os botões [data-install] instalam.
   Aberto pelo ícone, quem é da equipe cai direto no painel.
   ========================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const CFG = window.FORBARBER;
  const BG = '#111827';

  // Dentro do app de iPhone/Android já é app: sem manifesto, cache nem botão de instalar
  if (CFG.native) {
    App.pwa = { available: () => false, install() {}, standalone: () => true, isIOS: false, refreshButtons() {} };
    return;
  }

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  let deferred = null;

  /** Logo da barbearia sobre fundo escuro, no tamanho pedido (PNG em data URL) */
  function drawIcon(src, size) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const x = c.getContext('2d');
        x.fillStyle = BG;
        x.fillRect(0, 0, size, size);
        const box = size * 0.7;
        const k = Math.min(box / img.naturalWidth, box / img.naturalHeight);
        const w = img.naturalWidth * k;
        const h = img.naturalHeight * k;
        x.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        try { resolve(c.toDataURL('image/png')); } catch (e) { reject(e); }
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  function setHead(selector, create, attrs) {
    let el = document.head.querySelector(selector);
    if (!el) {
      el = document.createElement(create);
      document.head.appendChild(el);
    }
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }

  let lastKey = '';
  async function updateManifest() {
    const s = App.db.settings();
    const key = `${s.name}|${s.logo || ''}`;
    if (key === lastKey) return;
    lastKey = key;
    const root = CFG.appRoot;
    const fallback = (n) => new URL(`assets/img/icon-${n}.png`, root).href;
    let icons = [192, 512].map((n) => ({ src: fallback(n), sizes: `${n}x${n}`, type: 'image/png', purpose: 'any maskable' }));
    let touch = new URL('assets/img/apple-touch-icon.png', root).href;
    if (s.logo) {
      try {
        const [i192, i512, i180] = await Promise.all([drawIcon(s.logo, 192), drawIcon(s.logo, 512), drawIcon(s.logo, 180)]);
        icons = [{ src: i192, sizes: '192x192', type: 'image/png', purpose: 'any maskable' }, { src: i512, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }];
        touch = i180;
      } catch (e) { /* logo inacessível: usa o ícone padrão */ }
    }
    const manifest = {
      id: root,
      name: s.name,
      short_name: s.name.length > 14 ? s.name.split(' ')[0].slice(0, 14) : s.name,
      description: `Agende seu horário na ${s.name}.`,
      lang: 'pt-BR',
      start_url: `${root}?app=1`,
      scope: root,
      display: 'standalone',
      background_color: BG,
      theme_color: BG,
      icons,
    };
    const link = setHead('link[rel="manifest"]', 'link', { rel: 'manifest' });
    const old = link.getAttribute('href');
    link.setAttribute('href', URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' })));
    if (old && old.startsWith('blob:')) URL.revokeObjectURL(old);
    setHead('link[rel="apple-touch-icon"]', 'link', { rel: 'apple-touch-icon', href: touch });
    setHead('meta[name="apple-mobile-web-app-capable"]', 'meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    setHead('meta[name="mobile-web-app-capable"]', 'meta', { name: 'mobile-web-app-capable', content: 'yes' });
    setHead('meta[name="apple-mobile-web-app-status-bar-style"]', 'meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });
    setHead('meta[name="apple-mobile-web-app-title"]', 'meta', { name: 'apple-mobile-web-app-title', content: manifest.short_name });
  }

  /* ---------- Instalação ---------- */
  const available = () => !standalone() && (!!deferred || isIOS);

  function refreshButtons() {
    document.querySelectorAll('[data-install]').forEach((b) => { b.hidden = !available(); });
  }

  function iosHelp() {
    const U = App.utils;
    const s = App.db.settings();
    App.ui.modal({
      title: 'Instalar o app',
      size: 'sm',
      body: U.html`
        <p class="muted">Deixe a ${s.name} na tela inicial do iPhone e agende com um toque.</p>
        <ol class="install-steps">
          <li>No Safari, toque em <strong>Compartilhar</strong> <i class="bi bi-box-arrow-up" aria-label="ícone Compartilhar"></i> na barra de baixo.</li>
          <li>Role a lista e toque em <strong>Adicionar à Tela de Início</strong> <i class="bi bi-plus-square" aria-hidden="true"></i>.</li>
          <li>Confirme em <strong>Adicionar</strong>. O ícone aparece junto dos outros apps.</li>
        </ol>`,
      footer: U.html`<button type="button" class="btn btn-primary" data-close>Entendi</button>`,
    });
  }

  async function install() {
    if (deferred) {
      deferred.prompt();
      const choice = await deferred.userChoice.catch(() => null);
      deferred = null;
      refreshButtons();
      if (choice && choice.outcome === 'accepted') App.ui.toast('App instalado! Procure o ícone na tela inicial.');
    } else if (isIOS) {
      iosHelp();
    }
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    refreshButtons();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    refreshButtons();
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-install]')) install();
  });

  /* ---------- Service worker ---------- */
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${CFG.appRoot}sw.js`, { scope: CFG.appRoot }).catch(() => { /* segue sem cache */ });
    });
  }

  App.pwa = { available, install, standalone, isIOS, refreshButtons };

  App.ready(() => {
    // Aberto pelo ícone: equipe vai direto para o painel
    const params = new URLSearchParams(location.search);
    if (params.get('app') === '1') {
      const user = App.auth.current();
      if (user && App.auth.isStaff(user)) {
        location.replace(`${CFG.appRoot}painel/index.html`);
        return;
      }
    }
    updateManifest();
    App.db.subscribe(updateManifest);
    refreshButtons();
  });
})();
