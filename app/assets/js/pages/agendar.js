/* ==========================================================================
   AGENDAMENTO ONLINE — 4 etapas: serviços → profissional → data/hora → confirmação
   Aceita parâmetros na URL:
     ?servico=s-corte,s-barba  ?profissional=b-rodrigo  ?data=AAAA-MM-DD&hora=HH:MM
     ?remarcar=<id do agendamento>   ?retomar=1 (volta do login com as escolhas salvas)
   ========================================================================== */
window.App.ready(function () {
  'use strict';
  const App = window.App;
  const U = App.utils;
  const { html, raw, $, $$ } = U;
  const db = App.db;
  const UI = App.ui;
  const B = App.booking;
  const auth = App.auth;

  const DRAFT_KEY = 'barbearia:booking-draft';
  const STEPS = ['Serviços', 'Profissional', 'Data e horário', 'Confirmação'];
  const RESUME_URL = 'agendar.html?retomar=1';

  const state = { step: 1, services: [], barberId: null, date: null, time: null, notes: '', reschedule: null, done: null };

  /* ---------- Rascunho (sobrevive ao login/cadastro) ---------- */
  const saveDraft = () => {
    try { window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch (e) { /* ignora */ }
  };
  const loadDraft = () => {
    try { return JSON.parse(window.sessionStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { return null; }
  };
  const clearDraft = () => {
    try { window.sessionStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignora */ }
  };

  /* ---------- Cálculos ---------- */
  const selectedServices = () => state.services.map((id) => db.service(id)).filter((s) => s && s.active);
  const duration = () => U.sum(selectedServices(), (s) => s.duration);
  /** Clube: o que o plano do cliente logado cobre nesta escolha */
  const coverageNow = () => {
    const u = auth.current();
    if (!u || auth.isStaff(u)) return null;
    const c = App.club.coverage({ clientId: u.id, serviceIds: state.services, date: state.date || U.today(), ignoreId: state.reschedule });
    return c.applies ? c : null;
  };
  const clubOf = () => {
    const u = auth.current();
    if (!u || auth.isStaff(u)) return null;
    const sub = App.club.subscriptionOf(u.id);
    return sub && App.club.state(sub) === 'ativa' ? { sub, plan: App.club.plan(sub.planId), left: App.club.usesLeft(sub, state.reschedule) } : null;
  };
  const listTotal = () => U.sum(selectedServices(), (s) => s.price);
  const total = () => App.club.price(selectedServices(), coverageNow()).total;
  const depositNow = () => {
    const u = auth.current();
    if (!u || auth.isStaff(u)) return 0;
    const old = state.reschedule && db.get('appointments', state.reschedule);
    if (old && old.depositStatus === 'pago') return 0;
    return App.deposit.amountFor({ clientId: u.id, total: total() });
  };
  const endTime = () => (state.time ? U.fromMin(U.toMin(state.time) + duration()) : '');
  const barberLabel = () => (state.barberId === 'any' ? 'Primeiro disponível' : (db.barber(state.barberId) || {}).name || '');
  const slotList = (date) =>
    state.barberId === 'any'
      ? B.slotsAny({ date, duration: duration(), ignoreId: state.reschedule })
      : B.slots({ date, barberId: state.barberId, duration: duration(), ignoreId: state.reschedule });
  const isSlotValid = () => {
    if (!state.date || !state.time || !duration()) return false;
    const s = slotList(state.date).find((x) => x.time === state.time);
    return !!(s && s.available);
  };
  function canGo(step) {
    if (step <= 1) return true;
    if (step === 2) return selectedServices().length > 0;
    if (step === 3) return canGo(2) && !!state.barberId;
    if (step === 4) return canGo(3) && !!state.date && !!state.time;
    return false;
  }

  /** Dias da janela de agendamento com a quantidade de horários livres */
  function dayList() {
    const span = Number(db.settings().bookingWindow) || 30;
    const t = U.today();
    const out = [];
    for (let i = 0; i <= span; i++) {
      const date = U.addDays(t, i);
      const free = duration() ? slotList(date).filter((s) => s.available).length : 0;
      out.push({ date, free, index: i });
    }
    return out;
  }

  /* ---------- Inicialização ---------- */
  function init() {
    const params = new URLSearchParams(location.search);
    const draft = params.get('retomar') ? loadDraft() : null;
    if (draft) {
      Object.assign(state, draft, { done: null });
    } else {
      clearDraft();
      const svc = params.get('servico');
      if (svc) state.services = svc.split(',').filter((id) => (db.service(id) || {}).active);
      const prof = params.get('profissional');
      if (prof && (db.barber(prof) || {}).active) state.barberId = prof;
      if (params.get('data') && params.get('hora')) {
        state.date = params.get('data');
        state.time = params.get('hora');
      }
      const resched = params.get('remarcar');
      const user = auth.current();
      if (resched && user) {
        const a = db.get('appointments', resched);
        if (a && a.clientId === user.id && a.status === 'confirmado') {
          state.reschedule = a.id;
          state.services = a.services.map((s) => s.id).filter((id) => (db.service(id) || {}).active);
          state.barberId = (db.barber(a.barberId) || {}).active ? a.barberId : 'any';
        }
      }
      state.step = 1;
      if (canGo(2)) state.step = 2;
      if (canGo(3)) state.step = 3;
      if (canGo(4)) state.step = 4;
    }
    if (state.step === 4 && !isSlotValid()) {
      if (state.time) UI.toast('Aquele horário não está mais livre. Escolha outro, por favor.', 'info');
      state.time = null;
      state.step = canGo(3) ? 3 : 1;
    }
    render();
  }

  function go(step) {
    if (step === 4 && !isSlotValid()) {
      UI.toast('Esse horário não está mais disponível. Escolha outro.', 'error');
      state.time = null;
      step = 3;
    }
    if (!canGo(step)) return;
    state.step = step;
    render();
    const top = $('#wizard').getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) $('#wizard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- Renderização ---------- */
  function render() {
    renderSteps();
    renderPanel();
    renderSummary();
    renderMobileBar();
    saveDraft();
  }

  function renderSteps() {
    $('#wizard-steps').innerHTML = html`${STEPS.map((label, i) => {
      const n = i + 1;
      const done = !!state.done || n < state.step;
      const cls = done ? 'done' : n === state.step ? 'current' : '';
      return html`<li class="wizard-step ${cls}">
        <button type="button" data-goto="${n}" ${!state.done && n < state.step ? '' : raw('disabled')} ${n === state.step && !state.done ? raw('aria-current="step"') : ''}>
          <span class="n">${done ? raw('<i class="bi bi-check2"></i>') : n}</span><span class="label">${label}</span>
        </button></li>`;
    })}`;
    const pct = state.done ? 100 : ((state.step - 0.5) / STEPS.length) * 100;
    $('#wizard-bar').style.setProperty('--progress', `${pct}%`);
  }

  const navButtons = () => html`
    <div class="wizard-nav">
      ${state.step > 1 ? html`<button type="button" class="btn btn-ghost" data-back><i class="bi bi-arrow-left"></i>Voltar</button>` : html`<span></span>`}
      ${state.step < 4 ? html`<button type="button" class="btn btn-primary" data-next ${canGo(state.step + 1) ? '' : raw('disabled')}>Continuar<i class="bi bi-arrow-right"></i></button>` : ''}
    </div>`;

  function renderPanel() {
    const panel = $('#wizard-panel');
    if (state.done) panel.innerHTML = panelDone();
    else if (state.step === 1) panel.innerHTML = panelServices();
    else if (state.step === 2) panel.innerHTML = panelBarber();
    else if (state.step === 3) {
      panel.innerHTML = panelDateTime();
      const sel = $('.day[aria-pressed="true"]');
      if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'center' });
    } else panel.innerHTML = panelConfirm();
    UI.renderQRs(panel);
  }

  /* ---------- Lista de espera ---------- */
  function openWaitlist() {
    const user = auth.current();
    if (!user) {
      saveDraft();
      UI.flash('Entre na sua conta para entrar na lista de espera.', 'info');
      location.href = `login.html?next=${encodeURIComponent('agendar.html?retomar=1')}`;
      return;
    }
    if (auth.isStaff(user)) return UI.toast('A lista de espera é para clientes. No painel, use a agenda.', 'info');
    const P = App.waitlist.PERIODS;
    const date = state.date || U.today();
    const m = UI.modal({
      title: 'Lista de espera',
      size: 'sm',
      body: html`
        <p class="muted">Se vagar um horário que sirva, a barbearia te chama no WhatsApp.</p>
        <form id="wl-form" class="stack" novalidate>
          <div class="field"><label class="label" for="wl-date">Dia</label>
            <input class="input" type="date" id="wl-date" name="date" value="${date}" min="${U.today()}" max="${U.addDays(U.today(), Number(db.settings().bookingWindow) || 30)}" required></div>
          <div class="field"><label class="label" for="wl-period">Período</label>
            <select class="select" id="wl-period" name="period">${Object.entries(P).map(([k, v]) => html`<option value="${k}">${v.label}</option>`)}</select></div>
          <div class="field"><label class="label" for="wl-notes">Recado <span class="opt">(opcional)</span></label>
            <input class="input" id="wl-notes" name="notes" maxlength="200" placeholder="Ex.: saio do trabalho às 17h"></div>
          <p class="text-sm subtle">${selectedServices().length ? `Serviços: ${selectedServices().map((x) => x.name).join(' + ')}` : 'Serviço a combinar'} · ${state.barberId && state.barberId !== 'any' ? barberLabel() : 'qualquer profissional'}</p>
        </form>`,
      footer: html`<button type="button" class="btn btn-ghost" data-close>Voltar</button><button type="button" class="btn btn-primary" data-save><i class="bi bi-hourglass-split"></i>Entrar na lista</button>`,
    });
    m.el.querySelector('[data-save]').addEventListener('click', async (e) => {
      const form = $('#wl-form', m.body);
      const data = UI.validate(form, { date: (v) => (v && v >= U.today() ? null : 'Escolha um dia a partir de hoje.') });
      if (!data) return;
      UI.busy(e.currentTarget, true);
      try {
        await App.waitlist.join({
          clientId: user.id, date: data.date, period: data.period, serviceIds: state.services,
          barberId: state.barberId && state.barberId !== 'any' ? state.barberId : null, notes: data.notes,
        });
        m.close();
        UI.toast('Pronto! Você está na lista de espera. Acompanhe em Minha conta.');
      } catch (err) {
        UI.busy(e.currentTarget, false);
        UI.toast(err.message, 'error');
      }
    });
  }

  function panelServices() {
    const services = db.services({ active: true });
    const cats = db.categories({ active: true });
    const club = clubOf();
    const inPlan = (id) => club && club.left > 0 && (club.plan.serviceIds || []).includes(id);
    return html`
      ${state.reschedule ? html`<div class="notice"><i class="bi bi-arrow-repeat"></i><div><strong>Remarcando seu horário.</strong> Escolha o novo dia e horário; o anterior é cancelado quando você confirmar.</div></div>` : ''}
      <div class="stack-sm">
        <h2 class="wizard-title">Quais serviços?</h2>
        <p class="muted">Pode escolher mais de um: a duração e o valor somam automaticamente.</p>
      </div>
      ${club ? html`<div class="notice"><i class="bi bi-stars"></i><div><strong>Você é do ${club.plan.name}.</strong> ${club.left === Infinity ? 'Visitas ilimitadas neste mês.' : club.left > 0 ? `Ainda ${club.left === 1 ? 'resta 1 visita' : `restam ${club.left} visitas`} até ${U.fmtDateShort(App.club.window(club.sub).end)}.` : `As visitas do plano acabaram neste mês (voltam em ${U.fmtDateShort(U.addDays(App.club.window(club.sub).end, 1))}).`}</div></div>` : ''}
      ${cats.map((c) => html`
        <div class="stack-sm">
          <h3 class="group-label">${c}</h3>
          <div class="opt-list">
            ${services.filter((s) => s.category === c).map((s) => html`
              <label class="opt">
                <input type="checkbox" name="svc" value="${s.id}" ${state.services.includes(s.id) ? raw('checked') : ''}>
                <span class="tick"><i class="bi bi-check-lg"></i></span>
                <span class="opt-body"><span class="opt-title">${s.name}</span><span class="opt-sub">${s.description}</span></span>
                <span class="opt-end">${inPlan(s.id) ? html`<span class="club-tag"><i class="bi bi-stars"></i>No plano</span>` : html`<span class="opt-price">${U.money(s.price)}</span>`}<span class="opt-meta">${U.fmtDuration(s.duration)}</span></span>
              </label>`)}
          </div>
        </div>`)}
      ${navButtons()}`;
  }

  function panelBarber() {
    const barbers = db.barbers({ active: true });
    return html`
      <div class="stack-sm">
        <h2 class="wizard-title">Com quem?</h2>
        <p class="muted">Escolha seu barbeiro ou fique com quem estiver livre primeiro (mais opções de horário).</p>
      </div>
      <div class="opt-grid">
        <label class="opt">
          <input type="radio" name="barber" value="any" ${state.barberId === 'any' ? raw('checked') : ''}>
          <span class="tick"><i class="bi bi-check-lg"></i></span>
          <span class="avatar opt-icon"><i class="bi bi-shuffle"></i></span>
          <span class="opt-body"><span class="opt-title">Sem preferência</span><span class="opt-sub">Primeiro horário livre</span></span>
        </label>
        ${barbers.map((b) => html`
          <label class="opt">
            <input type="radio" name="barber" value="${b.id}" ${state.barberId === b.id ? raw('checked') : ''}>
            <span class="tick"><i class="bi bi-check-lg"></i></span>
            ${UI.avatar(b.name, { color: b.color, photo: b.photo })}
            <span class="opt-body"><span class="opt-title">${b.name}</span><span class="opt-sub">${b.specialty}</span></span>
          </label>`)}
      </div>
      ${navButtons()}`;
  }

  function slotsHTML() {
    if (!state.date) return UI.empty('bi-calendar-x', 'Sem horários livres nos próximos dias', 'Tente outro profissional ou chame a gente no WhatsApp que encaixamos você.');
    const slots = slotList(state.date);
    if (!slots.some((s) => s.available)) return UI.empty('bi-calendar-x', 'Dia sem horários livres', 'Escolha outro dia acima.');
    const groups = [
      { label: 'Manhã', icon: 'bi-sunrise', items: slots.filter((s) => U.toMin(s.time) < 720) },
      { label: 'Tarde', icon: 'bi-sun', items: slots.filter((s) => U.toMin(s.time) >= 720 && U.toMin(s.time) < 1080) },
      { label: 'Noite', icon: 'bi-moon-stars', items: slots.filter((s) => U.toMin(s.time) >= 1080) },
    ];
    return html`
      <div class="slot-groups">
        ${groups.filter((g) => g.items.length).map((g) => html`
          <div class="slot-group">
            <h3 class="group-label"><i class="bi ${g.icon}" aria-hidden="true"></i>${g.label}</h3>
            <div class="slots">
              ${g.items.map((s) => html`<button type="button" class="slot" data-time="${s.time}" aria-pressed="${s.time === state.time}" ${s.available ? '' : raw('disabled')} aria-label="${s.time}${s.available ? '' : ', ocupado'}">${s.time}</button>`)}
            </div>
          </div>`)}
      </div>
      <div class="legend-inline" aria-hidden="true">
        <span><span class="sw"></span>Livre</span><span><span class="sw sel"></span>Selecionado</span><span><span class="sw off"></span>Ocupado</span>
      </div>`;
  }

  function panelDateTime() {
    const days = dayList();
    if (!state.date || !days.some((d) => d.date === state.date && d.free > 0)) {
      state.date = (days.find((d) => d.free > 0) || {}).date || null;
    }
    if (state.time && !isSlotValid()) state.time = null;
    const who = state.barberId === 'any' ? 'Mostrando horários de toda a equipe' : `Agenda de ${barberLabel()}`;
    return html`
      <div class="stack-sm">
        <h2 class="wizard-title">Quando?</h2>
        <p class="muted">${who} · duração estimada de ${U.fmtDuration(duration())}.</p>
      </div>
      <div class="stack-sm">
        <h3 class="group-label" id="days-label">Escolha o dia</h3>
        <div class="days" id="days" role="group" aria-labelledby="days-label">
          ${days.map((d) => {
            const dt = U.parseDate(d.date);
            return html`<button type="button" class="day" data-date="${d.date}" aria-pressed="${d.date === state.date}" ${d.free ? '' : raw('disabled')}
              aria-label="${U.fmtDateLong(d.date)}${d.free ? `, ${d.free} horários livres` : ', sem horários'}">
              <span class="wd">${d.index === 0 ? 'Hoje' : U.WEEKDAYS_SHORT[dt.getDay()]}</span>
              <span class="dn">${dt.getDate()}</span>
              <span class="mo">${U.MONTHS_SHORT[dt.getMonth()]}</span>
              <span class="free">${d.free ? `${d.free} ${d.free === 1 ? 'livre' : 'livres'}` : 'lotado'}</span>
            </button>`;
          })}
        </div>
      </div>
      <div id="slots-area" class="stack">
        ${state.date ? html`<h3 class="group-label">${U.fmtDateLong(state.date)}</h3>` : ''}
        ${slotsHTML()}
      </div>
      <div class="waitlist-cta">
        <i class="bi bi-hourglass-split" aria-hidden="true"></i>
        <div class="grow"><strong>Nenhum horário serve?</strong><span class="text-sm muted">Entre na lista de espera: se vagar um horário, a barbearia te chama.</span></div>
        <button type="button" class="btn btn-outline btn-sm" data-waitlist>Entrar na lista</button>
      </div>
      ${navButtons()}`;
  }

  const ticketHTML = ({ date, time, end, services, barberName, price, dur, clubName, dep }) => {
    const b = UI.bindings(db.settings());
    return html`
      <div class="ticket">
        <div class="ticket-head">
          <div>
            <span class="group-label">Seu horário</span>
            <div class="ticket-when">${U.fmtDateHuman(date)} às ${time}</div>
            <div class="muted">${U.fmtDateLong(date, true)}</div>
          </div>
          <div class="pole pole-sm" aria-hidden="true"></div>
        </div>
        <div class="ticket-grid">
          <div><span class="k">Serviços</span>${services.join(' + ')}</div>
          <div><span class="k">Profissional</span>${barberName}</div>
          <div><span class="k">Duração</span>${U.fmtDuration(dur)} (até ${end})</div>
          <div><span class="k">Valor</span>${U.money(price)} ${clubName ? html`<span class="club-tag"><i class="bi bi-stars"></i>${clubName}</span>` : ''}</div>
        </div>
        <div class="text-sm muted">${dep ? html`<i class="bi bi-qr-code" aria-hidden="true"></i> Sinal de ${U.money(dep)} por Pix agora, o resto no local` : html`<i class="bi bi-wallet2" aria-hidden="true"></i> Pagamento no local`}</div>
        <div class="text-sm muted"><i class="bi bi-geo-alt" aria-hidden="true"></i> ${b.fullAddress}</div>
      </div>`;
  };

  function panelConfirm() {
    const user = auth.current();
    const s = db.settings();
    const ticket = ticketHTML({
      date: state.date, time: state.time, end: endTime(), services: selectedServices().map((x) => x.name),
      barberName: barberLabel(), price: total(), dur: duration(),
      clubName: (coverageNow() || {}).plan ? coverageNow().plan.name : '', dep: depositNow(),
    });
    const head = html`<div class="stack-sm"><h2 class="wizard-title">${state.reschedule ? 'Confirme a remarcação' : 'Confira e confirme'}</h2></div>`;
    const old = state.reschedule && db.get('appointments', state.reschedule);

    if (!user) {
      const next = encodeURIComponent(RESUME_URL);
      return html`${head}${ticket}
        <div class="notice"><i class="bi bi-person-lock"></i><div><strong>Falta só entrar na sua conta.</strong> Assim você recebe a confirmação e pode cancelar ou remarcar pelo site. Suas escolhas ficam salvas enquanto isso.</div></div>
        <div class="cluster">
          <a class="btn btn-primary btn-lg" href="login.html?next=${raw(next)}"><i class="bi bi-box-arrow-in-right"></i>Entrar e confirmar</a>
          <a class="btn btn-outline btn-lg" href="cadastro.html?next=${raw(next)}">Criar conta grátis</a>
        </div>
        ${s.demoMode ? html`<p class="text-sm subtle">Demonstração: entre com <strong>cliente@demo.com</strong> e a senha <strong>demo123</strong>.</p>` : ''}
        ${navButtons()}`;
    }
    if (auth.isStaff(user)) {
      return html`${head}${ticket}
        <div class="notice warn"><i class="bi bi-info-circle"></i><div>Você está conectado como equipe (<strong>${user.name}</strong>). Para marcar para um cliente, use a agenda do painel.</div></div>
        <div class="cluster">
          <a class="btn btn-primary" href="painel/agenda.html?data=${state.date}"><i class="bi bi-calendar3"></i>Abrir agenda no painel</a>
          <button type="button" class="btn btn-outline" data-switch-account>Sair e continuar como cliente</button>
        </div>
        ${navButtons()}`;
    }
    const dep = depositNow();
    return html`${head}${ticket}
      ${dep ? html`<div class="notice warn"><i class="bi bi-qr-code"></i><div><strong>Esta barbearia pede um sinal de ${U.money(dep)} por Pix</strong> para garantir o horário. Depois de confirmar, mostramos o QR Code; o valor é descontado no dia.</div></div>` : ''}
      ${old ? html`<div class="notice"><i class="bi bi-arrow-repeat"></i><div>O horário anterior (${U.fmtDateHuman(old.date).toLowerCase()} às ${old.start}) será cancelado automaticamente.</div></div>` : ''}
      <div class="card card-pad stack">
        <div class="cluster">
          ${UI.avatar(user.name)}
          <div class="grow"><strong>${user.name}</strong><div class="text-sm subtle">${user.phone || user.email}</div></div>
          <button type="button" class="btn btn-ghost btn-sm" data-switch-account>Não é você?</button>
        </div>
        <div class="field">
          <label class="label" for="notes">Recado para o barbeiro <span class="opt">(opcional)</span></label>
          <textarea class="textarea" id="notes" name="notes" rows="3" maxlength="300" placeholder="Ex.: quero manter o volume em cima">${state.notes}</textarea>
        </div>
      </div>
      <div class="wizard-nav">
        <button type="button" class="btn btn-ghost" data-back><i class="bi bi-arrow-left"></i>Voltar</button>
        <button type="button" class="btn btn-primary btn-lg" data-confirm><i class="bi bi-check2-circle"></i>${state.reschedule ? 'Confirmar remarcação' : 'Confirmar agendamento'}</button>
      </div>`;
  }

  function panelDone() {
    const a = db.get('appointments', state.done);
    if (!a) return UI.empty('bi-calendar-x', 'Agendamento não encontrado');
    const b = db.barber(a.barberId) || { name: '' };
    const s = db.settings();
    const end = U.fromMin(U.toMin(a.start) + a.duration);
    const msg = `Olá! Acabei de agendar ${a.services.map((x) => x.name).join(' + ')} para ${U.fmtDateLong(a.date)} às ${a.start} com ${b.name}.`;
    return html`
      <div class="done-card">
        <span class="success-icon"><i class="bi bi-check2"></i></span>
        <div class="stack-sm">
          <h2 class="wizard-title">${state.reschedule ? 'Horário remarcado!' : 'Horário confirmado!'}</h2>
          <p class="muted">Te esperamos ${U.fmtDateLong(a.date)}, às ${a.start}, com ${b.name}. Chegue 5 minutinhos antes.</p>
        </div>
        ${ticketHTML({ date: a.date, time: a.start, end, services: a.services.map((x) => x.name), barberName: b.name, price: a.total, dur: a.duration, clubName: a.subscriptionId ? ((App.club.plan((db.get('subscriptions', a.subscriptionId) || {}).planId) || {}).name || 'Clube') : '', dep: a.depositStatus === 'pendente' ? a.depositAmount : 0 })}
        ${a.depositStatus === 'pendente' ? UI.pixBox(a) : ''}
        <div class="cluster">
          <button type="button" class="btn btn-primary" data-ics><i class="bi bi-calendar-plus"></i>Salvar na agenda do celular</button>
          <a class="btn btn-whatsapp" href="${U.waLink(s.whatsapp, msg)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i>Avisar no WhatsApp</a>
          <a class="btn btn-outline" href="minha-conta.html"><i class="bi bi-list-check"></i>Meus agendamentos</a>
        </div>
        <a class="link" href="agendar.html">Fazer outro agendamento <i class="bi bi-arrow-right"></i></a>
      </div>`;
  }

  function renderSummary() {
    const a = state.done && db.get('appointments', state.done);
    const svcs = a ? a.services : selectedServices();
    const barber = a ? (db.barber(a.barberId) || {}).name : state.barberId ? barberLabel() : '';
    const date = a ? a.date : state.date;
    const time = a ? a.start : state.time;
    const dur = a ? a.duration : duration();
    const price = a ? a.total : total();
    const end = time ? U.fromMin(U.toMin(time) + dur) : '';
    const row = (icon, k, v, empty) => html`
      <div class="summary-row"><i class="bi ${icon}" aria-hidden="true"></i>
        <div><span class="k">${k}</span><span class="v ${v ? '' : 'empty-v'}">${v || empty}</span></div></div>`;
    $('#summary').innerHTML = html`
      <div class="card summary-card">
        <h2 class="summary-title">Resumo</h2>
        <div class="summary-list">
          ${row('bi-scissors', 'Serviços', svcs.map((x) => x.name).join(' + '), 'Nenhum escolhido')}
          ${row('bi-person', 'Profissional', barber, 'A escolher')}
          ${row('bi-calendar3', 'Data', date && state.step >= 3 ? U.fmtDateLong(date) : '', 'A escolher')}
          ${row('bi-clock', 'Horário', time ? `${time} às ${end}` : '', 'A escolher')}
        </div>
        ${!a && coverageNow() ? html`<div class="summary-club"><span class="club-tag"><i class="bi bi-stars"></i>${coverageNow().plan.name}</span><span class="text-sm subtle">De <s>${U.money(listTotal())}</s></span></div>` : ''}
        <div class="summary-total"><span class="muted">Total${dur ? ` · ${U.fmtDuration(dur)}` : ''}</span><strong>${U.money(price)}</strong></div>
      </div>
      <div class="notice"><i class="bi bi-shield-check" aria-hidden="true"></i><div>Pagamento no local: Pix, cartão ou dinheiro. Cancelamento grátis até ${db.settings().cancelLimit}h antes.</div></div>`;
  }

  function renderMobileBar() {
    const bar = $('#mobile-bar');
    const hide = !!state.done || state.step === 4;
    bar.hidden = hide;
    document.body.classList.toggle('has-mobile-bar', !hide);
    if (hide) return;
    const svcs = selectedServices();
    const info = state.step === 3 && state.time
      ? `${U.fmtDateHuman(state.date)} às ${state.time}`
      : svcs.length ? `${svcs.length} ${svcs.length === 1 ? 'serviço' : 'serviços'} · ${U.fmtDuration(duration())}` : 'Escolha os serviços';
    bar.innerHTML = html`
      <div class="info"><strong>${U.money(total())}</strong><span>${info}</span></div>
      <button type="button" class="btn btn-primary" data-next ${canGo(state.step + 1) ? '' : raw('disabled')}>Continuar<i class="bi bi-arrow-right"></i></button>`;
  }

  /** Atualiza só o que depende da seleção (sem redesenhar o painel inteiro) */
  function refreshLight() {
    renderSummary();
    renderMobileBar();
    $$('#wizard-panel [data-next]').forEach((b) => (b.disabled = !canGo(state.step + 1)));
    saveDraft();
  }

  /* ---------- Ações ---------- */
  async function confirmBooking(btn) {
    const user = auth.current();
    if (!user || auth.isStaff(user)) return;
    if (!isSlotValid()) {
      UI.toast('Esse horário acabou de ser ocupado. Escolha outro, por favor.', 'error');
      state.time = null;
      go(3);
      return;
    }
    let barberId = state.barberId;
    if (barberId === 'any') {
      const slot = slotList(state.date).find((s) => s.time === state.time);
      barberId = B.pickBarber({ date: state.date, time: state.time, duration: duration(), barberIds: slot.barberIds });
    }
    const notesEl = $('#notes');
    if (notesEl) state.notes = notesEl.value.trim();
    UI.busy(btn, true);
    state.saving = true;
    try {
      const appt = await B.create({
        clientId: user.id, barberId, serviceIds: state.services, date: state.date, start: state.time,
        notes: state.notes, source: 'site', reschedule: state.reschedule,
      });
      state.done = appt.id;
      clearDraft();
      renderSteps();
      renderPanel();
      renderSummary();
      renderMobileBar();
      $('#wizard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      state.saving = false;
      UI.toast(err.message, 'error');
      if (/ocupado|bloqueado|passou/.test(err.message)) {
        state.time = null;
        go(3);
      }
    } finally {
      UI.busy(btn, false);
    }
  }

  function downloadICS() {
    const a = db.get('appointments', state.done);
    if (!a) return;
    const s = db.settings();
    const b = db.barber(a.barberId) || { name: '' };
    U.download(
      'agendamento-barbearia.ics',
      U.icsEvent({
        title: `${a.services.map((x) => x.name).join(' + ')} · ${s.name}`,
        description: `Com ${b.name}. Valor: ${U.money(a.total)}.`,
        location: UI.bindings(s).fullAddress,
        date: a.date,
        start: a.start,
        duration: a.duration,
      }),
      'text/calendar;charset=utf-8'
    );
  }

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'svc') {
      if (t.checked && !state.services.includes(t.value)) state.services.push(t.value);
      if (!t.checked) state.services = state.services.filter((id) => id !== t.value);
      refreshLight();
    } else if (t.name === 'barber') {
      state.barberId = t.value;
      state.time = null;
      go(3);
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'notes') {
      state.notes = e.target.value;
      saveDraft();
    }
  });

  document.addEventListener('click', (e) => {
    const t = e.target;
    const day = t.closest('.day');
    if (day && !day.disabled) {
      state.date = day.dataset.date;
      if (state.time && !isSlotValid()) state.time = null;
      $$('.day').forEach((d) => d.setAttribute('aria-pressed', String(d === day)));
      $('#slots-area').innerHTML = html`<h3 class="group-label">${U.fmtDateLong(state.date)}</h3>${slotsHTML()}`;
      refreshLight();
      return;
    }
    const slot = t.closest('.slot');
    if (slot && !slot.disabled) {
      state.time = slot.dataset.time;
      $$('.slot').forEach((s) => s.setAttribute('aria-pressed', String(s === slot)));
      refreshLight();
      return;
    }
    if (t.closest('[data-next]')) return go(state.step + 1);
    if (t.closest('[data-back]')) return go(state.step - 1);
    const goto = t.closest('[data-goto]');
    if (goto) return go(Number(goto.dataset.goto));
    const confirmBtn = t.closest('[data-confirm]');
    if (confirmBtn) return confirmBooking(confirmBtn);
    if (t.closest('[data-ics]')) return downloadICS();
    if (t.closest('[data-waitlist]')) return openWaitlist();
    if (t.closest('[data-switch-account]')) {
      saveDraft();
      auth.logout().then(() => (location.href = `login.html?next=${encodeURIComponent(RESUME_URL)}`));
    }
  });

  // Outra aba mudou a agenda (ex.: alguém marcou o mesmo horário): recalcula
  db.subscribe((source) => {
    // Durante a confirmação a própria reserva chega como mudança remota: não é conflito
    if (source !== 'remote' || state.done || state.saving) return;
    if (state.step === 3) renderPanel();
    if (state.time && !isSlotValid()) {
      state.time = null;
      UI.toast('O horário que você escolheu acabou de ser ocupado.', 'info');
      if (state.step === 4) state.step = 3;
      render();
    }
  });

  // Assinatura vencida: o agendamento online fica pausado (a equipe ainda marca pelo painel)
  const sub = auth.isCloud() ? App.cloud.subscription() : null;
  if (sub && !sub.live && !auth.isStaff(auth.current())) {
    $('#wizard').innerHTML = html`
      <div class="wizard-panel"><div class="empty">
        <i class="bi bi-calendar-x" aria-hidden="true"></i>
        <strong>Agendamento online indisponível no momento</strong>
        <p class="muted">Chame a ${db.settings().name} no WhatsApp para marcar seu horário.</p>
        <a class="btn btn-whatsapp" data-link="whatsapp" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i>Chamar no WhatsApp</a>
      </div></div>`;
    UI.applyBranding();
    return;
  }

  init();
});
