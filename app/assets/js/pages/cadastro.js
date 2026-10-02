/* Cadastro de cliente com validação, força da senha e retorno ao agendamento */
window.App.ready(function () {
  'use strict';
  const App = window.App;
  const U = App.utils;
  const { $, html } = U;
  const UI = App.ui;
  const auth = App.auth;

  const next = auth.safeNext(U.qs('next'));
  const form = $('#signup-form');
  if (next) $('#login-link').href = `login.html?next=${encodeURIComponent(next)}`;
  UI.maskPhone(form.elements.phone);
  form.elements.birthday.max = U.today();

  /** 0 a 4 conforme tamanho e variedade de caracteres */
  function strength(pw) {
    if (!pw) return 0;
    let score = pw.length >= 6 ? 1 : 0;
    if (pw.length >= 10) score++;
    if (/[a-z]/i.test(pw) && /\d/.test(pw)) score++;
    if (/[^a-z0-9]/i.test(pw) || /[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    return Math.min(4, Math.max(pw.length ? 1 : 0, score));
  }
  const LABELS = ['Use 6 caracteres ou mais. Misture letras e números.', 'Senha fraca', 'Senha razoável', 'Senha boa', 'Senha forte'];
  form.elements.password.addEventListener('input', (e) => {
    const lvl = strength(e.target.value);
    $('#strength').dataset.level = lvl;
    $('#strength-text').textContent = LABELS[lvl];
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = UI.validate(form, {
      name: (v) => (v.trim().split(/\s+/).length >= 2 ? null : 'Informe nome e sobrenome.'),
      email: UI.rules.email,
      phone: UI.rules.phone,
      password: UI.rules.password,
      password2: (v, d) => (v === d.password ? null : 'As senhas não conferem.'),
      terms: (v) => (v ? null : 'Para criar a conta, aceite o uso dos dados para o atendimento.'),
    });
    if (!data) return;
    const button = form.querySelector('[type=submit]');
    UI.busy(button, true);
    const res = await auth.register({
      name: data.name,
      email: data.email.toLowerCase(),
      phone: U.fmtPhone(data.phone),
      birthday: data.birthday,
      password: data.password,
    });
    UI.busy(button, false);
    if (!res.ok) {
      UI.setError(form.elements.email, res.error);
      form.elements.email.focus();
      return;
    }
    if (res.needsConfirmation) {
      form.closest('.auth-card').innerHTML = html`
        <div class="success-state">
          <span class="success-icon"><i class="bi bi-envelope-check"></i></span>
          <h1>Confirme seu e-mail</h1>
          <p class="muted">Enviamos um link para <strong>${data.email}</strong>. Abra o e-mail, confirme e depois entre com sua senha.</p>
          <a class="btn btn-primary" href="login.html${next ? `?next=${encodeURIComponent(next)}` : ''}">Ir para o login</a>
        </div>`.toString();
      return;
    }
    UI.flash(res.claimed
      ? `Conta criada, ${U.firstName(res.user.name)}! Encontramos seu histórico de atendimentos.`
      : `Conta criada! Bem-vindo, ${U.firstName(res.user.name)}.`);
    location.href = next && !next.startsWith('painel/') ? next : (auth.isStaff(res.user) ? 'painel/index.html' : 'minha-conta.html');
  });
});
