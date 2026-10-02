/* Login único para clientes e equipe; redireciona conforme o papel */
window.App.ready(function () {
  'use strict';
  const App = window.App;
  const U = App.utils;
  const { html, $ } = U;
  const db = App.db;
  const UI = App.ui;
  const auth = App.auth;

  const next = auth.safeNext(U.qs('next'));
  const form = $('#login-form');

  if (next) $('#signup-link').href = `cadastro.html?next=${encodeURIComponent(next)}`;
  if (U.qs('email')) form.elements.email.value = U.qs('email');

  if (U.qs('confirmado')) {
    $('#login-context').innerHTML = html`<div class="notice"><i class="bi bi-envelope-check"></i><div><strong>E-mail confirmado!</strong> Entre com sua senha para continuar.</div></div>`;
  } else if (next && next.startsWith('agendar.html')) {
    $('#login-context').innerHTML = html`<div class="notice"><i class="bi bi-calendar-check"></i><div><strong>Seu horário está quase garantido.</strong> Entre ou crie sua conta para confirmar.</div></div>`;
  } else if (next && next.startsWith('painel/')) {
    $('#login-context').innerHTML = html`<div class="notice"><i class="bi bi-shield-lock"></i><div>Entre com um acesso da equipe para abrir o painel.</div></div>`;
  }

  function destination(user) {
    if (next) {
      const wantsPanel = next.startsWith('painel/');
      if (wantsPanel === auth.isStaff(user)) return next;
    }
    return auth.homeFor(user);
  }

  // Já está conectado? Mostra atalhos em vez do formulário
  const current = auth.current();
  if (current && !next) {
    $('#auth-card').innerHTML = html`
      <div class="stack-sm">
        <h1>Olá, ${U.firstName(current.name)}</h1>
        <p class="muted">Você já está conectado como <strong>${current.email}</strong>.</p>
      </div>
      <a class="btn btn-primary btn-lg btn-block" href="${auth.homeFor(current)}">${auth.isStaff(current) ? 'Abrir o painel' : 'Ir para minha conta'}</a>
      <button type="button" class="btn btn-outline btn-block" id="switch">Entrar com outra conta</button>`;
    $('#switch').addEventListener('click', async () => {
      await auth.logout();
      location.reload();
    });
    return;
  }

  // Nuvem: já tem conta ForBarber (de outra barbearia) mas ainda não é cliente desta
  if (auth.isCloud() && App.cloud.pendingEmail()) {
    const email = App.cloud.pendingEmail();
    $('#login-context').insertAdjacentHTML('afterend', html`
      <div class="notice" id="pending-box"><i class="bi bi-person-check"></i><div class="stack-sm">
        <span>Você já tem conta como <strong>${email}</strong>. Use a mesma conta nesta barbearia.</span>
        <div class="cluster-sm"><button type="button" class="btn btn-primary btn-sm" id="continue-as">Continuar como ${email}</button>
        <button type="button" class="btn btn-ghost btn-sm" id="other-account">Usar outra conta</button></div>
      </div></div>`.toString());
    $('#continue-as').addEventListener('click', async (e) => {
      UI.busy(e.currentTarget, true);
      try {
        const user = await App.cloud.ensureClient();
        UI.flash(`Bem-vindo, ${U.firstName(user.name)}!`);
        location.href = destination(user);
      } catch (err) {
        UI.busy(e.currentTarget, false);
        UI.toast(err.message, 'error');
      }
    });
    $('#other-account').addEventListener('click', async () => {
      await auth.logout();
      $('#pending-box').remove();
    });
  }

  async function doLogin(email, password, remember, button) {
    UI.busy(button, true);
    const started = Date.now();
    const res = await auth.login(email, password, remember);
    // Espera mínima para o botão mostrar o carregamento
    await new Promise((r) => setTimeout(r, Math.max(0, 300 - (Date.now() - started))));
    UI.busy(button, false);
    if (!res.ok) {
      UI.setError(form.elements.password, res.error);
      form.elements.password.select();
      return;
    }
    UI.flash(`Bem-vindo, ${U.firstName(res.user.name)}!`);
    location.href = destination(res.user);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = UI.validate(form, {
      email: UI.rules.email,
      password: UI.rules.required('sua senha'),
    });
    if (!data) return;
    doLogin(data.email, data.password, !!data.remember, form.querySelector('[type=submit]'));
  });

  // Perfis de demonstração
  if (db.settings().demoMode && !auth.isCloud()) {
    $('#demo').hidden = false;
    $('#demo').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-demo]');
      if (!btn) return;
      form.elements.email.value = btn.dataset.demo;
      form.elements.password.value = App.seed.DEMO_PASSWORD;
      doLogin(btn.dataset.demo, App.seed.DEMO_PASSWORD, true, btn);
    });
    if (location.hash === '#demo') $('#demo').scrollIntoView({ block: 'center' });
  }
});
