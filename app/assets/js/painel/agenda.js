/* Agenda visual: dia (uma coluna por profissional) ou semana (um profissional, sete dias) */
window.App.ready(function () {
  'use strict';
  const App = window.App;
  const P = App.painel;
  if (!P) return;
  const U = App.utils;
  const { html, $, $$ } = U;
  const db = App.db;
  const B = App.booking;

  const SLOT_H = 52;
  const state = {
    date: U.qs('data') || U.today(),
    view: 'dia',
    barber: P.scopeBarberId || '',
    showCancelled: false,
  };

  function columns() {
    const barbers = db.barbers({ active: true });
    if (state.view === 'semana') {
      const barberId = state.barber || P.scopeBarberId || (barbers[0] || {}).id;
      const start = U.startOfWeek(state.date);
      return Array.from({ length: 7 }, (_, i) => ({ date: U.addDays(start, i), barber: db.barber(barberId) }));
    }
    return barbers.filter((b) => !state.barber || b.id === state.barber).map((b) => ({ date: state.date, barber: b }));
  }

  function render() {
    const cols = columns();
    const interval = Number(db.settings().slotInterval) || 30;
    const ppm = SLOT_H / interval;
    const hours = cols.map((c) => B.dayHours(c.date)).filter(Boolean);
    const open = hours.length ? Math.min(...hours.map((h) => h.open)) : 9 * 60;
    const close = hours.length ? Math.max(...hours.map((h) => h.close)) : 19 * 60;
    const top = Math.floor(open / 60) * 60;
    const bottom = Math.ceil(close / 60) * 60;
    const height = (bottom - top) * ppm;
    const t = U.today();

    // Cabeçalho da página
    if (state.view === 'semana') {
      const s = U.startOfWeek(state.date);
      const b = cols[0] && cols[0].barber;
      $('#agenda-date').innerHTML = html`Semana de ${U.fmtDateShort(s)} a ${U.fmtDateShort(U.addDays(s, 6))}<small>${b ? b.name : ''}</small>`.toString();
    } else {
      const n = db.appointments({ date: state.date, status: ['confirmado', 'concluido'], barberId: state.barber || undefined });
      $('#agenda-date').innerHTML = html`${U.fmtDateHuman(state.date)} · ${U.fmtDateLong(state.date)}<small>${B.dayHours(state.date) ? `${U.plural(n.length, 'atendimento', 'atendimentos')} · ${U.money(U.sum(n, (a) => a.total))} previstos` : 'Barbearia fechada neste dia'}</small>`.toString();
    }
    $('#agenda-pick').value = state.date;
    $$('#agenda-view button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));

    const times = [];
    for (let m = top; m < bottom; m += interval) times.push(html`<div>${m % 60 === 0 ? U.fromMin(m) : ''}</div>`);

    const grid = $('#agenda');
    // No celular as colunas ficam mais estreitas para caber mais gente na tela
    const colMin = window.matchMedia('(max-width: 639px)').matches ? 132 : 170;
    grid.style.gridTemplateColumns = `56px repeat(${cols.length}, minmax(${colMin}px, 1fr))`;
    grid.style.setProperty('--slot-h', `${SLOT_H}px`);
    grid.innerHTML = html`
      <div class="agenda-corner" style="grid-row:1;grid-column:1"></div>
      ${cols.map((c, i) => {
        const label = state.view === 'semana' ? html`<div class="grow"><strong>${U.WEEKDAYS[U.weekday(c.date)]}</strong><span>${U.fmtDateShort(c.date)}</span></div>` : html`${P.barberAvatar(c.barber)}<div class="grow"><strong>${c.barber.name}</strong><span>${c.barber.specialty}</span></div>`;
        return html`<div class="agenda-head ${c.date === t && state.view === 'semana' ? 'is-today' : ''}" style="grid-row:1;grid-column:${i + 2}">${label}</div>`;
      })}
      <div class="agenda-times" style="grid-row:2;grid-column:1">${times}</div>
      ${cols.map((c, i) => {
        const works = c.barber && B.barberWorks(c.barber, c.date);
        const h = B.dayHours(c.date);
        const events = !c.barber ? [] : db.appointments({ date: c.date, barberId: c.barber.id })
          .filter((a) => state.showCancelled || a.status !== 'cancelado');
        const blocks = !c.barber ? [] : db.blocks({ date: c.date, barberId: c.barber.id });
        const closedSpans = h ? [[top, h.open], [h.close, bottom]].filter(([a, b]) => b > a) : [[top, bottom]];
        const nowLine = c.date === t && U.nowMin() > top && U.nowMin() < bottom ? (U.nowMin() - top) * ppm : null;
        return html`<div class="agenda-col ${works ? '' : 'off'}" style="grid-row:2;grid-column:${i + 2};height:${height}px" data-date="${c.date}" data-barber="${c.barber ? c.barber.id : ''}">
          ${!works ? html`<div class="off-label">${h ? 'Folga' : 'Fechado'}</div>` : ''}
          ${works ? closedSpans.map(([a, b]) => html`<div class="ev is-block" style="top:${(a - top) * ppm}px;height:${(b - a) * ppm}px;left:0;right:0;border-radius:0;opacity:.5;pointer-events:none" aria-hidden="true"></div>`) : ''}
          ${blocks.map((bl) => html`<button type="button" class="ev is-block" data-block="${bl.id}" style="top:${(U.toMin(bl.start) - top) * ppm}px;height:${Math.max(22, (U.toMin(bl.end) - U.toMin(bl.start)) * ppm - 2)}px">
              <span class="ev-time"><i class="bi bi-slash-circle"></i>${bl.start}–${bl.end}</span><span class="ev-svc">${bl.reason}</span></button>`)}
          ${events.map((a) => {
            const st = B.STATUS[a.status];
            const hpx = Math.max(22, a.duration * ppm - 2);
            return html`<button type="button" class="ev st-${a.status} ${hpx < 44 ? 'compact' : ''}" data-open-appt="${a.id}" style="top:${(U.toMin(a.start) - top) * ppm + 1}px;height:${hpx}px"
                aria-label="${P.clientName(a.clientId)}, ${a.start}, ${st.label}">
              <span class="ev-time"><i class="bi ${st.icon}"></i>${a.start}–${P.endOf(a)}</span>
              <span class="ev-client">${P.clientName(a.clientId)}</span>
              ${hpx >= 60 ? html`<span class="ev-svc">${P.servicesText(a)}</span>` : ''}
            </button>`;
          })}
          ${nowLine !== null ? html`<div class="now-line" style="top:${nowLine}px"></div>` : ''}
        </div>`;
      })}`.toString();

    // Rola até o horário atual (ou abertura) na primeira renderização
    if (!render.scrolled) {
      render.scrolled = true;
      const target = state.date === t ? Math.max(0, (U.nowMin() - top - 60) * ppm) : 0;
      $('.agenda-wrap').scrollTop = target;
    }
  }

  function fillBarbers() {
    const sel = $('#agenda-barber');
    const barbers = db.barbers({ active: true });
    sel.innerHTML = html`${state.view === 'dia' ? html`<option value="">Toda a equipe</option>` : ''}${barbers.map((b) => html`<option value="${b.id}">${b.name}</option>`)}`.toString();
    if (state.view === 'semana' && !state.barber) state.barber = P.scopeBarberId || (barbers[0] || {}).id || '';
    sel.value = state.barber;
  }

  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      const n = Number(nav.dataset.nav);
      state.date = n === 0 ? U.today() : U.addDays(state.date, n * (state.view === 'semana' ? 7 : 1));
      render.scrolled = n !== 0;
      return render();
    }
    const view = e.target.closest('[data-view]');
    if (view) {
      state.view = view.dataset.view;
      fillBarbers();
      return render();
    }
    const block = e.target.closest('[data-block]');
    if (block) return P.openBlock(block.dataset.block);
    if (e.target.closest('#agenda-block')) return P.openBlockForm({ date: state.date, barberId: state.barber || P.scopeBarberId });
    const col = e.target.closest('.agenda-col');
    if (col && !col.classList.contains('off') && !e.target.closest('.ev')) {
      const interval = Number(db.settings().slotInterval) || 30;
      const rect = col.getBoundingClientRect();
      const hours = columns().map((c) => B.dayHours(c.date)).filter(Boolean);
      const top = Math.floor((hours.length ? Math.min(...hours.map((h) => h.open)) : 540) / 60) * 60;
      const min = top + Math.floor((e.clientY - rect.top) / SLOT_H) * interval;
      P.openAppointmentForm({ date: col.dataset.date, barberId: col.dataset.barber, time: U.fromMin(min) });
    }
  });
  $('#agenda-pick').addEventListener('change', (e) => {
    if (!e.target.value) return;
    state.date = e.target.value;
    render();
  });
  $('#agenda-barber').addEventListener('change', (e) => {
    state.barber = e.target.value;
    render();
  });
  $('#agenda-cancel').addEventListener('change', (e) => {
    state.showCancelled = e.target.checked;
    render();
  });

  fillBarbers();
  render();
  P.onChange(render);
  setInterval(render, 60000);
});
