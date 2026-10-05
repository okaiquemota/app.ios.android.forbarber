/* ==========================================================================
   ESTRUTURA DO SITE PÚBLICO (window.App.site)
   Cabeçalho, menu mobile, rodapé, faixa de demonstração e botão do
   WhatsApp são montados aqui — edite o menu num lugar só.
   ========================================================================== */
window.App.ready(function () {
  'use strict';
  const App = window.App;
  const U = App.utils;
  const { html, raw, $ } = U;
  const db = App.db;
  const auth = App.auth;
  const UI = App.ui;

  const NAV = [
    { href: 'index.html', label: 'Início', page: 'home' },
    { href: 'servicos.html', label: 'Serviços', page: 'servicos' },
    { href: 'index.html#equipe', label: 'Equipe', page: 'equipe' },
    { href: 'index.html#avaliacoes', label: 'Avaliações', page: 'avaliacoes' },
    { href: 'contato.html', label: 'Contato', page: 'contato' },
  ];

  /* ---------- Horários agrupados: "Segunda a sexta · 09:00 às 19:00" ---------- */
  function hoursGroups() {
    const s = db.settings();
    const order = [1, 2, 3, 4, 5, 6, 0];
    const todayWd = new Date().getDay();
    const groups = [];
    order.forEach((d, idx) => {
      const h = s.hours[d];
      const key = h.closed ? 'closed' : `${h.open}-${h.close}`;
      const last = groups[groups.length - 1];
      if (last && last.key === key && last.lastIdx === idx - 1) {
        last.days.push(d);
        last.lastIdx = idx;
      } else {
        groups.push({ key, days: [d], lastIdx: idx, h });
      }
    });
    return groups.map((g) => {
      const first = U.WEEKDAYS[g.days[0]];
      const last = U.WEEKDAYS[g.days[g.days.length - 1]].toLowerCase();
      const label = g.days.length === 1 ? first : g.days.length === 2 ? `${first} e ${last}` : `${first} a ${last}`;
      return {
        label,
        value: g.h.closed ? 'Fechado' : `${g.h.open} às ${g.h.close}`,
        closed: g.h.closed,
        today: g.days.includes(todayWd),
      };
    });
  }
  const hoursList = () =>
    html`<ul class="hours">${hoursGroups().map(
      (g) => html`<li class="${g.today ? 'is-today' : ''} ${g.closed ? 'is-closed' : ''}">
        <span>${g.label}${g.today ? raw(' <em>hoje</em>') : ''}</span><span class="num">${g.value}</span></li>`
    )}</ul>`;

  /** Linha do quadro de preços (página inicial e página de serviços) */
  const boardItem = (s) => html`
    <a class="board-item" href="agendar.html?servico=${s.id}" aria-label="Agendar ${s.name}, ${U.money(s.price)}, ${U.fmtDuration(s.duration)}">
      <span class="board-info">
        <span class="board-name">${s.name}</span>
        ${s.description ? html`<span class="board-desc">${s.description}</span>` : ''}
        <span class="board-time">${U.fmtDuration(s.duration)}</span>
      </span>
      <span class="board-end">
        <span class="board-price">${U.money(s.price)}</span>
        <span class="board-cta">Agendar</span>
      </span>
    </a>`;

  function openChip() {
    const st = App.booking.openStatus();
    if (st.open) return html`<span class="status-chip is-open"><span class="pulse"></span>Aberto agora · fecha às ${st.closesAt}</span>`;
    if (!st.date) return html`<span class="status-chip"><span class="pulse"></span>Fechado</span>`;
    const diff = U.diffDays(U.today(), st.date);
    const when = diff === 0 ? 'hoje' : diff === 1 ? 'amanhã' : U.WEEKDAYS[U.weekday(st.date)].toLowerCase();
    return html`<span class="status-chip"><span class="pulse"></span>Fechado agora · abre ${when} às ${st.opensAt}</span>`;
  }

  /* ---------- Cabeçalho ---------- */
  function userArea(user) {
    if (!user) {
      return html`<a class="btn btn-ghost btn-sm header-login" href="login.html"><i class="bi bi-person-circle"></i><span>Entrar</span></a>`;
    }
    const staff = auth.isStaff(user);
    return html`
      <div class="dropdown">
        <button type="button" class="user-chip" data-dropdown aria-expanded="false" aria-haspopup="menu">
          ${UI.avatar(user.name, { size: 'sm', color: staff ? (db.barber(user.barberId) || {}).color : null })}
          <span class="user-chip-name">${U.firstName(user.name)}</span>
          <i class="bi bi-chevron-down" aria-hidden="true"></i>
        </button>
        <div class="dropdown-menu" role="menu">
          <div class="menu-head"><strong>${user.name}</strong><div class="text-xs subtle">${user.email}</div></div>
          ${staff
            ? html`<a href="painel/index.html" role="menuitem"><i class="bi bi-speedometer2"></i>Painel da barbearia</a>
                   <a href="painel/agenda.html" role="menuitem"><i class="bi bi-calendar3"></i>Agenda</a>`
            : html`<a href="minha-conta.html" role="menuitem"><i class="bi bi-calendar-check"></i>Meus agendamentos</a>
                   <a href="minha-conta.html#dados" role="menuitem"><i class="bi bi-person"></i>Meus dados</a>`}
          <div class="sep"></div>
          <button type="button" data-logout role="menuitem"><i class="bi bi-box-arrow-right"></i>Sair</button>
        </div>
      </div>`;
  }

  function renderHeader() {
    const el = document.getElementById('site-header');
    if (!el) return;
    const s = db.settings();
    const user = auth.current();
    const page = document.body.dataset.page;
    el.innerHTML = html`
      <div class="container header-inner">
        <a class="brand" href="index.html">
          <img data-logo src="${s.logo || 'assets/img/logo.png'}" alt="" width="44" height="44">
          <span class="brand-name" data-bind="name">${s.name}</span>
        </a>
        <nav class="nav" aria-label="Menu principal">
          ${NAV.map((n) => html`<a href="${n.href}" ${n.page === page ? raw('aria-current="page"') : ''}>${n.label}</a>`)}
        </nav>
        <div class="header-actions">
          ${userArea(user)}
          <a class="btn btn-primary btn-sm header-cta" href="agendar.html"><i class="bi bi-calendar-plus"></i><span>Agendar</span></a>
          <button type="button" class="btn btn-ghost btn-icon menu-toggle" aria-label="Abrir menu" aria-expanded="false" aria-controls="mobile-nav">
            <i class="bi bi-list"></i>
          </button>
        </div>
      </div>`;

    let mobile = document.getElementById('mobile-nav');
    if (!mobile) {
      mobile = document.createElement('div');
      mobile.id = 'mobile-nav';
      mobile.className = 'mobile-nav';
      mobile.hidden = true;
      el.after(mobile);
    }
    mobile.innerHTML = html`
      <nav aria-label="Menu">
        ${NAV.map((n) => html`<a href="${n.href}" ${n.page === page ? raw('aria-current="page"') : ''}>${n.label}<i class="bi bi-arrow-right"></i></a>`)}
      </nav>
      <div class="mobile-nav-actions">
        <a class="btn btn-primary btn-lg btn-block" href="agendar.html"><i class="bi bi-calendar-plus"></i>Agendar horário</a>
        ${user
          ? html`<a class="btn btn-outline btn-block" href="${auth.isStaff(user) ? 'painel/index.html' : 'minha-conta.html'}">
                   <i class="bi bi-person-circle"></i>${auth.isStaff(user) ? 'Painel da barbearia' : 'Minha conta'}</a>
                 <button type="button" class="btn btn-ghost btn-block" data-logout><i class="bi bi-box-arrow-right"></i>Sair</button>`
          : html`<a class="btn btn-outline btn-block" href="login.html"><i class="bi bi-person-circle"></i>Entrar / Criar conta</a>`}
        <a class="btn btn-whatsapp btn-block" data-link="whatsapp" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i>Chamar no WhatsApp</a>
        <button type="button" class="btn btn-ghost btn-block" data-install ${App.pwa && App.pwa.available() ? '' : raw('hidden')}><i class="bi bi-phone"></i>Instalar o app no celular</button>
      </div>`;
  }

  /* ---------- Barra inferior no celular (Início, Agendar, Horários, Mais) ---------- */
  function renderTabbar() {
    const page = document.body.dataset.page;
    let bar = document.getElementById('tabbar');
    // No agendamento a barra de baixo é o resumo com "Continuar"
    if (page === 'agendar') {
      if (bar) bar.remove();
      document.body.classList.remove('has-tabbar');
      return;
    }
    if (!bar) {
      bar = document.createElement('nav');
      bar.id = 'tabbar';
      bar.className = 'tabbar';
      bar.setAttribute('aria-label', 'Navegação principal');
      document.body.appendChild(bar);
    }
    document.body.classList.add('has-tabbar');
    const user = auth.current();
    const staff = user && auth.isStaff(user);
    const third = staff
      ? { href: 'painel/index.html', icon: 'bi-speedometer2', label: 'Painel', page: '' }
      : { href: user ? 'minha-conta.html' : 'login.html?next=minha-conta.html', icon: 'bi-calendar-check', label: 'Horários', page: 'conta' };
    const item = (i) => html`<a href="${i.href}" class="${i.cls || ''}" ${i.page && i.page === page ? raw('aria-current="page"') : ''}><i class="bi ${i.icon}" aria-hidden="true"></i><span>${i.label}</span></a>`;
    bar.innerHTML = html`
      ${item({ href: 'index.html', icon: 'bi-house', label: 'Início', page: 'home' })}
      ${item({ href: 'agendar.html', icon: 'bi-plus-lg', label: 'Agendar', cls: 'tab-book' })}
      ${item(third)}
      <a href="#" data-tab-menu><i class="bi bi-list" aria-hidden="true"></i><span>Mais</span></a>`;
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-tab-menu]')) return;
    e.preventDefault();
    setMenuOpen(document.getElementById('mobile-nav').hidden);
  });

  function setMenuOpen(open) {
    const mobile = document.getElementById('mobile-nav');
    const toggle = document.querySelector('#site-header .menu-toggle');
    if (!mobile || !toggle) return;
    mobile.hidden = !open;
    document.body.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.innerHTML = `<i class="bi ${open ? 'bi-x-lg' : 'bi-list'}"></i>`;
    toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest('#site-header .menu-toggle')) setMenuOpen(document.getElementById('mobile-nav').hidden);
    else if (e.target.closest('#mobile-nav a')) setMenuOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setMenuOpen(false);
  });

  /* ---------- Rodapé ---------- */
  function renderFooter() {
    const el = document.getElementById('site-footer');
    if (!el) return;
    const s = db.settings();
    el.innerHTML = html`
      <div class="container footer-grid">
        <div class="footer-brand">
          <a class="brand" href="index.html">
            <img data-logo src="${s.logo || 'assets/img/logo.png'}" alt="" width="44" height="44">
            <span class="brand-name" data-bind="name">${s.name}</span>
          </a>
          <p class="muted" data-bind="slogan">${s.slogan}</p>
          <div class="social">
            <a data-link="instagram" target="_blank" rel="noopener" aria-label="Instagram"><i class="bi bi-instagram"></i></a>
            <a data-link="whatsapp" target="_blank" rel="noopener" aria-label="WhatsApp"><i class="bi bi-whatsapp"></i></a>
            <a data-link="mail" aria-label="E-mail"><i class="bi bi-envelope"></i></a>
          </div>
        </div>
        <div>
          <h2 class="footer-title">Navegação</h2>
          <ul class="footer-links">
            ${NAV.map((n) => html`<li><a href="${n.href}">${n.label}</a></li>`)}
            <li><a href="agendar.html">Agendar horário</a></li>
            <li><a href="minha-conta.html">Minha conta</a></li>
          </ul>
        </div>
        <div>
          <h2 class="footer-title">Contato</h2>
          <ul class="footer-contact">
            <li><i class="bi bi-geo-alt"></i><a data-link="maps" target="_blank" rel="noopener"><span data-bind="address"></span><br><span data-bind="city"></span></a></li>
            <li><i class="bi bi-whatsapp"></i><a data-link="whatsapp" target="_blank" rel="noopener" data-bind="whatsapp"></a></li>
            <li><i class="bi bi-telephone"></i><a data-link="tel" data-bind="phone"></a></li>
            <li><i class="bi bi-envelope"></i><a data-link="mail" data-bind="email"></a></li>
          </ul>
        </div>
        <div>
          <h2 class="footer-title">Horários</h2>
          ${hoursList()}
        </div>
      </div>
      <div class="container footer-bottom">
        <span>© <span data-bind="year"></span> <span data-bind="name"></span>. Todos os direitos reservados.</span>
        <span class="footer-actions">
          <button type="button" class="link-btn" data-install ${App.pwa && App.pwa.available() ? '' : raw('hidden')}><i class="bi bi-phone"></i> Instalar app</button>
          <a href="login.html"><i class="bi bi-lock"></i> Área da equipe</a>
        </span>
      </div>`;
  }

  /* ---------- Extras: faixa de demonstração, WhatsApp, pular para o conteúdo ---------- */
  function renderExtras() {
    const s = db.settings();
    let ribbon = document.querySelector('.demo-ribbon');
    if (s.demoMode && !ribbon) {
      ribbon = document.createElement('div');
      ribbon.className = 'demo-ribbon';
      ribbon.innerHTML = html`<strong>ForBarber</strong>
        <span>Demonstração com dados fictícios: agende, entre no painel e teste à vontade.</span>
        <a href="login.html#demo">Acessos de teste</a>
        <a href="https://movcode.com.br/sistema-para-barbearia" target="_blank" rel="noopener">Quero para minha barbearia</a>`;
      document.body.prepend(ribbon);
    } else if (!s.demoMode && ribbon) {
      ribbon.remove();
    }
    if (!document.querySelector('.skip-link')) {
      const skip = document.createElement('a');
      skip.className = 'skip-link';
      skip.href = '#conteudo';
      skip.textContent = 'Pular para o conteúdo';
      document.body.prepend(skip);
    }
    if (!document.querySelector('.wa-float') && document.body.dataset.whatsapp !== 'off') {
      const wa = document.createElement('a');
      wa.className = 'wa-float';
      wa.dataset.link = 'whatsapp';
      wa.target = '_blank';
      wa.rel = 'noopener';
      wa.setAttribute('aria-label', 'Conversar no WhatsApp');
      wa.innerHTML = '<i class="bi bi-whatsapp"></i>';
      document.body.appendChild(wa);
    }
  }

  function renderChrome() {
    renderExtras();
    renderHeader();
    renderTabbar();
    renderFooter();
    UI.applyBranding();
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-logout]')) return;
    auth.logout().then(() => (location.href = 'index.html'));
  });

  // Alterações feitas em outra aba (ex.: painel) refletem aqui sem recarregar
  db.subscribe((source) => {
    if (source === 'remote') renderChrome();
  });

  renderChrome();

  App.site = { hoursGroups, hoursList, openChip, boardItem, renderChrome };
});
