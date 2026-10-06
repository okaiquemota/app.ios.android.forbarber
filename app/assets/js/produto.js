/* ==========================================================================
   PRODUTO — criar barbearia e entrar no painel (o site de vendas fica no
   repositório movcodebr/site.produto.forbarber).
   Cada barbearia criada ganha o endereço <site>/<nome>/ (vercel.json).
   ========================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const CFG = window.FORBARBER;
  const U = App.utils;
  const { html, $ } = U;
  const UI = App.ui;
  const page = document.body.dataset.page;

  // No app de celular os links que saem dele (e-mails) apontam para o site publicado
  const BASE = CFG.native ? CFG.webBase : new URL('./', location.href).href;
  const PREFIX = BASE.replace(/^https?:\/\//, '');
  const panelUrl = (slug) => CFG.shopUrl(slug, 'painel/index.html');
  // Barbearia nova é criada pelo site (no app só se entra): abre no navegador
  const criarHref = CFG.native ? (CFG.webUrl ? `${CFG.webBase}criar.html` : '') : 'criar.html';
  const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
  const sales = (text) => U.waLink(CFG.salesWhatsapp, text || 'Olá! Quero saber mais sobre o ForBarber.');

  /** "Barbearia do Zé" -> "barbearia-do-ze" */
  const slugify = (v) => String(v || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 40).replace(/-+$/, '');
  /** Versão que não atrapalha quem está digitando (mantém hífen no fim) */
  const slugTyping = (v) => String(v || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-{2,}/g, '-').replace(/^-+/, '').slice(0, 40);

  if (CFG.native) {
    document.querySelectorAll('a[href="criar.html"]').forEach((el) => {
      if (criarHref) el.href = criarHref;
      else (el.closest('.p-alt') || el).remove();
    });
    document.querySelectorAll('[data-site]').forEach((el) => { el.href = 'index.html'; el.removeAttribute('data-site'); });
  }
  document.querySelectorAll('[data-host]').forEach((el) => { el.textContent = PREFIX.replace(/\/$/, ''); });
  document.querySelectorAll('[data-sales]').forEach((el) => { el.href = sales(); });
  document.querySelectorAll('[data-site]').forEach((el) => { if (CFG.siteUrl) el.href = CFG.siteUrl; });

  /** Sem Supabase configurado não dá para criar contas: mostra a demonstração */
  function notLive() {
    $('#card').innerHTML = html`
      <div class="stack-sm">
        <h1>Quase lá</h1>
        <p class="muted">As contas abrem assim que o ForBarber estiver ligado ao banco de dados. Enquanto isso, a demonstração mostra tudo funcionando.</p>
      </div>
      <a class="btn btn-primary btn-lg btn-block" href="${CFG.appKind === 'pro' ? 'app/login.html?b=demo&next=painel/index.html#demo' : 'app/'}"><i class="bi bi-play-circle"></i>Abrir a demonstração</a>
      <a class="btn btn-whatsapp btn-block" href="${sales('Olá! Quero colocar minha barbearia no ForBarber.')}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i>Falar com a gente</a>`;
  }

  /* ======================= Criar barbearia ======================= */
  async function criar() {
    $('#slug-prefix').textContent = PREFIX;
    if (!CFG.cloud) return notLive();

    const sb = await App.cloud.client();
    const form = $('#create-form');
    const f = form.elements;
    const stateEl = $('#slug-state');
    UI.maskPhone(f.phone);

    let session = (await sb.auth.getSession()).data.session;
    let slugTouched = false;
    let checked = { slug: '', ok: false };
    let seq = 0;
    let timer = null;

    const setState = (cls, content) => {
      stateEl.className = `slug-state ${cls}`;
      stateEl.innerHTML = content;
    };

    async function verify(slug) {
      if (!SLUG_RE.test(slug)) {
        checked = { slug, ok: false };
        setState('bad', html`<i class="bi bi-x-circle"></i>Use de 3 a 40 letras, números ou hífen.`);
        return false;
      }
      if (checked.slug === slug) return checked.ok;
      const mine = ++seq;
      setState('wait', html`<i class="bi bi-hourglass-split"></i>Conferindo...`);
      let ok = false;
      try {
        ok = await App.cloud.slugAvailable(slug);
      } catch (err) {
        setState('bad', html`<i class="bi bi-wifi-off"></i>${err.message}`);
        return false;
      }
      if (mine !== seq) return ok;
      checked = { slug, ok };
      setState(ok ? 'ok' : 'bad', ok
        ? html`<i class="bi bi-check-circle"></i>${PREFIX}${slug} está livre.`
        : html`<i class="bi bi-x-circle"></i>Esse endereço não está disponível. Tente uma variação.`);
      return ok;
    }
    const schedule = () => {
      clearTimeout(timer);
      const v = f.slug.value;
      timer = setTimeout(() => verify(v), 350);
    };

    f.shop.addEventListener('input', () => {
      if (slugTouched) return;
      f.slug.value = slugify(f.shop.value);
      schedule();
    });
    f.slug.addEventListener('input', () => {
      slugTouched = true;
      const clean = slugTyping(f.slug.value);
      if (clean !== f.slug.value) f.slug.value = clean;
      schedule();
    });
    f.slug.addEventListener('blur', () => {
      f.slug.value = slugify(f.slug.value);
      if (f.slug.value) verify(f.slug.value);
    });

    function applySession() {
      const logged = !!session;
      document.querySelectorAll('[data-login]').forEach((el) => { el.hidden = logged; });
      if (!logged) {
        $('#context').innerHTML = '';
        return;
      }
      const meta = session.user.user_metadata || {};
      if (!f.name.value && meta.name) f.name.value = meta.name;
      if (!f.phone.value && meta.phone) f.phone.value = U.fmtPhone(meta.phone);
      const pending = meta.pending_shop;
      if (pending && pending.slug && !f.shop.value) {
        f.shop.value = pending.name || '';
        f.slug.value = pending.slug;
        slugTouched = true;
        verify(pending.slug);
      }
      $('#context').innerHTML = html`
        <div class="notice"><i class="bi bi-person-check"></i><div class="stack-sm">
          <span>Conectado como <strong>${session.user.email}</strong>. A barbearia fica nesta conta.</span>
          <button type="button" class="link text-sm" id="switch-account" style="align-self:flex-start">Usar outra conta</button>
        </div></div>`;
      $('#switch-account').addEventListener('click', async () => {
        await sb.auth.signOut().catch(() => {});
        session = null;
        applySession();
      });
    }
    applySession();

    function confirmState(email) {
      $('#card').innerHTML = html`
        <div class="stack-sm">
          <h1>Confirme seu e-mail</h1>
          <p class="muted">Enviamos um link para <strong>${email}</strong>. Toque em <strong>Confirmar</strong> no e-mail e entre com a senha que você criou: a barbearia é criada na hora.</p>
        </div>
        <div class="notice"><i class="bi bi-envelope-open"></i><div>Não chegou em 2 minutos? Procure em <strong>Spam</strong> ou <strong>Promoções</strong>.</div></div>
        <button type="button" class="btn btn-outline btn-block" id="resend"><i class="bi bi-arrow-repeat"></i>Reenviar o e-mail</button>
        <a class="btn btn-ghost btn-block" href="entrar.html?email=${encodeURIComponent(email)}">Já confirmei, quero entrar</a>`;
      $('#resend').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        UI.busy(btn, true);
        const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${BASE}entrar.html?confirmado=1` } });
        UI.busy(btn, false);
        UI.toast(error ? App.cloud.friendly(error) : 'E-mail reenviado.', error ? 'error' : 'success');
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      f.slug.value = slugify(f.slug.value);
      const rules = {
        shop: (v) => (v.length >= 2 ? null : 'Informe o nome da barbearia.'),
        slug: (v) => (SLUG_RE.test(v) ? null : 'Use de 3 a 40 letras, números ou hífen.'),
        name: UI.rules.required('seu nome'),
        phone: UI.rules.phone,
        terms: (v) => (v ? null : 'Marque para continuar.'),
      };
      if (!session) Object.assign(rules, { email: UI.rules.email, password: UI.rules.password });
      const data = UI.validate(form, rules);
      if (!data) return;

      const btn = form.querySelector('[type=submit]');
      UI.busy(btn, true);
      try {
        if (!(await verify(data.slug))) {
          UI.setError(f.slug, 'Esse endereço não está disponível.');
          f.slug.focus();
          return;
        }
        if (!session) {
          const email = data.email.toLowerCase();
          const { data: res, error } = await sb.auth.signUp({
            email,
            password: data.password,
            options: {
              data: { name: data.name, phone: data.phone, pending_shop: { name: data.shop, slug: data.slug, phone: data.phone } },
              emailRedirectTo: `${BASE}entrar.html?confirmado=1`,
            },
          });
          if (error) throw error;
          // Com confirmação de e-mail ligada, um e-mail já cadastrado volta sem identidades
          if (res.user && Array.isArray(res.user.identities) && !res.user.identities.length) throw new Error('already registered');
          if (!res.session) return confirmState(email);
          session = res.session;
        }
        const shop = await App.cloud.createShop({ name: data.shop, slug: data.slug, ownerName: data.name, phone: data.phone });
        await sb.auth.updateUser({ data: { pending_shop: null } }).catch(() => {});
        UI.flash(`${shop.name} está no ar! Comece pelos serviços e horários em Configurações.`);
        location.href = panelUrl(shop.slug);
      } catch (err) {
        const msg = App.cloud.friendly(err);
        if (/já existe uma conta/i.test(msg) && f.email) {
          UI.setError(f.email, 'Este e-mail já tem conta. Entre com ele para criar a barbearia.');
          $('#context').innerHTML = html`<div class="notice"><i class="bi bi-person-check"></i><div>Já tem conta? <a class="link" href="entrar.html?email=${encodeURIComponent(f.email.value)}">Entre aqui</a> e volte para criar a barbearia.</div></div>`;
        } else if (/endereço/i.test(msg)) {
          checked = { slug: '', ok: false };
          UI.setError(f.slug, msg);
        } else {
          UI.toast(msg, 'error');
        }
      } finally {
        UI.busy(btn, false);
      }
    });

    if (!session) f.shop.focus();
  }

  /* ======================= Entrar ======================= */
  async function entrar() {
    if (!CFG.cloud) return notLive();
    const sb = await App.cloud.client();
    const card = $('#card');
    const loginHTML = card.innerHTML;

    const statusText = (s) => {
      if (s.status === 'active') return `Plano ${((CFG.plans || []).find((p) => p.id === s.plan) || { name: s.plan }).name}`;
      if (s.status === 'past_due') return 'Pagamento pendente';
      if (s.status === 'canceled') return 'Assinatura cancelada';
      const left = Math.ceil((new Date(s.trial_ends_at).getTime() - Date.now()) / 864e5);
      return left > 0 ? `Teste grátis · ${left} ${left === 1 ? 'dia' : 'dias'}` : 'Teste encerrado';
    };

    function showShops(user, shops) {
      card.innerHTML = html`
        <div class="stack-sm">
          <h1>Suas barbearias</h1>
          <p class="muted">Conectado como <strong>${user.email}</strong>.</p>
        </div>
        ${shops.length
          ? html`<div class="p-shops">${shops.map((s) => html`
              <a class="p-shop" href="${panelUrl(s.slug)}">
                <i class="bi bi-shop"></i>
                <span class="grow"><strong>${s.name}</strong><small>${PREFIX}${s.slug} · ${s.role === 'admin' ? 'Administrador' : 'Barbeiro'} · ${statusText(s)}</small></span>
                <i class="bi bi-chevron-right"></i>
              </a>`)}</div>`
          : html`<div class="notice"><i class="bi bi-info-circle"></i><div>Esta conta ainda não faz parte de nenhuma barbearia. Se você é barbeiro, peça para o dono te convidar pelo painel com este e-mail.</div></div>`}
        ${criarHref ? html`<a class="btn ${shops.length ? 'btn-outline' : 'btn-primary'} btn-block" href="${criarHref}"><i class="bi bi-plus-lg"></i>${shops.length ? 'Criar outra barbearia' : 'Criar minha barbearia'}</a>` : ''}
        <button type="button" class="btn btn-ghost btn-block" id="logout"><i class="bi bi-box-arrow-right"></i>Entrar com outra conta</button>`;
      $('#logout').addEventListener('click', async () => {
        await sb.auth.signOut().catch(() => {});
        location.replace('entrar.html');
      });
    }

    /** Depois do login: aceita convites, cria a barbearia pendente ou abre o painel */
    async function route(user, auto) {
      await App.cloud.rpc('accept_invites', {}).catch(() => 0);
      const shops = await App.cloud.myShops();
      if (!shops.length) {
        const meta = user.user_metadata || {};
        const pending = meta.pending_shop;
        if (pending && pending.slug) {
          try {
            const shop = await App.cloud.createShop({ name: pending.name, slug: pending.slug, ownerName: meta.name || pending.name, phone: pending.phone || '' });
            await sb.auth.updateUser({ data: { pending_shop: null } }).catch(() => {});
            UI.flash(`${shop.name} está no ar! Comece pelos serviços e horários em Configurações.`);
            location.href = panelUrl(shop.slug);
          } catch (err) {
            UI.flash(App.cloud.friendly(err), 'error');
            location.href = 'criar.html';
          }
          return;
        }
      }
      if (auto && shops.length === 1) {
        location.href = panelUrl(shops[0].slug);
        return;
      }
      showShops(user, shops);
    }

    function bindLogin() {
      const form = $('#login-form');
      const f = form.elements;
      if (U.qs('email')) f.email.value = U.qs('email');
      if (U.qs('confirmado')) {
        $('#context').innerHTML = html`<div class="notice"><i class="bi bi-envelope-check"></i><div><strong>E-mail confirmado!</strong> Entre com sua senha para abrir a barbearia.</div></div>`;
      }
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = UI.validate(form, { email: UI.rules.email, password: UI.rules.required('sua senha') });
        if (!data) return;
        const btn = form.querySelector('[type=submit]');
        UI.busy(btn, true);
        const { data: res, error } = await sb.auth.signInWithPassword({ email: data.email.toLowerCase(), password: data.password });
        if (error) {
          UI.busy(btn, false);
          UI.setError(f.password, App.cloud.friendly(error));
          f.password.select();
          return;
        }
        try {
          await route(res.user, true);
        } catch (err) {
          UI.toast(App.cloud.friendly(err), 'error');
        } finally {
          UI.busy(btn, false);
        }
      });
      $('#forgot').addEventListener('click', () => forgot(f.email.value));
      (f.email.value ? f.password : f.email).focus();
    }

    function forgot(email) {
      card.innerHTML = html`
        <div class="stack-sm">
          <h1>Nova senha</h1>
          <p class="muted">Informe o e-mail da conta. Enviamos um link para você criar uma senha nova.</p>
        </div>
        <form id="forgot-form" novalidate>
          <div class="field">
            <label class="label" for="f-email">E-mail</label>
            <div class="input-icon"><i class="bi bi-envelope" aria-hidden="true"></i><input class="input" id="f-email" name="email" type="email" autocomplete="email" value="${email || ''}" required></div>
          </div>
          <button class="btn btn-primary btn-lg btn-block" type="submit"><i class="bi bi-send"></i>Enviar link</button>
        </form>
        <button type="button" class="btn btn-ghost btn-block" id="back"><i class="bi bi-arrow-left"></i>Voltar para o login</button>`;
      const form = $('#forgot-form');
      $('#back').addEventListener('click', () => {
        card.innerHTML = loginHTML;
        bindLogin();
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = UI.validate(form, { email: UI.rules.email });
        if (!data) return;
        const btn = form.querySelector('[type=submit]');
        UI.busy(btn, true);
        const res = await App.cloud.sendReset(data.email, `${BASE}entrar.html?recuperar=1`);
        UI.busy(btn, false);
        if (!res.ok) return UI.toast(res.error, 'error');
        card.innerHTML = html`
          <div class="stack-sm">
            <h1>Confira seu e-mail</h1>
            <p class="muted">Se existir uma conta com <strong>${data.email}</strong>, o link para criar a senha nova chega em instantes. Veja também o Spam.</p>
          </div>
          <a class="btn btn-outline btn-block" href="entrar.html">Voltar para o login</a>`;
      });
    }

    function newPassword(user) {
      card.innerHTML = html`
        <div class="stack-sm">
          <h1>Crie a senha nova</h1>
          <p class="muted">Para a conta <strong>${user.email}</strong>.</p>
        </div>
        <form id="new-form" novalidate>
          <div class="field">
            <label class="label" for="n-password">Senha nova</label>
            <div class="input-icon"><i class="bi bi-lock" aria-hidden="true"></i><input class="input" id="n-password" name="password" type="password" autocomplete="new-password" minlength="6" required>
              <button type="button" class="input-action" data-toggle-password aria-label="Mostrar senha"><i class="bi bi-eye"></i></button></div>
          </div>
          <div class="field">
            <label class="label" for="n-password2">Repita a senha</label>
            <div class="input-icon"><i class="bi bi-lock" aria-hidden="true"></i><input class="input" id="n-password2" name="password2" type="password" autocomplete="new-password" required></div>
          </div>
          <button class="btn btn-primary btn-lg btn-block" type="submit"><i class="bi bi-check2"></i>Salvar e entrar</button>
        </form>`;
      const form = $('#new-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = UI.validate(form, {
          password: UI.rules.password,
          password2: (v, d) => (v === d.password ? null : 'As senhas não conferem.'),
        });
        if (!data) return;
        const btn = form.querySelector('[type=submit]');
        UI.busy(btn, true);
        const res = await App.cloud.setNewPassword(data.password);
        if (!res.ok) {
          UI.busy(btn, false);
          return UI.toast(res.error, 'error');
        }
        UI.toast('Senha alterada.');
        history.replaceState(null, '', 'entrar.html');
        await route(user, true).catch((err) => UI.toast(App.cloud.friendly(err), 'error'));
        UI.busy(btn, false);
      });
    }

    const recovering = await App.cloud.hasRecoverySession();
    const { data: { session } } = await sb.auth.getSession();
    if (recovering && session) return newPassword(session.user);
    if (session) {
      // Veio do link de confirmação: já entra e cria a barbearia; senão mostra as barbearias da conta
      try {
        await route(session.user, !!U.qs('confirmado'));
        return;
      } catch (err) { /* sessão expirada: mostra o login */ }
    }
    bindLogin();
  }

  const run = { criar, entrar }[page];
  if (run) {
    Promise.resolve(run()).catch((err) => {
      if (UI) UI.toast((App.cloud && App.cloud.friendly(err)) || 'Algo deu errado. Recarregue a página.', 'error');
    });
  }
})();
