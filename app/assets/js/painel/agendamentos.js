/* Lista de agendamentos com filtros, totais, ações rápidas e exportação CSV */
window.App.ready(function () {
  'use strict';
  const App = window.App;
  const P = App.painel;
  if (!P) return;
  const U = App.utils;
  const { html, $, $$ } = U;
  const db = App.db;
  const UI = App.ui;
  const B = App.booking;

  const PERIODS = [['hoje', 'Hoje'], ['amanha', 'Amanhã'], ['prox7', 'Próx. 7 dias'], ['30d', 'Últimos 30'], ['mes', 'Este mês'], ['todos', 'Tudo']];
  const state = {
    period: U.qs('status') === 'pendentes' ? 'todos' : 'prox7',
    status: U.qs('status') || '',
    barber: P.scopeBarberId || '',
    q: '',
    limit: 50,
  };

  $('#period').innerHTML = html`${PERIODS.map(([k, l]) => html`<button type="button" data-p="${k}" aria-pressed="${k === state.period}">${l}</button>`)}`.toString();
  $('#f-status').value = state.status;
  const barberSel = $('#f-barber');
  barberSel.innerHTML = html`<option value="">Toda a equipe</option>${db.barbers().map((b) => html`<option value="${b.id}">${b.name}</option>`)}`.toString();
  barberSel.value = state.barber;
  if (!P.isAdmin) barberSel.disabled = true;

  function filtered() {
    const p = P.period(state.period);
    const q = U.normalize(state.q);
    let list = db.appointments({ from: p.from, to: p.to, barberId: state.barber || undefined });
    if (state.status === 'pendentes') list = list.filter((a) => P.apptState(a) === 'late');
    else if (state.status) list = list.filter((a) => a.status === state.status);
    if (q) list = list.filter((a) => U.normalize(`${P.clientName(a.clientId)} ${P.servicesText(a)}`).includes(q));
    list.sort(db.byDateTime);
    const past = ['30d', 'todos'].includes(state.period);
    return past ? list.reverse() : list;
  }

  function render() {
    const list = filtered();
    const p = P.period(state.period);
    const done = list.filter((a) => a.status === 'concluido');
    const live = list.filter((a) => a.status === 'confirmado');
    $('#list-sub').textContent = `${p.label}${state.barber ? ` · ${(db.barber(state.barber) || {}).name}` : ''}`;
    $('#totals').innerHTML = html`
      <span><strong>${list.length}</strong> agendamentos</span>
      <span><strong>${U.money(U.sum(done, (a) => a.total))}</strong> realizado</span>
      <span><strong>${U.money(U.sum(live, (a) => a.total))}</strong> a receber</span>
      <span>${list.filter((a) => a.status === 'cancelado').length} cancelados · ${list.filter((a) => a.status === 'faltou').length} faltas</span>`.toString();
    if (!list.length) {
      $('#list').innerHTML = UI.empty('bi-calendar-x', 'Nada por aqui', 'Mude o período ou os filtros.').toString();
      return;
    }
    const rows = list.slice(0, state.limit);
    $('#list').innerHTML = html`
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Data</th><th>Cliente</th><th class="hide-md">Serviços</th><th class="hide-md">Profissional</th><th class="num">Valor</th><th>Situação</th><th><span class="sr-only">Ações</span></th></tr></thead>
        <tbody>${rows.map((a) => {
          const b = db.barber(a.barberId);
          const late = P.apptState(a) === 'late';
          return html`<tr class="clickable" data-open-appt="${a.id}">
            <td class="nowrap num"><strong>${U.fmtDateHuman(a.date)}</strong><br><span class="subtle">${a.start}–${P.endOf(a)}</span></td>
            <td><div class="cell-main">${UI.avatar(P.clientName(a.clientId), { size: 'sm' })}<div class="grow"><strong>${P.clientName(a.clientId)}</strong><span>${(db.user(a.clientId) || {}).phone || ''}</span></div></div></td>
            <td class="hide-md services-cell">${P.servicesText(a)}</td>
            <td class="hide-md">${b ? html`<span class="cluster-sm"><span class="dot" style="background:${b.color}"></span>${U.firstName(b.name)}</span>` : '—'}</td>
            <td class="num">${U.money(a.total)}</td>
            <td>${late ? html`<span class="badge badge-warning"><i class="bi bi-hourglass-split"></i>Concluir</span>` : UI.statusBadge(a.status)}</td>
            <td><div class="actions">${a.status === 'confirmado' ? html`<button type="button" class="btn btn-success btn-icon btn-sm" data-conclude="${a.id}" aria-label="Concluir" title="Concluir"><i class="bi bi-check2"></i></button>` : ''}</div></td>
          </tr>`;
        })}</tbody>
      </table></div>
      ${list.length > state.limit ? html`<div class="more-row"><button type="button" class="btn btn-outline btn-sm" id="more">Mostrar mais (${list.length - state.limit})</button></div>` : ''}`.toString();
  }

  document.addEventListener('click', (e) => {
    const conclude = e.target.closest('[data-conclude]');
    if (conclude) {
      e.stopPropagation();
      return P.openConclude(db.get('appointments', conclude.dataset.conclude));
    }
    const per = e.target.closest('[data-p]');
    if (per) {
      state.period = per.dataset.p;
      state.limit = 50;
      $$('#period button').forEach((b) => b.setAttribute('aria-pressed', String(b === per)));
      return render();
    }
    if (e.target.closest('#more')) {
      state.limit += 50;
      render();
    }
    if (e.target.closest('#export')) {
      const csv = U.toCSV(filtered(), [
        { label: 'Data', value: (a) => U.fmtDate(a.date) },
        { label: 'Início', value: (a) => a.start },
        { label: 'Fim', value: (a) => P.endOf(a) },
        { label: 'Cliente', value: (a) => P.clientName(a.clientId) },
        { label: 'Telefone', value: (a) => (db.user(a.clientId) || {}).phone || '' },
        { label: 'Serviços', value: (a) => P.servicesText(a) },
        { label: 'Profissional', value: (a) => (db.barber(a.barberId) || {}).name || '' },
        { label: 'Valor', value: (a) => U.number(a.total, 2) },
        { label: 'Situação', value: (a) => B.STATUS[a.status].label },
        { label: 'Pagamento', value: (a) => (a.paymentMethod ? B.PAYMENTS[a.paymentMethod].label : '') },
        { label: 'Origem', value: (a) => B.SOURCES[a.source] || a.source },
      ]);
      U.download(`agendamentos-${U.today()}.csv`, csv, 'text/csv;charset=utf-8');
    }
  }, true);
  $('#f-status').addEventListener('change', (e) => { state.status = e.target.value; render(); });
  barberSel.addEventListener('change', (e) => { state.barber = e.target.value; render(); });
  $('#f-q').addEventListener('input', U.debounce((e) => { state.q = e.target.value; render(); }, 150));

  render();
  P.onChange(render);
});
