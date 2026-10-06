/* Tela inicial dos apps ForBarber (cliente) e ForBarber Pro (equipe).
   - Ao abrir o app, entra direto na última barbearia usada (no Pro, no painel).
   - Voltando por "Trocar de barbearia", mostra a lista para escolher.
   - Cliente: abrir barbearia pelo link. Pro: entrar com e-mail e demonstração.
   - Conta conectada: sair e excluir (exigência das lojas). */
(function () {
  'use strict';
  const App = window.App;
  const CFG = window.FORBARBER;
  const U = App.utils;
  const { html, $ } = U;
  const UI = App.ui;
  const PRO = CFG.appKind === 'pro';
  const SHOPS_KEY = 'forbarber:shops';
  const STARTED_KEY = 'forbarber:started';
  const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

  if (CFG.native) document.documentElement.classList.add('is-native', `is-${CFG.platform}`);

  const load = () => {
    try { return JSON.parse(localStorage.getItem(SHOPS_KEY) || '[]'); } catch (e) { return []; }
  };
  const save = (list) => {
    try { localStorage.setItem(SHOPS_KEY, JSON.stringify(list)); } catch (e) { /* ignora */ }
  };
  // No Pro aparecem as barbearias em que a pessoa é da equipe; no cliente, as que ela agenda
  const mine = () => load().filter((s) => (PRO ? s.staff : !s.staff));
  const target = (slug) => CFG.shopUrl(slug, PRO ? 'painel/index.html' : 'index.html');

  /* Abre direto a última barbearia só no começo do uso do app; quem volta para
     esta tela (Trocar de barbearia) quer escolher outra */
  let started = false;
  try {
    started = sessionStorage.getItem(STARTED_KEY) === '1';
    sessionStorage.setItem(STARTED_KEY, '1');
  } catch (e) { started = true; }
  if (!started && !U.qs('lista') && mine().length) {
    location.replace(target(mine()[0].slug));
    return;
  }

  function renderShops() {
    const list = mine();
    $('#shops-sec').hidden = !list.length;
    $('#shops').innerHTML = html`${list.map((s) => html`
      <div class="p-shop">
        ${s.logo
          ? html`<img class="p-shop-logo" src="${s.logo}" alt="">`
          : html`<span class="p-shop-logo is-empty" aria-hidden="true">${(s.name || s.slug).slice(0, 1).toUpperCase()}</span>`}
        <a class="grow" href="${target(s.slug)}">
          <strong>${s.slug === 'demo' ? `${s.name} (demonstração)` : s.name}</strong>
          <small>${PRO ? 'Agenda e painel' : 'Agendar e meus horários'}</small>
        </a>
        <button type="button" class="p-shop-remove" data-remove="${s.slug}" aria-label="Tirar ${s.name} da lista"><i class="bi bi-x-lg"></i></button>
      </div>`)}`;
  }
  $('#shops').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    save(load().filter((s) => s.slug !== btn.dataset.remove));
    renderShops();
  });

  /* ---------- Cliente: abrir a barbearia pelo link que ela mandou ---------- */
  /** "https://site/barbeariadoze/agendar.html", "site/barbeariadoze" ou "barbeariadoze" */
  function slugFrom(text) {
    const raw = String(text || '').trim().toLowerCase();
    if (!raw) return '';
    let parts;
    try {
      const url = new URL(/^[a-z]+:\/\//.test(raw) ? raw : `https://${raw}`);
      const b = url.searchParams.get('b');
      if (b) return b;
      parts = url.pathname.split('/').filter(Boolean);
      if (!parts.length) return raw.includes('.') ? '' : raw;
    } catch (e) {
      parts = raw.split('/').filter(Boolean);
    }
    const seg = parts.find((p) => SLUG_RE.test(p) && !p.includes('.'));
    return seg || '';
  }

  async function shopExists(slug) {
    if (slug === 'demo') return { name: 'Grey Barber' };
    if (!CFG.cloud) return null;
    const sb = await App.cloud.client();
    const { data, error } = await sb.from('shops').select('name').eq('slug', slug).maybeSingle();
    if (error) throw new Error(App.cloud.friendly(error));
    return data;
  }

  const form = $('#find-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = form.elements.link;
      UI.clearErrors(form);
      const slug = slugFrom(input.value);
      if (!slug) return UI.setError(input, 'Cole o link da barbearia, como forbarber.com.br/barbeariadoze.');
      const btn = form.querySelector('[type=submit]');
      UI.busy(btn, true);
      try {
        const shop = await shopExists(slug);
        if (!shop) return UI.setError(input, 'Não achamos essa barbearia. Confira o link com ela.');
        location.href = CFG.shopUrl(slug, 'index.html');
      } catch (err) {
        UI.toast(err.message, 'error');
      } finally {
        UI.busy(btn, false);
      }
    });
  }

  /* ---------- Conta conectada: sair e excluir (exigência das lojas) ---------- */
  async function renderAccount() {
    if (!CFG.cloud) return;
    const sb = await App.cloud.client();
    const { data: { session } } = await sb.auth.getSession();
    const box = $('#account');
    if (!session) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.innerHTML = html`
      <h2 class="p-title in-title">Sua conta</h2>
      <p class="muted">Conectado como <strong>${session.user.email}</strong>.</p>
      <div class="cluster-sm">
        <button type="button" class="btn btn-outline btn-sm" id="logout"><i class="bi bi-box-arrow-right"></i>Sair</button>
        <button type="button" class="btn btn-danger btn-sm" id="delete"><i class="bi bi-trash"></i>Excluir minha conta</button>
      </div>`;
    $('#logout').addEventListener('click', async () => {
      await sb.auth.signOut().catch(() => {});
      save(load().filter((s) => !s.staff));
      renderShops();
      renderAccount();
    });
    $('#delete').addEventListener('click', async (e) => {
      const ok = await UI.confirm({
        title: 'Excluir minha conta',
        message: 'Sua conta ForBarber será apagada em todas as barbearias e os horários futuros serão cancelados. Essa ação não pode ser desfeita.',
        confirmText: 'Excluir de vez',
        danger: true,
      });
      if (!ok) return;
      UI.busy(e.currentTarget, true);
      try {
        await App.cloud.deleteAccount();
        save([]);
        UI.toast('Conta excluída.');
        renderShops();
        renderAccount();
      } catch (err) {
        UI.busy(e.currentTarget, false);
        UI.toast(err.message, 'error');
      }
    });
  }

  renderShops();
  renderAccount().catch(() => {});
})();
