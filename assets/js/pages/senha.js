/* ==========================================================================
   RECUPERAÇÃO DE SENHA — e-mail → código de 6 dígitos → nova senha.
   Sem servidor de e-mail, o código aparece na tela (modo demonstração).
   Em produção, gere e envie o código pelo back-end.
   ========================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const U = App.utils;
  const { html, $ } = U;
  const db = App.db;
  const UI = App.ui;
  const auth = App.auth;

  const card = $('#reset-card');
  const KEY = 'barbearia:reset';
  const read = () => {
    try { return JSON.parse(window.sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  };
  const write = (v) => {
    try { window.sessionStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* ignora */ }
  };
  const clear = () => {
    try { window.sessionStorage.removeItem(KEY); } catch (e) { /* ignora */ }
  };
  const mask = (email) => email.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(Math.min(6, b.length)) + c);

  const steps = (n) => html`<p class="group-label">Passo ${n} de 3</p>`;

  function stepEmail() {
    card.innerHTML = html`
      <div class="stack-sm">${steps(1)}<h1>Recuperar senha</h1>
        <p class="muted">Informe o e-mail da sua conta. Vamos enviar um código de 6 dígitos para criar uma senha nova.</p></div>
      <form id="f-email" novalidate>
        <div class="field">
          <label class="label" for="email">E-mail</label>
          <div class="input-icon"><i class="bi bi-envelope" aria-hidden="true"></i><input class="input" id="email" name="email" type="email" autocomplete="email" placeholder="nome@email.com" required></div>
        </div>
        <button class="btn btn-primary btn-lg btn-block" type="submit"><i class="bi bi-send"></i>Enviar código</button>
      </form>
      <p class="auth-alt">Lembrou? <a class="link" href="login.html">Voltar para o login</a></p>`;
    const form = $('#f-email');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = UI.validate(form, { email: UI.rules.email });
      if (!data) return;
      const user = db.userByEmail(data.email);
      if (!user) {
        // Em produção a resposta é sempre a mesma (não revela quem tem conta).
        UI.setError(form.elements.email, db.settings().demoMode
          ? 'Nenhuma conta com esse e-mail nesta demonstração. Tente cliente@demo.com.'
          : 'Se o e-mail estiver cadastrado, você receberá o código em instantes.');
        return;
      }
      const code = String(Math.floor(100000 + Math.random() * 900000));
      write({ email: user.email, userId: user.id, code, exp: Date.now() + 15 * 60000, ok: false });
      stepCode();
    });
  }

  function stepCode() {
    const r = read();
    if (!r) return stepEmail();
    card.innerHTML = html`
      <div class="stack-sm">${steps(2)}<h1>Digite o código</h1>
        <p class="muted">Enviamos um código para <strong>${mask(r.email)}</strong>. Ele vale por 15 minutos.</p></div>
      ${db.settings().demoMode ? html`<div class="notice warn"><i class="bi bi-envelope-paper"></i><div><strong>Demonstração:</strong> como não há envio real de e-mail, o código é <strong class="num">${r.code}</strong>.</div></div>` : ''}
      <form id="f-code" novalidate>
        <div class="field">
          <label class="label" for="code">Código de 6 dígitos</label>
          <input class="input num code-input" id="code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" required>
        </div>
        <button class="btn btn-primary btn-lg btn-block" type="submit">Validar código</button>
      </form>
      <p class="auth-alt"><button type="button" class="link" id="resend">Usar outro e-mail</button></p>`;
    const form = $('#f-code');
    form.elements.code.addEventListener('input', (e) => (e.target.value = U.digits(e.target.value).slice(0, 6)));
    $('#resend').addEventListener('click', () => {
      clear();
      stepEmail();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const cur = read();
      const code = form.elements.code.value;
      if (!cur || Date.now() > cur.exp) {
        UI.toast('O código expirou. Peça um novo.', 'error');
        clear();
        return stepEmail();
      }
      if (code !== cur.code) {
        UI.setError(form.elements.code, 'Código incorreto. Confira os 6 números.');
        return;
      }
      write({ ...cur, ok: true });
      stepPassword();
    });
  }

  function stepPassword() {
    const r = read();
    if (!r || !r.ok) return stepEmail();
    card.innerHTML = html`
      <div class="stack-sm">${steps(3)}<h1>Crie a nova senha</h1><p class="muted">Conta: <strong>${r.email}</strong></p></div>
      <form id="f-pass" novalidate>
        <div class="field">
          <label class="label" for="password">Nova senha</label>
          <div class="input-icon"><i class="bi bi-lock" aria-hidden="true"></i>
            <input class="input" id="password" name="password" type="password" autocomplete="new-password" required>
            <button type="button" class="input-action" data-toggle-password aria-label="Mostrar senha"><i class="bi bi-eye"></i></button>
          </div>
        </div>
        <div class="field">
          <label class="label" for="password2">Repita a nova senha</label>
          <div class="input-icon"><i class="bi bi-lock" aria-hidden="true"></i><input class="input" id="password2" name="password2" type="password" autocomplete="new-password" required></div>
        </div>
        <button class="btn btn-primary btn-lg btn-block" type="submit"><i class="bi bi-check2"></i>Salvar nova senha</button>
      </form>`;
    const form = $('#f-pass');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = UI.validate(form, {
        password: UI.rules.password,
        password2: (v, d) => (v === d.password ? null : 'As senhas não conferem.'),
      });
      if (!data) return;
      auth.setPassword(r.userId, data.password);
      clear();
      UI.flash('Senha alterada! Entre com a nova senha.');
      location.href = `login.html?email=${encodeURIComponent(r.email)}`;
    });
  }

  const saved = read();
  if (saved && saved.ok) stepPassword();
  else if (saved) stepCode();
  else stepEmail();
})();
