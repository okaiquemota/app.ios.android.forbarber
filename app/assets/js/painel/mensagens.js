/* Caixa de entrada do formulário de contato do site */
window.App.ready(function () {
  'use strict';
  const App = window.App;
  const P = App.painel;
  if (!P) return;
  const U = App.utils;
  const { html, $, $$ } = U;
  const db = App.db;
  const UI = App.ui;

  const state = { filter: 'todas', q: '' };

  function render() {
    const q = U.normalize(state.q);
    const list = [...db.list('messages')]
      .filter((m) => state.filter === 'todas' || !m.read)
      .filter((m) => !q || U.normalize(`${m.name} ${m.email} ${m.subject} ${m.message}`).includes(q))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    $('#list').innerHTML = list.length
      ? html`<div class="inbox">${list.map((m) => html`
          <button type="button" class="msg-row ${m.read ? '' : 'unread'}" data-msg="${m.id}">
            ${m.read ? UI.avatar(m.name, { size: 'sm' }) : html`<span class="avatar avatar-sm" style="--av-bg:var(--primary-soft);--av-fg:var(--primary)">${U.initials(m.name)}</span>`}
            <span style="min-width:0">
              <span class="msg-from"><strong>${m.name}</strong>${m.read ? '' : html`<span class="unread-dot" aria-label="Não lida"></span>`}</span>
              <span class="msg-subject" style="display:block">${m.subject}</span>
              <span class="msg-snippet" style="display:block">${m.message}</span>
            </span>
            <span class="msg-date">${U.relTime(m.createdAt)}</span>
          </button>`)}</div>`.toString()
      : UI.empty('bi-inbox', state.filter === 'todas' ? 'Nenhuma mensagem ainda' : 'Tudo lido', 'As mensagens enviadas pela página de contato aparecem aqui.').toString();
  }

  function open(id) {
    const msg = db.get('messages', id);
    if (!msg) return;
    if (!msg.read) db.update('messages', id, { read: true });
    const s = db.settings();
    const wa = U.validPhone(msg.phone) ? U.waLink(msg.phone, `Olá, ${U.firstName(msg.name)}! Aqui é da ${s.name}, sobre sua mensagem "${msg.subject}": `) : null;
    const m = UI.modal({
      title: msg.subject,
      body: html`
        <div class="detail-head">${UI.avatar(msg.name)}<div class="grow"><strong>${msg.name}</strong><span>${[msg.email, msg.phone].filter(Boolean).join(' · ')}</span></div></div>
        <p class="text-sm subtle">Recebida em ${U.fmtDateTime(msg.createdAt)}</p>
        <div class="msg-body">${msg.message}</div>`,
      footer: html`
        <div class="left cluster-sm">
          <button type="button" class="btn btn-ghost btn-sm" data-act="delete"><i class="bi bi-trash"></i>Excluir</button>
          <button type="button" class="btn btn-ghost btn-sm" data-act="unread"><i class="bi bi-envelope"></i>Marcar como não lida</button>
        </div>
        ${wa ? html`<a class="btn btn-whatsapp btn-sm" href="${wa}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i>WhatsApp</a>` : ''}
        <a class="btn btn-primary btn-sm" href="mailto:${msg.email}?subject=${encodeURIComponent(`Re: ${msg.subject}`)}"><i class="bi bi-reply"></i>Responder por e-mail</a>`,
    });
    m.foot.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'unread') {
        db.update('messages', id, { read: false });
        m.close();
      } else if (await UI.confirm({ title: 'Excluir mensagem', message: 'A mensagem será apagada.', confirmText: 'Excluir', danger: true })) {
        db.remove('messages', id);
        m.close();
        UI.toast('Mensagem excluída.', 'info');
      }
    });
  }

  document.addEventListener('click', (e) => {
    const row = e.target.closest('[data-msg]');
    if (row) return open(row.dataset.msg);
    const f = e.target.closest('[data-f]');
    if (f) {
      state.filter = f.dataset.f;
      $$('#filter button').forEach((b) => b.setAttribute('aria-pressed', String(b === f)));
      render();
    }
  });
  $('#f-q').addEventListener('input', U.debounce((e) => { state.q = e.target.value; render(); }, 150));

  render();
  P.onChange(render);
  if (location.hash.length > 1 && db.get('messages', location.hash.slice(1))) open(location.hash.slice(1));
});
