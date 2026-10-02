/* ==========================================================================
   PAINEL — estrutura comum (menu lateral, barra superior, notificações),
   controle de acesso por papel e modais compartilhados entre as páginas:
   detalhes/edição de agendamento, conclusão com pagamento, ficha de
   cliente e bloqueio de agenda.  →  window.App.painel
   ========================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const U = App.utils;
  const { html, raw, $, $$ } = U;
  const db = App.db;
  const UI = App.ui;
  const B = App.booking;
  const auth = App.auth;

  const NAV = [
    { group: 'Visão geral', items: [
      { id: 'dashboard', href: 'index.html', icon: 'bi-speedometer2', label: 'Painel' },
      { id: 'agenda', href: 'agenda.html', icon: 'bi-calendar3', label: 'Agenda' },
    ] },
    { group: 'Gestão', items: [
      { id: 'agendamentos', href: 'agendamentos.html', icon: 'bi-list-check', label: 'Agendamentos' },
      { id: 'clientes', href: 'clientes.html', icon: 'bi-people', label: 'Clientes' },
      { id: 'servicos', href: 'servicos.html', icon: 'bi-scissors', label: 'Serviços', admin: true },
      { id: 'equipe', href: 'equipe.html', icon: 'bi-person-badge', label: 'Equipe', admin: true },
    ] },
    { group: 'Relatórios', items: [
      { id: 'financeiro', href: 'financeiro.html', icon: 'bi-graph-up-arrow', label: 'Financeiro', admin: true },
    ] },
    { group: 'Comunicação', items: [
      { id: 'mensagens', href: 'mensagens.html', icon: 'bi-chat-left-text', label: 'Mensagens', admin: true, count: () => db.unreadMessages() },
    ] },
    { group: 'Sistema', items: [
      { id: 'configuracoes', href: 'configuracoes.html', icon: 'bi-gear', label: 'Configurações', admin: true },
    ] },
  ];

  const page = document.body.dataset.page;
  const current = NAV.flatMap((g) => g.items).find((i) => i.id === page);

  const user = auth.requireRole(['admin', 'barbeiro']);
  if (!user) {
    App.painel = null;
    return;
  }
  if (current && current.admin && user.role !== 'admin') {
    UI.flash('Essa área é exclusiva do administrador.', 'info');
    location.replace('index.html');
    App.painel = null;
    return;
  }
  const isAdmin = user.role === 'admin';
  /** Barbeiro vê os próprios números; administrador vê a barbearia toda */
  const scopeBarberId = isAdmin ? null : user.barberId;

  /* ---------- Utilitários de domínio ---------- */
  const me = () => db.user(user.id) || user;
  const clientName = (id) => (db.user(id) || {}).name || 'Cliente removido';
  const servicesText = (a) => a.services.map((s) => s.name).join(' + ');
  const endOf = (a) => U.fromMin(U.toMin(a.start) + a.duration);
  const barberAvatar = (b, size = 'sm') => (b ? UI.avatar(b.name, { color: b.color, photo: b.photo, size }) : '');
  const staffAvatar = (u) => {
    const b = u.barberId && db.barber(u.barberId);
    return UI.avatar(u.name, { color: b ? b.color : null, size: 'sm' });
  };

  /** 'now' = em atendimento; 'late' = horário passou e ainda não foi concluído */
  function apptState(a) {
    if (a.status !== 'confirmado') return '';
    const t = U.today();
    if (a.date < t) return 'late';
    if (a.date > t) return '';
    const n = U.nowMin();
    const s = U.toMin(a.start);
    if (n >= s && n < s + a.duration) return 'now';
    return n >= s + a.duration ? 'late' : '';
  }
  const pendingConclusion = () =>
    db.appointments({ status: 'confirmado', to: U.today(), barberId: scopeBarberId || undefined }).filter((a) => apptState(a) === 'late');

  function waReminderLink(a) {
    const c = db.user(a.clientId);
    if (!c || !U.validPhone(c.phone)) return null;
    const s = db.settings();
    const b = db.barber(a.barberId) || { name: 'nossa equipe' };
    const msg = `Olá, ${U.firstName(c.name)}! Passando para lembrar do seu horário na ${s.name}: ${U.fmtDateLong(a.date)} às ${a.start}, com ${b.name} (${servicesText(a)}). Até lá!`;
    return U.waLink(c.phone, msg);
  }

  function period(key, custom = {}) {
    const t = U.today();
    const map = {
      hoje: { from: t, to: t, label: 'Hoje' },
      amanha: { from: U.addDays(t, 1), to: U.addDays(t, 1), label: 'Amanhã' },
      prox7: { from: t, to: U.addDays(t, 6), label: 'Próximos 7 dias' },
      '7d': { from: U.addDays(t, -6), to: t, label: 'Últimos 7 dias' },
      '30d': { from: U.addDays(t, -29), to: t, label: 'Últimos 30 dias' },
      mes: { from: U.startOfMonth(t), to: U.endOfMonth(t), label: U.monthLabel(t) },
      'mes-passado': { from: U.addMonths(t, -1), to: U.endOfMonth(U.addMonths(t, -1)), label: U.monthLabel(U.addMonths(t, -1)) },
      ano: { from: `${t.slice(0, 4)}-01-01`, to: `${t.slice(0, 4)}-12-31`, label: `Ano de ${t.slice(0, 4)}` },
      todos: { from: null, to: null, label: 'Todo o período' },
      custom: { from: custom.from || t, to: custom.to || t, label: 'Período personalizado' },
    };
    return map[key] || map.hoje;
  }

  /* ---------- Menu lateral ---------- */
  function renderSide() {
    const s = db.settings();
    $('#side').innerHTML = html`
      <a class="side-brand" href="index.html">
        <img data-logo src="${s.logo || '../assets/img/logo.png'}" alt="" width="40" height="40">
        <span><span class="brand-name brand-font" data-bind="name">${s.name}</span><small>ForBarber · gestão</small></span>
      </a>
      <nav class="side-nav" aria-label="Menu do painel">
        ${NAV.map((g) => {
          const items = g.items.filter((i) => !i.admin || isAdmin);
          if (!items.length) return '';
          return html`<div class="side-group">${g.group}</div>
            ${items.map((i) => {
              const c = i.count ? i.count() : 0;
              return html`<a class="side-link" href="${i.href}" ${i.id === page ? raw('aria-current="page"') : ''}>
                <i class="bi ${i.icon}" aria-hidden="true"></i><span>${i.label}</span>
                ${c ? html`<span class="count" aria-label="${c} não lidas">${c}</span>` : ''}</a>`;
            })}`;
        })}
      </nav>
      <div class="side-foot">
        <a class="side-link" href="../index.html"><i class="bi bi-globe2" aria-hidden="true"></i><span>Ver o site</span></a>
        <div class="side-user">
          ${staffAvatar(me())}
          <div class="grow"><strong>${me().name}</strong><span>${auth.ROLES[user.role]}</span></div>
          <button type="button" class="btn btn-ghost btn-icon btn-sm" data-logout aria-label="Sair" title="Sair"><i class="bi bi-box-arrow-right"></i></button>
        </div>
      </div>`;
  }

  /* ---------- Barra superior e notificações ---------- */
  function notifications() {
    const items = [];
    if (isAdmin) {
      const unread = db.unreadMessages();
      if (unread) items.push({ icon: 'bi-chat-left-text', text: `${unread} ${unread === 1 ? 'mensagem nova' : 'mensagens novas'}`, sub: 'Formulário de contato do site', href: 'mensagens.html' });
    }
    const late = pendingConclusion();
    if (late.length) {
      items.push({
        icon: 'bi-hourglass-split',
        text: `${late.length} ${late.length === 1 ? 'atendimento aguardando' : 'atendimentos aguardando'} conclusão`,
        sub: 'Marque como concluído ou falta',
        href: 'agendamentos.html?status=pendentes',
      });
    }
    db.appointments({ status: 'confirmado', barberId: scopeBarberId || undefined })
      .filter((a) => a.source === 'site' && Date.now() - new Date(a.createdAt).getTime() < 36 * 3600000)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 4)
      .forEach((a) => items.push({
        icon: 'bi-globe',
        text: `Agendamento online: ${clientName(a.clientId)}`,
        sub: `${U.fmtDateHuman(a.date)} às ${a.start} · ${servicesText(a)}`,
        appt: a.id,
      }));
    const n = items.length;
    return html`
      <div class="dropdown bell">
        <button type="button" class="btn btn-ghost btn-icon" data-dropdown aria-haspopup="menu" aria-expanded="false" aria-label="Notificações${n ? `: ${n}` : ''}">
          <i class="bi bi-bell"></i>${n ? html`<span class="dot-count">${n}</span>` : ''}
        </button>
        <div class="dropdown-menu notif-menu" role="menu">
          <div class="menu-head"><strong>Notificações</strong></div>
          ${n
            ? items.map((i) => i.appt
                ? html`<button type="button" class="notif-item" data-open-appt="${i.appt}" role="menuitem"><i class="bi ${i.icon}"></i><span>${i.text}<small>${i.sub}</small></span></button>`
                : html`<a class="notif-item" href="${i.href}" role="menuitem"><i class="bi ${i.icon}"></i><span>${i.text}<small>${i.sub}</small></span></a>`)
            : html`<div class="menu-head text-sm subtle">Tudo em dia por aqui.</div>`}
        </div>
      </div>`;
  }

  function renderTopbar() {
    const now = new Date();
    $('#topbar').innerHTML = html`
      <button type="button" class="btn btn-ghost btn-icon menu-btn" aria-label="Abrir menu" aria-controls="side" aria-expanded="false"><i class="bi bi-list"></i></button>
      <div class="topbar-date"><strong>${U.WEEKDAYS[now.getDay()]}</strong><span class="long">, ${now.getDate()} de ${U.MONTHS[now.getMonth()]} de ${now.getFullYear()}</span></div>
      <div class="topbar-actions">
        <a class="btn btn-ghost btn-icon hide-sm" href="../agendar.html" title="Agendamento online (visão do cliente)" aria-label="Agendamento online"><i class="bi bi-phone"></i></a>
        ${notifications()}
        <button type="button" class="btn btn-primary btn-sm" data-new-appt><i class="bi bi-plus-lg"></i><span class="btn-label">Novo agendamento</span></button>
      </div>`;
  }

  function setMenu(open) {
    const side = $('#side');
    side.classList.toggle('open', open);
    let bd = $('.side-backdrop');
    if (open && !bd) {
      bd = document.createElement('div');
      bd.className = 'side-backdrop';
      bd.addEventListener('click', () => setMenu(false));
      document.body.appendChild(bd);
    } else if (!open && bd) bd.remove();
    const btn = $('.menu-btn');
    if (btn) btn.setAttribute('aria-expanded', String(open));
  }

  /* ---------- Modal: detalhes do agendamento ---------- */
  function openAppointment(id) {
    const a = db.get('appointments', id);
    if (!a) return UI.toast('Agendamento não encontrado.', 'error');
    const c = db.user(a.clientId);
    const b = db.barber(a.barberId);
    const stats = c ? db.clientStats(c.id) : null;
    const st = apptState(a);
    const wa = waReminderLink(a);
    const pay = a.paymentMethod && B.PAYMENTS[a.paymentMethod];

    const actions = {
      confirmado: html`<button type="button" class="btn btn-ghost btn-sm" data-act="edit"><i class="bi bi-pencil"></i>Editar</button>
        <button type="button" class="btn btn-danger btn-sm" data-act="cancel"><i class="bi bi-x-lg"></i>Cancelar</button>
        <button type="button" class="btn btn-outline btn-sm" data-act="noshow"><i class="bi bi-person-x"></i>Faltou</button>
        <button type="button" class="btn btn-success btn-sm" data-act="conclude"><i class="bi bi-check2-circle"></i>Concluir</button>`,
      concluido: html`<button type="button" class="btn btn-ghost btn-sm" data-act="edit"><i class="bi bi-pencil"></i>Editar</button>
        <button type="button" class="btn btn-outline btn-sm" data-act="reopen"><i class="bi bi-arrow-counterclockwise"></i>Reabrir</button>`,
      cancelado: html`${isAdmin ? html`<button type="button" class="btn btn-danger btn-sm" data-act="delete"><i class="bi bi-trash"></i>Excluir</button>` : ''}
        <button type="button" class="btn btn-outline btn-sm" data-act="reopen"><i class="bi bi-arrow-counterclockwise"></i>Reabrir</button>`,
    };
    actions.faltou = actions.cancelado;

    const m = UI.modal({
      title: 'Agendamento',
      size: 'lg',
      body: html`
        <div class="detail-head">
          ${UI.avatar(c ? c.name : '?', { size: 'lg' })}
          <div class="grow"><strong>${c ? c.name : 'Cliente removido'}</strong><span>${c ? [c.phone, c.email].filter(Boolean).join(' · ') : ''}</span></div>
          ${UI.statusBadge(a.status)}
        </div>
        ${st === 'now' ? html`<div class="notice"><i class="bi bi-scissors"></i><div><strong>Em atendimento agora.</strong> Termina às ${endOf(a)}.</div></div>` : ''}
        ${st === 'late' ? html`<div class="notice warn"><i class="bi bi-hourglass-split"></i><div>O horário já passou. Marque como <strong>concluído</strong> (com a forma de pagamento) ou como <strong>falta</strong>.</div></div>` : ''}
        <div class="detail-grid">
          <div><span class="k">Data</span>${U.fmtDateLong(a.date, true)}</div>
          <div><span class="k">Horário</span>${a.start} às ${endOf(a)} · ${U.fmtDuration(a.duration)}</div>
          <div><span class="k">Profissional</span>${b ? b.name : '—'}</div>
          <div><span class="k">Origem</span>${B.SOURCES[a.source] || a.source} · ${U.fmtDateTime(a.createdAt)}</div>
        </div>
        <div>
          <span class="label">Serviços</span>
          <ul class="detail-list" style="margin-top:.4rem">
            ${a.services.map((s) => html`<li><span>${s.name} <span class="subtle">· ${U.fmtDuration(s.duration)}</span></span><span class="num">${U.money(s.price)}</span></li>`)}
            <li class="strong"><span>Total${pay ? html` · <i class="bi ${pay.icon}"></i> ${pay.label}` : ''}</span><span class="num">${U.money(a.total)}</span></li>
          </ul>
        </div>
        ${a.notes ? html`<div><span class="label">Observações</span><p class="muted">${a.notes}</p></div>` : ''}
        ${c && c.notes ? html`<div class="notice"><i class="bi bi-journal-text"></i><div><strong>Ficha do cliente:</strong> ${c.notes}</div></div>` : ''}
        ${stats ? html`<div class="stat-strip">
            <div><strong>${stats.visits}</strong><span>visitas</span></div>
            <div><strong>${U.money(stats.spent)}</strong><span>gasto total</span></div>
            <div><strong>${stats.lastVisit ? U.fmtDate(stats.lastVisit) : '—'}</strong><span>última visita</span></div>
            <div><strong>${stats.noShows}</strong><span>faltas</span></div>
          </div>` : ''}`,
      footer: html`
        <div class="left cluster-sm">
          ${wa ? html`<a class="btn btn-whatsapp btn-sm" href="${wa}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i>Lembrete</a>` : ''}
          ${c ? html`<button type="button" class="btn btn-ghost btn-sm" data-act="client"><i class="bi bi-person-vcard"></i>Ficha</button>` : ''}
        </div>
        ${actions[a.status] || ''}`,
    });

    m.foot.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'edit') {
        m.close();
        openAppointmentForm({ id: a.id });
      } else if (act === 'client') {
        m.close();
        openClientDetails(a.clientId);
      } else if (act === 'conclude') {
        m.close();
        openConclude(a);
      } else if (act === 'noshow') {
        db.update('appointments', a.id, { status: 'faltou', paymentMethod: null });
        m.close();
        UI.toast('Marcado como não compareceu.', 'info');
      } else if (act === 'reopen') {
        db.update('appointments', a.id, { status: 'confirmado', paymentMethod: null });
        m.close();
        UI.toast('Agendamento reaberto.', 'info');
      } else if (act === 'cancel') {
        const ok = await UI.confirm({ title: 'Cancelar agendamento', message: `Cancelar o horário de ${clientName(a.clientId)} (${U.fmtDateHuman(a.date).toLowerCase()} às ${a.start})? O horário fica livre na agenda.`, confirmText: 'Cancelar horário', cancelText: 'Manter', danger: true });
        if (!ok) return;
        db.update('appointments', a.id, { status: 'cancelado', notes: [a.notes, 'Cancelado pela barbearia.'].filter(Boolean).join(' ') });
        m.close();
        UI.toast('Agendamento cancelado.', 'info');
      } else if (act === 'delete') {
        const ok = await UI.confirm({ title: 'Excluir agendamento', message: 'O registro some do histórico e dos relatórios. Essa ação não pode ser desfeita.', confirmText: 'Excluir', danger: true });
        if (!ok) return;
        db.remove('appointments', a.id);
        m.close();
        UI.toast('Agendamento excluído.', 'info');
      }
    });
  }

  /* ---------- Modal: concluir com forma de pagamento ---------- */
  function openConclude(a) {
    const m = UI.modal({
      title: 'Concluir atendimento',
      size: 'sm',
      body: html`
        <p class="muted">${clientName(a.clientId)} · ${servicesText(a)}</p>
        <fieldset class="field">
          <legend class="label">Forma de pagamento</legend>
          <div class="pay-options">
            ${Object.entries(B.PAYMENTS).map(([k, p], i) => html`<label class="pay-option"><input type="radio" name="pay" value="${k}" ${i === 0 ? raw('checked') : ''}><i class="bi ${p.icon}" aria-hidden="true"></i>${p.label}</label>`)}
          </div>
        </fieldset>
        <div class="field">
          <label class="label" for="pay-total">Valor cobrado (R$)</label>
          <input class="input" id="pay-total" type="number" inputmode="decimal" step="0.01" min="0" value="${a.total}">
          <span class="help">Ajuste se houve desconto ou cortesia do cartão fidelidade.</span>
        </div>`,
      footer: html`<button type="button" class="btn btn-ghost" data-close>Voltar</button>
        <button type="button" class="btn btn-success" data-ok><i class="bi bi-check2-circle"></i>Concluir</button>`,
    });
    m.el.querySelector('[data-ok]').addEventListener('click', () => {
      const method = m.body.querySelector('input[name="pay"]:checked').value;
      const total = Number(m.body.querySelector('#pay-total').value);
      if (!(total >= 0)) return UI.setError(m.body.querySelector('#pay-total'), 'Informe um valor válido.');
      db.update('appointments', a.id, { status: 'concluido', paymentMethod: method, total: Math.round(total * 100) / 100 });
      m.close();
      UI.toast(`Atendimento concluído · ${U.money(total)} no ${B.PAYMENTS[method].label.toLowerCase()}.`);
    });
  }

  /* ---------- Seletor de cliente com busca ---------- */
  function clientPicker(box, state, onChange) {
    function render() {
      if (state.newClient) {
        box.innerHTML = html`
          <div class="form-grid">
            <div class="field"><label class="label" for="nc-name">Nome do cliente novo</label><input class="input" id="nc-name" autocomplete="off" value="${state.newName || ''}"></div>
            <div class="field"><label class="label" for="nc-phone">WhatsApp</label><input class="input" id="nc-phone" type="tel" inputmode="tel" placeholder="(16) 98765-4321" value="${state.newPhone || ''}"></div>
          </div>
          <button type="button" class="link text-sm" data-pick-existing><i class="bi bi-search"></i> Escolher cliente já cadastrado</button>`;
        UI.maskPhone($('#nc-phone', box));
        $('#nc-name', box).addEventListener('input', (e) => (state.newName = e.target.value));
        $('#nc-phone', box).addEventListener('input', (e) => (state.newPhone = e.target.value));
        $('#nc-name', box).focus();
        return;
      }
      if (state.clientId) {
        const c = db.user(state.clientId);
        box.innerHTML = html`
          <div class="combo-selected">
            ${UI.avatar(c.name, { size: 'sm' })}
            <div class="grow"><strong>${c.name}</strong><div class="text-xs subtle">${c.phone || c.email || ''}</div></div>
            <button type="button" class="btn btn-ghost btn-xs" data-change-client>Trocar</button>
          </div>`;
        return;
      }
      box.innerHTML = html`
        <div class="combo">
          <div class="search"><i class="bi bi-search" aria-hidden="true"></i>
            <input class="input" id="client-search" placeholder="Buscar por nome ou telefone" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="combo-list">
          </div>
          <div class="combo-list" id="combo-list" role="listbox" hidden></div>
        </div>
        <button type="button" class="link text-sm" data-new-client style="margin-top:.4rem"><i class="bi bi-person-plus"></i> Cadastrar cliente novo</button>`;
      const input = $('#client-search', box);
      const list = $('#combo-list', box);
      let results = [];
      let active = 0;
      const draw = () => {
        list.hidden = !results.length;
        input.setAttribute('aria-expanded', String(!!results.length));
        list.innerHTML = html`${results.map((c, i) => html`
          <button type="button" class="combo-item ${i === active ? 'active' : ''}" role="option" aria-selected="${i === active}" data-id="${c.id}">
            ${UI.avatar(c.name, { size: 'sm' })}<span class="grow"><strong>${c.name}</strong><span>${c.phone || c.email || ''}</span></span>
          </button>`)}`;
      };
      const search = () => {
        const q = U.normalize(input.value);
        const d = U.digits(input.value);
        if (!q) {
          results = [];
          return draw();
        }
        results = db.clients().filter((c) => U.normalize(c.name).includes(q) || (d.length >= 3 && U.digits(c.phone).includes(d))).slice(0, 8);
        active = 0;
        draw();
      };
      input.addEventListener('input', search);
      input.addEventListener('keydown', (e) => {
        if (!results.length) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
          draw();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          state.clientId = results[active].id;
          render();
          onChange();
        }
      });
      list.addEventListener('click', (e) => {
        const item = e.target.closest('[data-id]');
        if (!item) return;
        state.clientId = item.dataset.id;
        render();
        onChange();
      });
      input.focus();
    }
    box.addEventListener('click', (e) => {
      if (e.target.closest('[data-change-client]')) {
        state.clientId = null;
        render();
      } else if (e.target.closest('[data-new-client]')) {
        state.newClient = true;
        state.clientId = null;
        render();
      } else if (e.target.closest('[data-pick-existing]')) {
        state.newClient = false;
        render();
      }
    });
    render();
  }

  /* ---------- Modal: novo / editar agendamento ---------- */
  function openAppointmentForm({ id, date, time, barberId, clientId } = {}) {
    const editing = id ? db.get('appointments', id) : null;
    const barbers = db.barbers({ active: true });
    if (!barbers.length) return UI.toast('Cadastre um profissional em Equipe antes de agendar.', 'error');
    const state = {
      clientId: editing ? editing.clientId : clientId || null,
      newClient: false,
      services: editing ? editing.services.map((s) => s.id) : [],
      barberId: editing ? editing.barberId : barberId || scopeBarberId || barbers[0].id,
      date: editing ? editing.date : date || U.today(),
      time: editing ? editing.start : time || '',
    };
    const services = db.services({ active: true });
    const extraIds = editing ? editing.services.map((s) => s.id).filter((sid) => !services.some((s) => s.id === sid)) : [];

    const m = UI.modal({
      title: editing ? 'Editar agendamento' : 'Novo agendamento',
      size: 'lg',
      body: html`
        <form id="appt-form" class="stack" novalidate>
          <div class="field" id="f-client"><span class="label">Cliente</span><div id="client-picker"></div><span class="error-text"></span></div>
          <div class="field" id="f-services">
            <span class="label">Serviços</span>
            <div class="svc-picks">
              ${services.map((s) => html`<label class="svc-pick"><input type="checkbox" name="svc" value="${s.id}" ${state.services.includes(s.id) ? raw('checked') : ''}>
                <span class="grow">${s.name}<span>${U.fmtDuration(s.duration)} · ${U.money(s.price)}</span></span></label>`)}
              ${extraIds.map((sid) => {
                const s = editing.services.find((x) => x.id === sid);
                return html`<label class="svc-pick"><input type="checkbox" name="svc" value="${sid}" checked><span class="grow">${s.name}<span>serviço desativado</span></span></label>`;
              })}
            </div>
            <span class="error-text"></span>
          </div>
          <div class="form-grid">
            <div class="field">
              <label class="label" for="a-barber">Profissional</label>
              <select class="select" id="a-barber">${db.barbers().filter((b) => b.active || b.id === state.barberId).map((b) => html`<option value="${b.id}" ${b.id === state.barberId ? raw('selected') : ''}>${b.name}</option>`)}</select>
            </div>
            <div class="field">
              <label class="label" for="a-date">Data</label>
              <input class="input" type="date" id="a-date" value="${state.date}">
            </div>
            <div class="field">
              <label class="label" for="a-time">Horário</label>
              <select class="select" id="a-time"></select>
              <span class="help" id="a-time-help"></span>
              <span class="error-text"></span>
            </div>
            <div class="field">
              <span class="label">Encaixe</span>
              <label class="switch"><input type="checkbox" id="a-override"><span class="track"></span>Horário livre, fora da grade</label>
            </div>
            <div class="field" id="f-custom" hidden>
              <label class="label" for="a-custom">Horário do encaixe</label>
              <input class="input" type="time" id="a-custom" step="300" value="${state.time}">
              <span class="error-text"></span>
            </div>
            ${editing ? html`<div class="field">
                <label class="label" for="a-status">Situação</label>
                <select class="select" id="a-status">${Object.entries(B.STATUS).map(([k, s]) => html`<option value="${k}" ${k === editing.status ? raw('selected') : ''}>${s.label}</option>`)}</select>
              </div>` : ''}
          </div>
          <div class="field">
            <label class="label" for="a-notes">Observações <span class="opt">(opcional)</span></label>
            <textarea class="textarea" id="a-notes" rows="2" placeholder="Ex.: cliente pediu máquina 1 nas laterais">${editing ? editing.notes : ''}</textarea>
          </div>
          <div class="notice" id="a-summary"></div>
        </form>`,
      footer: html`<button type="button" class="btn btn-ghost" data-close>Cancelar</button>
        <button type="button" class="btn btn-primary" data-save><i class="bi bi-check2"></i>${editing ? 'Salvar alterações' : 'Agendar'}</button>`,
    });
    const body = m.body;
    const el = (sel) => $(sel, body);
    const selectedServices = () => state.services.map((sid) => db.service(sid) || (editing && editing.services.find((x) => x.id === sid))).filter(Boolean);
    const duration = () => U.sum(selectedServices(), (s) => s.duration);

    function refreshTimes() {
      const sel = el('#a-time');
      const dur = duration() || 30;
      const list = B.slots({ date: state.date, barberId: state.barberId, duration: dur, ignoreId: editing && editing.id, forStaff: true });
      const free = list.filter((s) => s.available).map((s) => s.time);
      if (editing && editing.start && !free.includes(editing.start) && state.date === editing.date && state.barberId === editing.barberId) free.unshift(editing.start);
      if (state.time && !free.includes(state.time) && !el('#a-override').checked) state.time = free[0] || '';
      if (!state.time) state.time = free[0] || '';
      sel.innerHTML = free.length
        ? html`${free.sort((x, y) => U.toMin(x) - U.toMin(y)).map((t) => html`<option value="${t}" ${t === state.time ? raw('selected') : ''}>${t}</option>`)}`
        : html`<option value="">Sem horários livres</option>`;
      const barber = db.barber(state.barberId);
      const works = B.barberWorks(barber, state.date);
      el('#a-time-help').textContent = !works
        ? `${barber ? U.firstName(barber.name) : 'Profissional'} não atende neste dia (use encaixe se precisar).`
        : free.length ? `${free.length} ${free.length === 1 ? 'horário livre' : 'horários livres'} para ${U.fmtDuration(dur)}` : 'Agenda cheia neste dia. Use encaixe ou escolha outra data.';
      refreshSummary();
    }

    function refreshSummary() {
      const svcs = selectedServices();
      const override = el('#a-override').checked;
      const t = override ? el('#a-custom').value : state.time;
      const total = U.sum(svcs, (s) => s.price);
      const conflict = t && svcs.length ? B.conflict({ barberId: state.barberId, date: state.date, start: t, duration: duration(), ignoreId: editing && editing.id }) : null;
      el('#a-summary').innerHTML = html`<i class="bi ${conflict ? 'bi-exclamation-triangle' : 'bi-receipt'}" aria-hidden="true"></i>
        <div>${svcs.length
          ? html`<strong>${svcs.map((s) => s.name).join(' + ')}</strong> · ${U.fmtDuration(duration())} · ${U.money(total)}${t ? html` · ${U.fmtDateHuman(state.date)} das ${t} às ${U.fromMin(U.toMin(t) + duration())}` : ''}`
          : 'Escolha os serviços para ver duração e valor.'}
          ${conflict ? html`<br><span class="text-danger">Conflita com ${conflict.clientId ? `o horário de ${clientName(conflict.clientId)} (${conflict.start})` : `um bloqueio (${conflict.reason || 'agenda bloqueada'})`}.</span>` : ''}</div>`;
      el('#a-summary').classList.toggle('warn', !!conflict);
    }

    clientPicker(el('#client-picker'), state, () => {});
    body.addEventListener('change', (e) => {
      const t = e.target;
      if (t.name === 'svc') {
        state.services = $$('input[name="svc"]:checked', body).map((x) => x.value);
        refreshTimes();
      } else if (t.id === 'a-barber') {
        state.barberId = t.value;
        refreshTimes();
      } else if (t.id === 'a-date') {
        state.date = t.value || U.today();
        refreshTimes();
      } else if (t.id === 'a-time') {
        state.time = t.value;
        refreshSummary();
      } else if (t.id === 'a-override') {
        el('#f-custom').hidden = !t.checked;
        if (t.checked && !el('#a-custom').value) el('#a-custom').value = state.time || '12:00';
        refreshSummary();
      } else if (t.id === 'a-custom') refreshSummary();
    });
    refreshTimes();

    m.el.querySelector('[data-save]').addEventListener('click', () => {
      const form = el('#appt-form');
      UI.clearErrors(form);
      let ok = true;
      const err = (fieldSel, msg) => {
        const f = el(fieldSel);
        f.classList.add('invalid');
        f.querySelector('.error-text').textContent = msg;
        ok = false;
      };
      if (state.newClient) {
        if (!state.newName || state.newName.trim().length < 3) err('#f-client', 'Informe o nome do cliente novo.');
        else if (!U.validPhone(state.newPhone)) err('#f-client', 'Informe o WhatsApp com DDD.');
      } else if (!state.clientId) err('#f-client', 'Escolha o cliente (ou cadastre um novo).');
      if (!state.services.length) err('#f-services', 'Escolha pelo menos um serviço.');
      const override = el('#a-override').checked;
      const start = override ? el('#a-custom').value : state.time;
      if (!start) err(override ? '#f-custom' : '#a-time', 'Escolha um horário.');
      if (!ok) return;

      let clientIdFinal = state.clientId;
      if (state.newClient) {
        const existing = db.clients().find((c) => U.digits(c.phone) === U.digits(state.newPhone));
        clientIdFinal = existing ? existing.id : db.insert('users', {
          role: 'cliente', name: state.newName.trim(), phone: U.fmtPhone(state.newPhone), email: '', birthday: '', notes: '',
          salt: null, passwordHash: null, active: true, barberId: null,
        }).id;
      }
      const notes = el('#a-notes').value.trim();
      try {
        if (editing) {
          const items = selectedServices().map((s) => ({ id: s.id, name: s.name, price: s.price, duration: s.duration }));
          const dur = U.sum(items, (s) => s.duration);
          if (!override && B.conflict({ barberId: state.barberId, date: state.date, start, duration: dur, ignoreId: editing.id })) {
            throw new Error('Esse horário conflita com outro agendamento. Ative o encaixe para forçar.');
          }
          const status = el('#a-status').value;
          const sameServices = items.map((s) => s.id).join() === editing.services.map((s) => s.id).join();
          db.update('appointments', editing.id, {
            clientId: clientIdFinal, barberId: state.barberId, services: items, duration: dur, date: state.date, start, notes, status,
            total: sameServices && editing.status === 'concluido' ? editing.total : U.sum(items, (s) => s.price),
            paymentMethod: status === 'concluido' ? editing.paymentMethod || 'pix' : null,
          });
          UI.toast('Agendamento atualizado.');
        } else {
          B.create({ clientId: clientIdFinal, barberId: state.barberId, serviceIds: state.services, date: state.date, start, notes, source: 'painel', allowConflict: override });
          UI.toast(`Agendado: ${clientName(clientIdFinal)} · ${U.fmtDateHuman(state.date)} às ${start}.`);
        }
        m.close();
      } catch (e) {
        UI.toast(e.message, 'error');
      }
    });
  }

  /* ---------- Modal: cadastro de cliente ---------- */
  function openClientForm({ id, onSave } = {}) {
    const c = id ? db.user(id) : null;
    const m = UI.modal({
      title: c ? 'Editar cliente' : 'Novo cliente',
      body: html`
        <form id="client-form" class="form-grid" novalidate>
          <div class="field full"><label class="label" for="cf-name">Nome completo</label><input class="input" id="cf-name" name="name" value="${c ? c.name : ''}" required></div>
          <div class="field"><label class="label" for="cf-phone">WhatsApp</label><input class="input" id="cf-phone" name="phone" type="tel" inputmode="tel" value="${c ? c.phone : ''}" placeholder="(16) 98765-4321" required></div>
          <div class="field"><label class="label" for="cf-birthday">Aniversário <span class="opt">(opcional)</span></label><input class="input" id="cf-birthday" name="birthday" type="date" value="${c ? c.birthday : ''}"></div>
          <div class="field full"><label class="label" for="cf-email">E-mail <span class="opt">(opcional)</span></label><input class="input" id="cf-email" name="email" type="email" value="${c ? c.email : ''}"></div>
          <div class="field full"><label class="label" for="cf-notes">Ficha / preferências <span class="opt">(opcional)</span></label><textarea class="textarea" id="cf-notes" name="notes" rows="3" placeholder="Ex.: máquina 2 nas laterais, alergia a pós-barba com álcool">${c ? c.notes : ''}</textarea></div>
        </form>`,
      footer: html`<button type="button" class="btn btn-ghost" data-close>Cancelar</button><button type="button" class="btn btn-primary" data-save><i class="bi bi-check2"></i>Salvar</button>`,
    });
    const form = $('#client-form', m.body);
    UI.maskPhone(form.elements.phone);
    m.el.querySelector('[data-save]').addEventListener('click', () => {
      const data = UI.validate(form, {
        name: (v) => (v.length >= 3 ? null : 'Informe o nome do cliente.'),
        phone: UI.rules.phone,
        email: (v) => {
          if (!v) return null;
          if (!U.validEmail(v)) return 'E-mail inválido.';
          const other = db.userByEmail(v);
          return other && (!c || other.id !== c.id) ? 'Já existe um cadastro com este e-mail.' : null;
        },
      });
      if (!data) return;
      const dupe = db.clients().find((x) => U.digits(x.phone) === U.digits(data.phone) && (!c || x.id !== c.id));
      if (dupe) return UI.setError(form.elements.phone, `Este telefone já é de ${dupe.name}.`);
      const patch = { name: data.name, phone: U.fmtPhone(data.phone), email: (data.email || '').toLowerCase(), birthday: data.birthday || '', notes: data.notes || '' };
      const saved = c
        ? db.update('users', c.id, patch)
        : db.insert('users', { ...patch, role: 'cliente', salt: null, passwordHash: null, active: true, barberId: null });
      m.close();
      UI.toast(c ? 'Cadastro atualizado.' : 'Cliente cadastrado.');
      if (onSave) onSave(saved);
    });
  }

  /* ---------- Modal: ficha completa do cliente ---------- */
  function openClientDetails(id) {
    const c = db.user(id);
    if (!c) return UI.toast('Cliente não encontrado.', 'error');
    const stats = db.clientStats(id);
    const all = db.appointments({ clientId: id }).sort(db.byDateTime);
    const t = U.today();
    const upcoming = all.filter((a) => a.status === 'confirmado' && a.date >= t);
    const history = all.filter((a) => !upcoming.includes(a)).reverse();
    const avg = stats.visits ? stats.spent / stats.visits : 0;
    const favBarber = Object.entries(stats.barbers).sort((a, b) => b[1] - a[1])[0];
    const bday = c.birthday ? `${c.birthday.slice(8, 10)}/${c.birthday.slice(5, 7)}` : '';
    const isBdayMonth = c.birthday && c.birthday.slice(5, 7) === t.slice(5, 7);
    const wa = U.validPhone(c.phone) ? U.waLink(c.phone, `Olá, ${U.firstName(c.name)}! Aqui é da ${db.settings().name}.`) : null;
    const m = UI.modal({
      title: 'Ficha do cliente',
      size: 'lg',
      body: html`
        <div class="detail-head">
          ${UI.avatar(c.name, { size: 'lg' })}
          <div class="grow"><strong>${c.name}</strong><span>${[c.phone, c.email].filter(Boolean).join(' · ')}</span></div>
        </div>
        <div class="tag-list">
          ${c.passwordHash ? html`<span class="badge badge-primary"><i class="bi bi-phone"></i>Conta online</span>` : html`<span class="badge badge-neutral"><i class="bi bi-shop"></i>Cadastro no balcão</span>`}
          ${bday ? html`<span class="badge ${isBdayMonth ? 'badge-warning' : 'badge-neutral'}"><i class="bi bi-cake2"></i>Aniversário ${bday}</span>` : ''}
          <span class="badge badge-neutral"><i class="bi bi-calendar-heart"></i>Cliente desde ${U.fmtDate(c.createdAt.slice(0, 10))}</span>
          ${favBarber && db.barber(favBarber[0]) ? html`<span class="badge badge-neutral"><i class="bi bi-heart"></i>Prefere ${U.firstName(db.barber(favBarber[0]).name)}</span>` : ''}
        </div>
        <div class="stat-strip">
          <div><strong>${stats.visits}</strong><span>visitas</span></div>
          <div><strong>${U.money(stats.spent)}</strong><span>gasto total</span></div>
          <div><strong>${U.money(avg)}</strong><span>ticket médio</span></div>
          <div><strong>${stats.lastVisit ? U.fmtDate(stats.lastVisit) : '—'}</strong><span>última visita</span></div>
          <div><strong>${stats.noShows}</strong><span>faltas</span></div>
        </div>
        <div class="field">
          <label class="label" for="cd-notes">Ficha / preferências</label>
          <textarea class="textarea" id="cd-notes" rows="2" placeholder="Anote preferências de corte, alergias, assuntos...">${c.notes || ''}</textarea>
          <div><button type="button" class="btn btn-outline btn-xs" data-save-notes><i class="bi bi-check2"></i>Salvar anotação</button></div>
        </div>
        ${upcoming.length ? html`<div class="stack-sm"><span class="label">Próximos horários</span>
          <div class="panel"><div class="appt-list">${upcoming.map((a) => apptRowHTML(a))}</div></div></div>` : ''}
        <div class="stack-sm">
          <span class="label">Histórico (${history.length})</span>
          ${history.length ? html`<div class="table-wrap"><table class="table">
              <thead><tr><th>Data</th><th>Serviços</th><th class="hide-md">Profissional</th><th class="num">Valor</th><th>Situação</th></tr></thead>
              <tbody>${history.slice(0, 15).map((a) => html`<tr class="clickable" data-open-appt="${a.id}"><td class="num nowrap">${U.fmtDate(a.date)} ${a.start}</td><td>${servicesText(a)}</td><td class="hide-md">${(db.barber(a.barberId) || {}).name || '—'}</td><td class="num">${U.money(a.total)}</td><td>${UI.statusBadge(a.status)}</td></tr>`)}</tbody>
            </table></div>` : html`<p class="subtle text-sm">Ainda sem atendimentos.</p>`}
        </div>`,
      footer: html`
        <div class="left">${isAdmin ? html`<button type="button" class="btn btn-ghost btn-sm text-danger" data-act="delete"><i class="bi bi-trash"></i>Excluir</button>` : ''}</div>
        ${wa ? html`<a class="btn btn-whatsapp btn-sm" href="${wa}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i>WhatsApp</a>` : ''}
        <button type="button" class="btn btn-outline btn-sm" data-act="edit"><i class="bi bi-pencil"></i>Editar</button>
        <button type="button" class="btn btn-primary btn-sm" data-act="book"><i class="bi bi-calendar-plus"></i>Agendar</button>`,
    });
    m.body.addEventListener('click', (e) => {
      if (e.target.closest('[data-save-notes]')) {
        db.update('users', id, { notes: $('#cd-notes', m.body).value.trim() });
        UI.toast('Anotação salva.');
      }
      const row = e.target.closest('[data-open-appt]');
      if (row) {
        m.close();
        openAppointment(row.dataset.openAppt);
      }
    });
    m.foot.addEventListener('click', async (e) => {
      const act = (e.target.closest('[data-act]') || {}).dataset;
      if (!act) return;
      if (act.act === 'edit') {
        m.close();
        openClientForm({ id });
      } else if (act.act === 'book') {
        m.close();
        openAppointmentForm({ clientId: id });
      } else if (act.act === 'delete') {
        const ok = await UI.confirm({
          title: 'Excluir cliente',
          message: `Excluir ${c.name}? ${upcoming.length ? `Os ${upcoming.length} horários futuros serão cancelados. ` : ''}O histórico financeiro continua nos relatórios.`,
          confirmText: 'Excluir cliente',
          danger: true,
        });
        if (!ok) return;
        upcoming.forEach((a) => db.update('appointments', a.id, { status: 'cancelado', notes: 'Cliente excluído do cadastro.' }));
        db.update('users', id, { active: false, passwordHash: null, salt: null });
        m.close();
        UI.toast('Cliente excluído.', 'info');
      }
    });
  }

  /** Linha de agendamento reutilizável (dashboard, ficha do cliente) */
  function apptRowHTML(a, { showBarber = true, showDate = true } = {}) {
    const b = db.barber(a.barberId);
    const st = apptState(a);
    return html`
      <div class="appt-row ${st === 'now' ? 'is-now' : ''} ${st === 'late' ? 'is-late' : ''}" data-open-appt="${a.id}" role="button" tabindex="0"
        aria-label="${clientName(a.clientId)}, ${U.fmtDateHuman(a.date)} às ${a.start}">
        <div class="time">${a.start}<small>${showDate ? U.fmtDateHuman(a.date) : `até ${endOf(a)}`}</small></div>
        <div class="who">
          <strong>${clientName(a.clientId)}</strong>
          <span>${showBarber && b ? html`<span class="dot" style="background:${b.color}"></span>${U.firstName(b.name)} · ` : ''}${servicesText(a)} · ${U.money(a.total)}</span>
        </div>
        <div class="end">${st === 'now' ? html`<span class="now-chip"><i class="bi bi-scissors"></i>Agora</span>` : st === 'late' ? html`<span class="badge badge-warning"><i class="bi bi-hourglass-split"></i>Concluir</span>` : UI.statusBadge(a.status)}</div>
      </div>`;
  }

  /* ---------- Bloqueios de agenda ---------- */
  function openBlockForm({ date, barberId, start } = {}) {
    const st = start || '12:00';
    const m = UI.modal({
      title: 'Bloquear horário',
      body: html`
        <p class="muted text-sm">Folga, almoço, curso ou compromisso: o período some do agendamento online.</p>
        <form id="block-form" class="form-grid" novalidate>
          <div class="field full"><label class="label" for="bf-barber">Profissional</label>
            <select class="select" id="bf-barber" name="barberId">
              ${isAdmin ? html`<option value="">Toda a equipe</option>` : ''}
              ${db.barbers({ active: true }).filter((b) => isAdmin || b.id === scopeBarberId).map((b) => html`<option value="${b.id}" ${b.id === (barberId || scopeBarberId) ? raw('selected') : ''}>${b.name}</option>`)}
            </select></div>
          <div class="field full"><label class="label" for="bf-date">Data</label><input class="input" type="date" id="bf-date" name="date" value="${date || U.today()}" required></div>
          <div class="field"><label class="label" for="bf-start">Início</label><input class="input" type="time" id="bf-start" name="start" step="300" value="${st}" required></div>
          <div class="field"><label class="label" for="bf-end">Fim</label><input class="input" type="time" id="bf-end" name="end" step="300" value="${U.fromMin(Math.min(23 * 60, U.toMin(st) + 60))}" required></div>
          <div class="field full"><label class="label" for="bf-reason">Motivo</label><input class="input" id="bf-reason" name="reason" placeholder="Ex.: almoço, consulta médica, curso" maxlength="60"></div>
        </form>`,
      footer: html`<button type="button" class="btn btn-ghost" data-close>Cancelar</button><button type="button" class="btn btn-primary" data-save><i class="bi bi-slash-circle"></i>Bloquear</button>`,
    });
    const form = $('#block-form', m.body);
    m.el.querySelector('[data-save]').addEventListener('click', () => {
      const data = UI.validate(form, {
        date: UI.rules.required('a data'),
        start: UI.rules.required('o início'),
        end: (v, d) => (v && U.toMin(v) > U.toMin(d.start) ? null : 'O fim precisa ser depois do início.'),
      });
      if (!data) return;
      db.insert('blocks', { barberId: data.barberId || null, date: data.date, start: data.start, end: data.end, reason: data.reason || 'Bloqueio' });
      m.close();
      UI.toast('Horário bloqueado.');
    });
  }

  function openBlock(id) {
    const bl = db.get('blocks', id);
    if (!bl) return;
    const b = bl.barberId && db.barber(bl.barberId);
    const m = UI.modal({
      title: 'Bloqueio de agenda',
      size: 'sm',
      body: html`<div class="detail-grid">
          <div><span class="k">Profissional</span>${b ? b.name : 'Toda a equipe'}</div>
          <div><span class="k">Quando</span>${U.fmtDateLong(bl.date)} · ${bl.start} às ${bl.end}</div>
          <div><span class="k">Motivo</span>${bl.reason}</div>
        </div>`,
      footer: html`<button type="button" class="btn btn-ghost" data-close>Fechar</button><button type="button" class="btn btn-danger" data-del><i class="bi bi-trash"></i>Remover bloqueio</button>`,
    });
    m.el.querySelector('[data-del]').addEventListener('click', () => {
      db.remove('blocks', bl.id);
      m.close();
      UI.toast('Bloqueio removido. O horário voltou para a agenda.', 'info');
    });
  }

  /* ---------- Eventos globais ---------- */
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-new-appt]')) return openAppointmentForm();
    const open = e.target.closest('[data-open-appt]');
    if (open && !e.target.closest('.modal')) {
      UI.closeDropdowns();
      return openAppointment(open.dataset.openAppt);
    }
    if (e.target.closest('.menu-btn')) return setMenu(!$('#side').classList.contains('open'));
    if (e.target.closest('[data-logout]')) {
      auth.logout();
      location.href = '../login.html';
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setMenu(false);
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-open-appt][role="button"]')) {
      e.preventDefault();
      openAppointment(e.target.dataset.openAppt);
    }
  });

  function renderChrome() {
    renderSide();
    renderTopbar();
    UI.applyBranding();
  }
  renderChrome();
  db.subscribe(renderChrome);

  App.painel = {
    user, isAdmin, scopeBarberId, me,
    clientName, servicesText, endOf, apptState, pendingConclusion, waReminderLink, period, barberAvatar, apptRowHTML,
    openAppointment, openAppointmentForm, openConclude, openClientForm, openClientDetails, openBlockForm, openBlock,
    /** Re-renderiza a página quando os dados mudam (nesta aba ou em outra) */
    onChange: (fn) => db.subscribe(() => fn()),
  };
})();
