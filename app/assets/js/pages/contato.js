/* Página de contato: canais, horários, mapa sob demanda e formulário que cai em Painel > Mensagens */
window.App.ready(function () {
  'use strict';
  const App = window.App;
  const U = App.utils;
  const { html, $ } = U;
  const db = App.db;
  const UI = App.ui;

  function renderInfo() {
    $('#open-status').innerHTML = App.site.openChip();
    $('#contact-hours').innerHTML = App.site.hoursList();
    UI.applyBranding();
  }

  // Copiar contatos
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const value = UI.bindings(db.settings())[btn.dataset.copy];
    const ok = await U.copyText(value);
    UI.toast(ok ? `Copiado: ${value}` : 'Não foi possível copiar. Selecione o texto e copie manualmente.', ok ? 'success' : 'error');
  });

  // Mapa só carrega quando a pessoa pede (mais rápido e sem rastrear quem não quer)
  $('[data-load-map]').addEventListener('click', () => {
    const card = $('#map-card');
    const q = encodeURIComponent(UI.bindings(db.settings()).fullAddress);
    card.innerHTML = `<iframe title="Mapa com a localização da barbearia" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?q=${q}&z=16&output=embed"></iframe>`;
    card.classList.add('loaded');
  });

  /* ---------- Formulário ---------- */
  const form = $('#contact-form');
  UI.maskPhone(form.elements.phone);
  const user = App.auth.current();
  if (user) {
    form.elements.name.value = user.name;
    form.elements.email.value = user.email;
    form.elements.phone.value = user.phone || '';
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = UI.validate(form, {
      name: UI.rules.required('seu nome'),
      email: UI.rules.email,
      phone: (v) => (!v || U.validPhone(v) ? null : 'Digite o WhatsApp com DDD ou deixe em branco.'),
      message: (v) => (v.length >= 10 ? null : 'Escreva sua mensagem (pelo menos 10 caracteres).'),
    });
    if (!data) return;
    db.insert('messages', { ...data, read: false });
    const card = $('#contact-card');
    card.innerHTML = html`
      <div class="success-state">
        <span class="success-icon"><i class="bi bi-check2"></i></span>
        <h2 class="wizard-title">Mensagem enviada!</h2>
        <p class="muted">Obrigado, ${U.firstName(data.name)}. A equipe já recebeu sua mensagem no painel e responde em breve pelo e-mail ${data.email}${data.phone ? ' ou WhatsApp' : ''}.</p>
        <div class="cluster" style="justify-content:center">
          <a class="btn btn-outline" href="contato.html">Enviar outra mensagem</a>
          <a class="btn btn-primary" href="agendar.html"><i class="bi bi-calendar-plus"></i>Agendar horário</a>
        </div>
      </div>`;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  renderInfo();
  db.subscribe((source) => {
    if (source === 'remote') renderInfo();
  });
});
