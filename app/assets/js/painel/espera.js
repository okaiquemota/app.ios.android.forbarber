/* Painel › Lista de espera: quem quer horário num dia cheio e as vagas que surgiram */
window.App.ready(function () {
  'use strict';
  const App = window.App;
  const P = App.painel;
  if (!P) return;
  const U = App.utils;
  const { html, raw, $ } = U;
  const db = App.db;
  const UI = App.ui;
  const W = App.waitlist;

  const svcNames = (w) => (w.serviceIds || []).map((id) => (db.service(id) || {}).name).filter(Boolean).join(' + ') || 'Serviço a combinar';

  function render() {
    const scope = P.scopeBarberId;
    const list = W.open().filter((w) => !scope || !w.barberId || w.barberId === scope);
    if (!list.length) {
      $('#wait-list').innerHTML = html`<section class="panel"><div class="panel-body">${UI.empty('bi-hourglass', 'Ninguém na lista de espera', 'Quando o dia lota, o cliente pode entrar na lista pelo agendamento online. Você também pode adicionar quem pediu no balcão ou no WhatsApp.')}</div></section>`.toString();
      return;
    }
    const days = [...new Set(list.map((w) => w.date))];
    const s = db.settings();
    $('#wait-list').innerHTML = html`${days.map((d) => html`
      <section class="panel">
        <div class="panel-head"><h2 class="panel-title"><i class="bi bi-calendar3" aria-hidden="true"></i>${U.fmtDateHuman(d)} · ${U.fmtDateLong(d)}</h2><span class="panel-sub">${list.filter((w) => w.date === d).length} na espera</span></div>
        <div class="panel-body flush">
          ${list.filter((w) => w.date === d).map((w) => {
            const c = db.user(w.clientId) || { name: 'Cliente', phone: '' };
            const free = W.freeSlots(w);
            const times = free.slice(0, 6).map((x) => x.time);
            const link = `${window.FORBARBER.publicRoot}agendar.html?servico=${(w.serviceIds || []).join(',')}${w.barberId ? `&profissional=${w.barberId}` : ''}&data=${w.date}${times[0] ? `&hora=${times[0]}` : ''}`;
            const msg = times.length
              ? `Olá, ${U.firstName(c.name)}! Aqui é da ${s.name}. Vagou horário ${U.fmtDateHuman(w.date).toLowerCase()} (${U.fmtDateShort(w.date)}): ${times.join(', ')}. Quer que eu marque? Ou agende direto: ${link}`
              : `Olá, ${U.firstName(c.name)}! Aqui é da ${s.name}. Você está na nossa lista de espera para ${U.fmtDateShort(w.date)}; assim que vagar um horário te aviso.`;
            return html`
              <div class="wait-row">
                <div class="cell-main grow">${UI.avatar(c.name, { size: 'sm' })}
                  <div class="grow"><strong>${c.name}</strong>
                    <span>${svcNames(w)} · ${W.PERIODS[w.period].label}${w.barberId ? ` · com ${U.firstName((db.barber(w.barberId) || {}).name || '')}` : ''}${w.notes ? ` · “${w.notes}”` : ''}</span></div>
                </div>
                <div class="wait-slots">
                  ${times.length
                    ? html`<span class="text-sm"><i class="bi bi-check-circle text-success"></i> Vagas: ${times.map((t) => html`<button type="button" class="chip chip-sm" data-book="${w.id}" data-time="${t}">${t}</button>`)}</span>`
                    : html`<span class="text-sm subtle">Sem vaga no período ainda</span>`}
                </div>
                <div class="actions">
                  ${w.status === 'avisado' ? html`<span class="badge badge-primary">Avisado</span>` : ''}
                  ${U.validPhone(c.phone) ? html`<a class="btn btn-whatsapp btn-sm" href="${U.waLink(c.phone, msg)}" target="_blank" rel="noopener" data-notify="${w.id}"><i class="bi bi-whatsapp"></i>Avisar</a>` : ''}
                  <button type="button" class="btn btn-ghost btn-icon btn-sm" data-remove="${w.id}" aria-label="Tirar da lista" title="Tirar da lista"><i class="bi bi-x-lg"></i></button>
                </div>
              </div>`;
          })}
        </div>
      </section>`)}`.toString();
  }

  function openNew() {
    const clients = db.clients().slice().sort((a, b) => a.name.localeCompare(b.name));
    const services = db.services({ active: true });
    const m = UI.modal({
      title: 'Adicionar à lista de espera',
      body: html`
        <form id="w-form" class="form-grid" novalidate>
          <div class="field full"><label class="label" for="w-client">Cliente</label>
            <select class="select" id="w-client" name="client"><option value="">Escolha o cliente</option>${clients.map((c) => html`<option value="${c.id}">${c.name}${c.phone ? ` · ${c.phone}` : ''}</option>`)}</select></div>
          <div class="field"><label class="label" for="w-date">Dia</label><input class="input" type="date" id="w-date" name="date" value="${U.today()}" min="${U.today()}"></div>
          <div class="field"><label class="label" for="w-period">Período</label><select class="select" id="w-period" name="period">${Object.entries(W.PERIODS).map(([k, v]) => html`<option value="${k}">${v.label}</option>`)}</select></div>
          <div class="field"><label class="label" for="w-svc">Serviço</label><select class="select" id="w-svc" name="service">${services.map((x) => html`<option value="${x.id}">${x.name}</option>`)}</select></div>
          <div class="field"><label class="label" for="w-barber">Profissional</label><select class="select" id="w-barber" name="barber"><option value="">Qualquer um</option>${db.barbers({ active: true }).map((b) => html`<option value="${b.id}">${b.name}</option>`)}</select></div>
          <div class="field full"><label class="label" for="w-notes">Observação <span class="opt">(opcional)</span></label><input class="input" id="w-notes" name="notes" maxlength="200"></div>
        </form>`,
      footer: html`<button type="button" class="btn btn-ghost" data-close>Cancelar</button><button type="button" class="btn btn-primary" data-save><i class="bi bi-check2"></i>Adicionar</button>`,
    });
    m.el.querySelector('[data-save]').addEventListener('click', () => {
      const form = $('#w-form', m.body);
      const data = UI.validate(form, { client: (v) => (v ? null : 'Escolha o cliente.'), date: (v) => (v && v >= U.today() ? null : 'Escolha um dia.') });
      if (!data) return;
      db.insert('waitlist', { clientId: data.client, date: data.date, period: data.period, serviceIds: [data.service], barberId: data.barber || null, notes: data.notes || '', status: 'aguardando' });
      m.close();
      UI.toast('Adicionado à lista de espera.');
    });
  }

  document.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('#new-wait')) return openNew();
    const notify = t.closest('[data-notify]');
    if (notify) db.update('waitlist', notify.dataset.notify, { status: 'avisado' });
    const rm = t.closest('[data-remove]');
    if (rm) {
      db.update('waitlist', rm.dataset.remove, { status: 'cancelado' });
      UI.toast('Removido da lista.', 'info');
      return;
    }
    const book = t.closest('[data-book]');
    if (book) {
      const w = db.get('waitlist', book.dataset.book);
      const slot = W.freeSlots(w).find((x) => x.time === book.dataset.time);
      P.openAppointmentForm({ clientId: w.clientId, date: w.date, time: book.dataset.time, barberId: w.barberId || (slot && slot.barberIds[0]) || undefined, serviceIds: w.serviceIds });
    }
  });

  render();
  P.onChange(render);
});
