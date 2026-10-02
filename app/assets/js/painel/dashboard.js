/* Painel inicial: resumo do dia, indicadores, faturamento, ranking e CRM (aniversários e reativação) */
window.App.ready(function () {
  'use strict';
  const App = window.App;
  const P = App.painel;
  if (!P) return;
  const U = App.utils;
  const { html, $ } = U;
  const db = App.db;
  const UI = App.ui;
  const B = App.booking;
  const C = App.charts;
  const scope = P.scopeBarberId || undefined;

  const concluded = (from, to) => db.appointments({ from, to, status: 'concluido', barberId: scope });

  function delta(cur, prev, label) {
    if (!prev) return html`<span>${label}</span>`;
    const d = (cur - prev) / prev;
    const cls = Math.abs(d) < 0.005 ? 'flat' : d > 0 ? 'up' : 'down';
    const icon = cls === 'up' ? 'bi-arrow-up-right' : cls === 'down' ? 'bi-arrow-down-right' : 'bi-dash';
    return html`<span class="delta ${cls}"><i class="bi ${icon}" aria-hidden="true"></i>${U.percent(Math.abs(d))}</span><span>${label}</span>`;
  }

  function renderHead(todays) {
    const me = P.me();
    const active = todays.filter((a) => a.status === 'confirmado' || a.status === 'concluido');
    const done = todays.filter((a) => a.status === 'concluido').length;
    const pending = todays.filter((a) => P.apptState(a) === 'late').length;
    const next = active.length - done - pending;
    $('#greeting').textContent = `${U.greeting()}, ${U.firstName(me.name)}`;
    const open = B.dayHours(U.today());
    $('#day-summary').textContent = !open
      ? 'A barbearia está fechada hoje. Bom descanso!'
      : active.length
        ? `${U.plural(active.length, 'atendimento', 'atendimentos')} ${P.isAdmin ? 'na barbearia' : 'na sua agenda'} hoje: ${done} ${done === 1 ? 'concluído' : 'concluídos'}, ${next} a seguir${pending ? `, ${pending} aguardando conclusão` : ''}.`
        : 'Nenhum atendimento marcado para hoje ainda.';
  }

  function renderKpis(todays) {
    const t = U.today();
    const doneToday = todays.filter((a) => a.status === 'concluido');
    const confirmedToday = todays.filter((a) => a.status === 'confirmado');
    const active = doneToday.length + confirmedToday.length;
    const realized = U.sum(doneToday, (a) => a.total);
    const expected = realized + U.sum(confirmedToday, (a) => a.total);

    // Mês até hoje vs. mesmo intervalo do mês anterior
    const monthStart = U.startOfMonth(t);
    const prevStart = U.addMonths(t, -1);
    const dayOfMonth = Number(t.slice(8, 10));
    const prevEnd = U.addDays(prevStart, Math.min(dayOfMonth, Number(U.endOfMonth(prevStart).slice(8, 10))) - 1);
    const mtd = concluded(monthStart, t);
    const prev = concluded(prevStart, prevEnd);
    const mtdTotal = U.sum(mtd, (a) => a.total);
    const prevTotal = U.sum(prev, (a) => a.total);
    const ticket = mtd.length ? mtdTotal / mtd.length : 0;
    const prevTicket = prev.length ? prevTotal / prev.length : 0;
    const prevMonthName = U.MONTHS[U.parseDate(prevStart).getMonth()];

    let fourth;
    if (P.isAdmin) {
      fourth = html`<div class="kpi"><span class="kpi-label"><i class="bi bi-receipt" aria-hidden="true"></i>Ticket médio no mês</span>
        <span class="kpi-value">${U.money(ticket)}</span><span class="kpi-sub">${delta(ticket, prevTicket, `vs. ${prevMonthName}`)}</span></div>`;
    } else {
      const b = db.barber(P.scopeBarberId) || { commission: 0 };
      fourth = html`<div class="kpi"><span class="kpi-label"><i class="bi bi-wallet2" aria-hidden="true"></i>Minha comissão no mês</span>
        <span class="kpi-value">${U.money((mtdTotal * (b.commission || 0)) / 100)}</span><span class="kpi-sub"><span>${b.commission || 0}% sobre ${U.money(mtdTotal)}</span></span></div>`;
    }

    $('#kpis').innerHTML = html`
      <div class="kpi"><span class="kpi-label"><i class="bi bi-calendar-check" aria-hidden="true"></i>Atendimentos hoje</span>
        <span class="kpi-value">${active}</span><span class="kpi-sub"><span>${doneToday.length} concluídos · ${confirmedToday.length} a seguir</span></span></div>
      <div class="kpi"><span class="kpi-label"><i class="bi bi-cash-coin" aria-hidden="true"></i>Faturamento hoje</span>
        <span class="kpi-value">${U.money(realized)}</span><span class="kpi-sub"><span>previsto ${U.money(expected)}</span></span></div>
      <div class="kpi"><span class="kpi-label"><i class="bi bi-graph-up-arrow" aria-hidden="true"></i>${P.isAdmin ? 'Faturamento no mês' : 'Meu faturamento no mês'}</span>
        <span class="kpi-value">${U.money(mtdTotal)}</span><span class="kpi-sub">${delta(mtdTotal, prevTotal, `vs. mesmo período de ${prevMonthName}`)}</span></div>
      ${fourth}`;
  }

  function renderToday(todays) {
    const list = todays.filter((a) => a.status !== 'cancelado');
    $('#today-sub').textContent = list.length ? `${list.length} na agenda` : '';
    $('#today-list').innerHTML = list.length
      ? html`<div class="appt-list">${list.map((a) => P.apptRowHTML(a, { showDate: false, showBarber: !scope }))}</div>`
      : UI.empty('bi-calendar2-check', 'Agenda livre hoje', B.dayHours(U.today()) ? 'Quando alguém agendar pelo site ou balcão, aparece aqui na hora.' : 'A barbearia não abre hoje.').toString();
  }

  function renderOccupancy() {
    const t = U.today();
    const hours = B.dayHours(t);
    const barbers = db.barbers({ active: true });
    if (!hours) {
      $('#occupancy').innerHTML = UI.empty('bi-moon-stars', 'Fechado hoje').toString();
      return;
    }
    $('#occupancy').innerHTML = html`<div class="meters">${barbers.map((b) => {
      if (!B.barberWorks(b, t)) {
        return html`<div class="meter-row"><span class="who">${P.barberAvatar(b)}<span>${b.name}</span></span><span class="val">folga</span><div class="meter"><span style="width:0"></span></div></div>`;
      }
      const blocked = U.sum(db.blocks({ date: t, barberId: b.id }), (bl) => U.toMin(bl.end) - U.toMin(bl.start));
      const capacity = Math.max(1, hours.close - hours.open - blocked);
      const booked = U.sum(db.appointments({ date: t, barberId: b.id, status: ['confirmado', 'concluido'] }), (a) => a.duration);
      const pct = Math.min(1, booked / capacity);
      return html`<div class="meter-row">
        <span class="who">${P.barberAvatar(b)}<span>${b.name}</span></span>
        <span class="val">${U.percent(pct)} · ${U.fmtDuration(booked)}</span>
        <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct * 100)}" aria-label="Ocupação de ${b.name}"><span style="width:${(pct * 100).toFixed(1)}%;--fill:${b.color}"></span></div>
      </div>`;
    })}</div>`;
  }

  function renderMessages() {
    const panel = $('#messages-panel');
    panel.hidden = !P.isAdmin;
    if (!P.isAdmin) return;
    const list = [...db.list('messages')].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 3);
    $('#messages').innerHTML = list.length
      ? html`<div class="mini-list">${list.map((m) => html`
          <a class="mini-row" href="mensagens.html#${m.id}">
            ${m.read ? UI.avatar(m.name, { size: 'sm' }) : html`<span class="unread-dot" aria-label="Não lida"></span>`}
            <span class="grow"><strong>${m.subject}</strong><span>${m.name} · ${U.relTime(m.createdAt)}</span></span>
          </a>`)}</div>`
      : UI.empty('bi-inbox', 'Nenhuma mensagem').toString();
  }

  function renderRevenue() {
    const t = U.today();
    const from = U.addDays(t, -29);
    const byDay = U.groupBy(concluded(from, t), (a) => a.date);
    const data = [];
    for (let i = 0; i < 30; i++) {
      const d = U.addDays(from, i);
      const list = byDay[d] || [];
      data.push({
        date: d,
        label: U.fmtDateMedium(d),
        short: U.fmtDateShort(d),
        value: U.sum(list, (a) => a.total),
        sub: d === t ? `${list.length} atendimentos · dia em andamento` : `${list.length} atendimentos`,
        muted: d === t,
      });
    }
    const total = U.sum(data, (d) => d.value);
    const best = data.reduce((m, d) => (d.value > m.value ? d : m), data[0]);
    $('#rev-sub').textContent = `${U.money(total)} no período · melhor dia ${best.value ? `${best.label} (${U.money(best.value)})` : '—'}`;
    C.columns($('#rev-chart'), data, { ariaLabel: 'Faturamento diário dos últimos 30 dias', height: 240 });
    $('#rev-table').innerHTML = C.tableHTML([...data].reverse(), { labelHead: 'Dia', valueHead: 'Faturamento' }).toString();
  }

  function renderTopServices() {
    const t = U.today();
    const counts = {};
    concluded(U.startOfMonth(t), t).forEach((a) =>
      a.services.forEach((s) => {
        counts[s.name] = counts[s.name] || { n: 0, v: 0 };
        counts[s.name].n++;
        counts[s.name].v += s.price;
      })
    );
    const rows = Object.entries(counts)
      .map(([label, c]) => ({ label, value: c.n, display: `${c.n} · ${U.money(c.v)}` }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
    C.hbars($('#top-services'), rows);
  }

  function renderCRM() {
    const t = U.today();
    const month = t.slice(5, 7);
    const s = db.settings();
    const stats = db.clientStatsMap();
    const bdays = db.clients()
      .filter((c) => c.birthday && c.birthday.slice(5, 7) === month)
      .sort((a, b) => a.birthday.slice(8) - b.birthday.slice(8))
      .slice(0, 8);
    $('#birthdays').innerHTML = bdays.length
      ? html`<div class="mini-list">${bdays.map((c) => {
          const day = c.birthday.slice(8, 10);
          const age = Number(t.slice(0, 4)) - Number(c.birthday.slice(0, 4));
          const isToday = c.birthday.slice(5) === t.slice(5);
          const msg = `Feliz aniversário, ${U.firstName(c.name)}! A ${s.name} te deseja um ótimo dia. Seu presente: 20% de desconto no próximo corte este mês.`;
          return html`<div class="mini-row">
            ${UI.avatar(c.name, { size: 'sm' })}
            <span class="grow"><strong>${c.name}</strong><span>${isToday ? 'Hoje!' : `Dia ${day}`} · ${age} anos</span></span>
            ${U.validPhone(c.phone) ? html`<a class="btn btn-whatsapp btn-xs" href="${U.waLink(c.phone, msg)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i>Parabéns</a>` : ''}
          </div>`;
        })}</div>`
      : UI.empty('bi-cake2', 'Ninguém faz aniversário este mês').toString();

    const limit = U.addDays(t, -45);
    const lost = db.clients()
      .map((c) => ({ c, st: stats.get(c.id) }))
      .filter(({ st }) => st && st.lastVisit && st.lastVisit < limit && !st.upcoming)
      .sort((a, b) => b.st.visits - a.st.visits)
      .slice(0, 8);
    $('#reactivate').innerHTML = lost.length
      ? html`<div class="mini-list">${lost.map(({ c, st }) => {
          const days = U.diffDays(st.lastVisit, t);
          const msg = `Oi, ${U.firstName(c.name)}! Faz um tempinho que você não aparece na ${s.name}. Que tal deixar o visual em dia? Agende pelo site ou responda esta mensagem.`;
          return html`<div class="mini-row">
            ${UI.avatar(c.name, { size: 'sm' })}
            <span class="grow"><strong>${c.name}</strong><span>Última visita há ${days} dias · ${U.plural(st.visits, 'visita', 'visitas')}</span></span>
            ${U.validPhone(c.phone) ? html`<a class="btn btn-whatsapp btn-xs" href="${U.waLink(c.phone, msg)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i>Chamar</a>` : ''}
          </div>`;
        })}</div>`
      : UI.empty('bi-emoji-smile', 'Todos os clientes em dia', 'Nenhum cliente sumido há mais de 45 dias.').toString();
  }

  /* ---------- Primeiros passos (barbearia recém-criada na nuvem) ---------- */
  function renderStart() {
    const s = db.settings();
    let el = $('#start');
    if (!P.isAdmin || !db.isCloud() || s.onboardingDone) {
      if (el) el.remove();
      return;
    }
    const link = window.FORBARBER.appRoot;
    const steps = [
      { done: false, icon: 'bi-scissors', href: 'servicos.html', title: 'Confira serviços e preços', text: 'Já criamos corte, barba e combo. Troque valores e tempos.' },
      { done: false, icon: 'bi-clock', href: 'configuracoes.html', title: 'Ajuste os horários', text: 'Dias de funcionamento, intervalo entre horários e antecedência.' },
      { done: !!s.logo, icon: 'bi-image', href: 'configuracoes.html', title: 'Coloque seu logo', text: 'Ele vira o ícone do app no celular dos clientes.' },
      { done: db.barbers().length > 1 || db.invites().length > 0, icon: 'bi-person-plus', href: 'equipe.html', title: 'Convide a equipe', text: 'Cada barbeiro recebe o próprio acesso.' },
    ];
    if (!el) {
      el = document.createElement('section');
      el.id = 'start';
      el.className = 'panel';
      el.setAttribute('aria-labelledby', 'start-title');
      $('.page-head').after(el);
    }
    const share = `Agende seu horário na ${s.name} pelo link: ${link}`;
    el.innerHTML = html`
      <div class="panel-head">
        <h2 class="panel-title" id="start-title"><i class="bi bi-rocket-takeoff" aria-hidden="true"></i>Primeiros passos</h2>
        <button type="button" class="btn btn-ghost btn-xs" data-start-hide>Ocultar</button>
      </div>
      <div class="panel-body start-body">
        <ol class="start-steps">
          ${steps.map((st) => html`<li class="${st.done ? 'is-done' : ''}"><a href="${st.href}">
            <i class="bi ${st.done ? 'bi-check-circle-fill' : st.icon}" aria-hidden="true"></i>
            <span><strong>${st.title}</strong><small>${st.text}</small></span></a></li>`)}
        </ol>
        <div class="start-link">
          <span class="label">Seu link de agendamento</span>
          <a class="link" href="${link}" target="_blank" rel="noopener">${link.replace(/^https?:\/\//, '')}</a>
          <div class="cluster-sm">
            <button type="button" class="btn btn-outline btn-sm" data-start-copy><i class="bi bi-copy"></i>Copiar</button>
            <a class="btn btn-whatsapp btn-sm" href="https://wa.me/?text=${encodeURIComponent(share)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i>Enviar</a>
          </div>
          <span class="help">Coloque na bio do Instagram e na mensagem automática do WhatsApp.</span>
        </div>
      </div>`;
    el.querySelector('[data-start-copy]').addEventListener('click', async () => {
      UI.toast((await U.copyText(link)) ? 'Link copiado.' : 'Não deu para copiar. Segure o link para copiar.', 'info');
    });
    el.querySelector('[data-start-hide]').addEventListener('click', () => db.saveSettings({ onboardingDone: true }));
  }

  function render() {
    renderStart();
    const todays = db.appointments({ date: U.today(), barberId: scope }).sort(db.byDateTime);
    renderHead(todays);
    renderKpis(todays);
    renderToday(todays);
    renderOccupancy();
    renderMessages();
    renderRevenue();
    renderTopServices();
    renderCRM();
  }

  render();
  P.onChange(render);
  setInterval(() => {
    if (!document.querySelector('dialog[open]')) render();
  }, 60000);
});
