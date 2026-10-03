/* Financeiro: faturamento, comissões, serviços, formas de pagamento e horários de pico */
window.App.ready(function () {
  'use strict';
  const App = window.App;
  const P = App.painel;
  if (!P) return;
  const U = App.utils;
  const { html, $, $$ } = U;
  const db = App.db;
  const B = App.booking;
  const C = App.charts;

  const PERIODS = [['7d', '7 dias'], ['30d', '30 dias'], ['mes', 'Este mês'], ['mes-passado', 'Mês passado'], ['ano', 'Este ano'], ['custom', 'Personalizado']];
  const state = { period: '30d', barber: '', from: U.addDays(U.today(), -13), to: U.today() };

  $('#period').innerHTML = html`${PERIODS.map(([k, l]) => html`<button type="button" data-p="${k}" aria-pressed="${k === state.period}">${l}</button>`)}`.toString();
  $('#f-barber').innerHTML = html`<option value="">Toda a equipe</option>${db.barbers().map((b) => html`<option value="${b.id}">${b.name}</option>`)}`.toString();
  $('#from').value = state.from;
  $('#to').value = state.to;

  const range = () => {
    const p = P.period(state.period, { from: state.from, to: state.to });
    // "Este mês"/"Este ano" param no dia de hoje para não contar o futuro
    return { ...p, to: p.to > U.today() ? U.today() : p.to };
  };
  const previous = (r) => {
    const len = U.diffDays(r.from, r.to) + 1;
    return { from: U.addDays(r.from, -len), to: U.addDays(r.from, -1) };
  };
  const query = (r, status) => db.appointments({ from: r.from, to: r.to, barberId: state.barber || undefined, status });

  function delta(cur, prev) {
    if (!prev) return html`<span>sem período anterior</span>`;
    const d = (cur - prev) / prev;
    const cls = Math.abs(d) < 0.005 ? 'flat' : d > 0 ? 'up' : 'down';
    return html`<span class="delta ${cls}"><i class="bi ${cls === 'up' ? 'bi-arrow-up-right' : cls === 'down' ? 'bi-arrow-down-right' : 'bi-dash'}"></i>${U.percent(Math.abs(d))}</span><span>vs. período anterior</span>`;
  }

  function render() {
    const r = range();
    const pr = previous(r);
    const done = query(r, 'concluido');
    const prevDone = query(pr, 'concluido');
    const noShows = query(r, 'faltou').length;
    // Clube: mensalidades entram no faturamento; a comissão do atendimento do clube usa o preço de tabela
    const clubIn = (x) => (state.barber ? 0 : U.sum(App.club.payments().filter((p) => p.paidAt.slice(0, 10) >= x.from && p.paidAt.slice(0, 10) <= x.to), (p) => p.amount));
    const clubRevenue = clubIn(r);
    const revenue = U.sum(done, (a) => a.total) + clubRevenue;
    const prevRevenue = U.sum(prevDone, (a) => a.total) + clubIn(pr);
    const commissionOf = (a) => ((a.total + (a.clubValue || 0)) * ((db.barber(a.barberId) || {}).commission || 0)) / 100;
    const commission = U.sum(done, commissionOf);
    const ticket = done.length ? revenue / done.length : 0;
    const prevTicket = prevDone.length ? prevRevenue / prevDone.length : 0;
    $('#period-label').textContent = `${r.label} · ${U.fmtDate(r.from)} a ${U.fmtDate(r.to)}${state.barber ? ` · ${(db.barber(state.barber) || {}).name}` : ''}`;

    $('#kpis').innerHTML = html`
      <div class="kpi"><span class="kpi-label"><i class="bi bi-cash-coin"></i>Faturamento</span><span class="kpi-value">${U.money(revenue)}</span><span class="kpi-sub">${delta(revenue, prevRevenue)}${clubRevenue ? html`<span>· ${U.money(clubRevenue)} do clube</span>` : ''}</span></div>
      <div class="kpi"><span class="kpi-label"><i class="bi bi-receipt"></i>Ticket médio</span><span class="kpi-value">${U.money(ticket)}</span><span class="kpi-sub">${delta(ticket, prevTicket)}</span></div>
      <div class="kpi"><span class="kpi-label"><i class="bi bi-wallet2"></i>Comissões a pagar</span><span class="kpi-value">${U.money(commission)}</span><span class="kpi-sub"><span>líquido da casa ${U.money(revenue - commission)}</span></span></div>
      <div class="kpi"><span class="kpi-label"><i class="bi bi-person-x"></i>Faltas</span><span class="kpi-value">${noShows}</span><span class="kpi-sub"><span>${U.percent(noShows / Math.max(1, noShows + done.length), 1)} dos atendimentos · ${done.length} concluídos</span></span></div>`.toString();

    // Faturamento por dia (ou por mês quando o período é longo)
    const days = U.diffDays(r.from, r.to) + 1;
    const byMonth = days > 62;
    const groups = U.groupBy(done, (a) => (byMonth ? a.date.slice(0, 7) : a.date));
    const data = [];
    if (byMonth) {
      for (let d = U.startOfMonth(r.from); d <= r.to; d = U.addMonths(d, 1)) {
        const list = groups[d.slice(0, 7)] || [];
        data.push({ label: U.monthLabel(d), short: U.MONTHS_SHORT[U.parseDate(d).getMonth()], value: U.sum(list, (a) => a.total), sub: `${list.length} atendimentos` });
      }
    } else {
      for (let i = 0; i < days; i++) {
        const d = U.addDays(r.from, i);
        const list = groups[d] || [];
        data.push({ label: U.fmtDateMedium(d), short: U.fmtDateShort(d), value: U.sum(list, (a) => a.total), sub: `${list.length} atendimentos` });
      }
    }
    $('#chart-sub').textContent = byMonth ? 'Agrupado por mês' : `${days} dias`;
    C.columns($('#chart'), data, { ariaLabel: 'Faturamento no período', height: 250 });
    $('#chart-table').innerHTML = C.tableHTML(data, { labelHead: byMonth ? 'Mês' : 'Dia', valueHead: 'Faturamento' }).toString();

    // Por profissional
    const perBarber = db.barbers().map((b) => {
      const list = done.filter((a) => a.barberId === b.id);
      const v = U.sum(list, (a) => a.total);
      return { b, n: list.length, v, c: U.sum(list, commissionOf) };
    }).filter((x) => x.n || !state.barber).filter((x) => !state.barber || x.b.id === state.barber);
    const maxV = Math.max(1, ...perBarber.map((x) => x.v));
    $('#by-barber').innerHTML = html`<div class="table-wrap"><table class="table">
      <thead><tr><th>Profissional</th><th class="num">Atend.</th><th class="num">Faturamento</th><th class="num hide-md">Ticket</th><th class="num">Comissão</th><th class="hide-md" style="width:28%"><span class="sr-only">Participação</span></th></tr></thead>
      <tbody>${perBarber.map((x) => html`<tr>
        <td><div class="cell-main">${P.barberAvatar(x.b)}<div class="grow"><strong>${x.b.name}</strong><span>${x.b.commission || 0}% de comissão</span></div></div></td>
        <td class="num">${x.n}</td><td class="num">${U.money(x.v)}</td><td class="num hide-md">${U.money(x.n ? x.v / x.n : 0)}</td><td class="num">${U.money(x.c)}</td>
        <td class="hide-md"><div class="hbar-track" aria-hidden="true"><div class="hbar-fill" style="width:${((x.v / maxV) * 100).toFixed(1)}%;--fill:${x.b.color}"></div></div></td>
      </tr>`)}</tbody>
      <tfoot><tr><td>Total</td><td class="num">${done.length}</td><td class="num">${U.money(revenue)}</td><td class="num hide-md">${U.money(ticket)}</td><td class="num">${U.money(commission)}</td><td class="hide-md"></td></tr></tfoot>
    </table></div>`.toString();

    // Por serviço
    const svc = {};
    done.forEach((a) => a.services.forEach((s) => {
      svc[s.name] = svc[s.name] || { n: 0, v: 0 };
      svc[s.name].n++;
      svc[s.name].v += s.price;
    }));
    const svcRows = Object.entries(svc).map(([label, x]) => ({ label, value: x.v, display: `${U.money(x.v)} · ${x.n}x` })).sort((a, b) => b.value - a.value).slice(0, 8);
    C.hbars($('#by-service'), svcRows);

    // Formas de pagamento
    const pays = Object.entries(B.PAYMENTS).map(([k, p], i) => ({ label: p.label, value: U.sum(done.filter((a) => a.paymentMethod === k), (a) => a.total), color: C.CATEGORICAL[i] }));
    C.stacked($('#by-payment'), pays);

    // Horários de pico (dia da semana × hora)
    const open = [1, 2, 3, 4, 5, 6, 0].filter((d) => !db.settings().hours[d].closed);
    const hoursList = open.map((d) => db.settings().hours[d]);
    const h0 = Math.floor(Math.min(...hoursList.map((h) => U.toMin(h.open))) / 60);
    const h1 = Math.ceil(Math.max(...hoursList.map((h) => U.toMin(h.close))) / 60);
    const cols = [];
    for (let h = h0; h < h1; h++) cols.push(`${h}h`);
    const rows = open.map((d) => ({
      label: U.WEEKDAYS_SHORT[d],
      values: cols.map((_, j) => done.filter((a) => U.weekday(a.date) === d && Math.floor(U.toMin(a.start) / 60) === h0 + j).length),
    }));
    C.heatmap($('#heatmap'), { rows, cols, format: (v) => `${v} ${v === 1 ? 'atendimento' : 'atendimentos'}` });
  }

  document.addEventListener('click', (e) => {
    const per = e.target.closest('[data-p]');
    if (per) {
      state.period = per.dataset.p;
      $$('#period button').forEach((b) => b.setAttribute('aria-pressed', String(b === per)));
      $('#custom').hidden = state.period !== 'custom';
      return render();
    }
    if (e.target.closest('#export')) {
      const r = range();
      const csv = U.toCSV(query(r, 'concluido').sort(db.byDateTime), [
        { label: 'Data', value: (a) => U.fmtDate(a.date) },
        { label: 'Horário', value: (a) => a.start },
        { label: 'Cliente', value: (a) => P.clientName(a.clientId) },
        { label: 'Serviços', value: (a) => P.servicesText(a) },
        { label: 'Profissional', value: (a) => (db.barber(a.barberId) || {}).name || '' },
        { label: 'Pagamento', value: (a) => (a.paymentMethod ? B.PAYMENTS[a.paymentMethod].label : '') },
        { label: 'Valor', value: (a) => U.number(a.total, 2) },
        { label: 'Comissão', value: (a) => U.number(((a.total + (a.clubValue || 0)) * ((db.barber(a.barberId) || {}).commission || 0)) / 100, 2) },
      ]);
      U.download(`financeiro-${r.from}-a-${r.to}.csv`, csv, 'text/csv;charset=utf-8');
    }
  });
  $('#f-barber').addEventListener('change', (e) => { state.barber = e.target.value; render(); });
  ['from', 'to'].forEach((k) => $(`#${k}`).addEventListener('change', (e) => {
    state[k] = e.target.value;
    if (state.from > state.to) [state.from, state.to] = [state.to, state.from];
    render();
  }));

  render();
  P.onChange(render);
});
