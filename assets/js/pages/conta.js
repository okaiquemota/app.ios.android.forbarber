/* Área do cliente: próximos horários, histórico com avaliação, fidelidade e dados pessoais */
(function () {
  'use strict';
  const App = window.App;
  const U = App.utils;
  const { html, raw, $, $$ } = U;
  const db = App.db;
  const UI = App.ui;
  const B = App.booking;
  const auth = App.auth;

  const me = auth.requireRole(['cliente']);
  if (!me) return;
  const userId = me.id;
  const user = () => db.user(userId);

  const isUpcoming = (a) => {
    const t = U.today();
    return a.status === 'confirmado' && (a.date > t || (a.date === t && U.toMin(a.start) + a.duration > U.nowMin()));
  };
  const servicesText = (a) => a.services.map((s) => s.name).join(' + ');
  const endOf = (a) => U.fromMin(U.toMin(a.start) + a.duration);

  function renderHead() {
    const u = user();
    const stats = db.clientStats(u.id);
    const since = U.parseDate(u.createdAt.slice(0, 10));
    $('#account-head').innerHTML = html`
      ${UI.avatar(u.name, { size: 'xl' })}
      <div class="grow">
        <span class="eyebrow plain">Minha conta</span>
        <h1>Olá, ${U.firstName(u.name)}</h1>
        <p class="muted">Cliente desde ${U.MONTHS[since.getMonth()]} de ${since.getFullYear()} · ${U.plural(stats.visits, 'atendimento', 'atendimentos')}</p>
      </div>
      <a class="btn btn-primary" href="agendar.html"><i class="bi bi-calendar-plus"></i>Novo agendamento</a>`;
  }

  /* ---------- Próximos horários ---------- */
  function renderUpcoming() {
    const list = db.appointments({ clientId: userId }).filter(isUpcoming).sort(db.byDateTime);
    const limit = db.settings().cancelLimit;
    $('#panel-agendamentos').innerHTML = list.length
      ? html`<div class="appt-cards">${list.map((a) => {
          const b = db.barber(a.barberId) || { name: 'Equipe' };
          const d = U.parseDate(a.date);
          const can = B.canClientCancel(a);
          return html`
            <article class="appt-card">
              <div class="date-tile" aria-hidden="true">
                <div class="m">${U.MONTHS_SHORT[d.getMonth()]}</div><div class="d">${d.getDate()}</div><div class="w">${U.WEEKDAYS_SHORT[d.getDay()]}</div>
              </div>
              <div class="appt-info">
                <span class="title">${servicesText(a)}</span>
                <div class="meta">
                  <span><i class="bi bi-calendar3" aria-hidden="true"></i>${U.fmtDateHuman(a.date)}, ${a.start} às ${endOf(a)}</span>
                  <span><i class="bi bi-person" aria-hidden="true"></i>${b.name}</span>
                  <span><i class="bi bi-cash" aria-hidden="true"></i>${U.money(a.total)}</span>
                </div>
                ${can ? '' : html`<span class="text-xs subtle">Cancelamento online até ${limit}h antes. Para mudar agora, fale no WhatsApp.</span>`}
              </div>
              <div class="appt-actions">
                <button type="button" class="btn btn-ghost btn-sm" data-ics="${a.id}"><i class="bi bi-calendar-plus"></i>Salvar</button>
                ${can
                  ? html`<a class="btn btn-outline btn-sm" href="agendar.html?remarcar=${a.id}"><i class="bi bi-arrow-repeat"></i>Remarcar</a>
                         <button type="button" class="btn btn-danger btn-sm" data-cancel="${a.id}"><i class="bi bi-x-lg"></i>Cancelar</button>`
                  : html`<a class="btn btn-whatsapp btn-sm" data-link="whatsapp" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i>WhatsApp</a>`}
              </div>
            </article>`;
        })}</div>`
      : UI.empty('bi-calendar-plus', 'Nenhum horário marcado', 'Deixe o próximo corte agendado e garanta o horário que você prefere.',
          html`<a class="btn btn-primary" href="agendar.html">Agendar agora</a>`);
  }

  /* ---------- Histórico ---------- */
  function renderHistory() {
    const reviewed = new Set(db.reviews().filter((r) => r.appointmentId).map((r) => r.appointmentId));
    const list = db.appointments({ clientId: userId }).filter((a) => !isUpcoming(a)).sort(db.byDateTime).reverse();
    $('#panel-historico').innerHTML = list.length
      ? html`<div class="history">${list.map((a) => {
          const b = db.barber(a.barberId) || { name: 'Equipe' };
          const ids = a.services.map((s) => s.id).join(',');
          return html`
            <div class="history-row">
              <div class="grow">
                <strong>${servicesText(a)}</strong>
                <span class="when">${U.fmtDate(a.date)} às ${a.start} · ${b.name} · ${U.money(a.total)}</span>
              </div>
              ${UI.statusBadge(a.status)}
              <div class="cluster-sm">
                ${a.status === 'concluido' && !reviewed.has(a.id)
                  ? html`<button type="button" class="btn btn-outline btn-xs" data-review="${a.id}"><i class="bi bi-star"></i>Avaliar</button>` : ''}
                ${a.status === 'concluido' && reviewed.has(a.id) ? html`<span class="text-xs subtle"><i class="bi bi-star-fill text-primary"></i> Avaliado</span>` : ''}
                <a class="btn btn-ghost btn-xs" href="agendar.html?servico=${ids}&profissional=${a.barberId}"><i class="bi bi-arrow-clockwise"></i>Repetir</a>
              </div>
            </div>`;
        })}</div>`
      : UI.empty('bi-clock-history', 'Seu histórico aparece aqui', 'Depois do primeiro atendimento você vê todos os cortes e pode avaliar cada um.');
  }

  /* ---------- Lateral: fidelidade e ajuda ---------- */
  function renderSide() {
    const s = db.settings();
    const target = Math.max(1, Number(s.loyaltyTarget) || 10);
    const stats = db.clientStats(userId);
    const progress = stats.visits % target;
    const complete = stats.visits > 0 && progress === 0;
    const filled = complete ? target : progress;
    const favId = Object.entries(stats.barbers).sort((a, b) => b[1] - a[1])[0];
    const fav = favId && db.barber(favId[0]);
    $('#account-side').innerHTML = html`
      <section class="loyalty" aria-labelledby="loyalty-title">
        <div class="spread">
          <h2 class="summary-title" id="loyalty-title">Cartão fidelidade</h2>
          <span class="badge badge-primary num">${filled}/${target}</span>
        </div>
        ${target <= 12
          ? html`<div class="stamps" aria-hidden="true">${Array.from({ length: target }, (_, i) => {
              const on = i < filled;
              const last = i === target - 1;
              return html`<span class="stamp ${on ? 'on' : ''} ${last ? 'reward' : ''}"><i class="bi ${last ? 'bi-gift' : 'bi-scissors'}"></i></span>`;
            })}</div>`
          : html`<div class="progress-track"><div class="pole" style="--progress:${(filled / target) * 100}%"></div></div>`}
        <p class="muted text-sm">${complete
          ? 'Cartão completo! Seu próximo corte é por nossa conta. Avise na recepção.'
          : `Faltam ${target - progress} ${target - progress === 1 ? 'atendimento' : 'atendimentos'} para ganhar um corte grátis.`}</p>
      </section>
      <section class="card card-pad stack-sm">
        <h2 class="summary-title">Seus números</h2>
        <div class="summary-list">
          <div class="summary-row"><i class="bi bi-scissors" aria-hidden="true"></i><div><span class="k">Atendimentos</span><span class="v">${stats.visits}</span></div></div>
          <div class="summary-row"><i class="bi bi-calendar-check" aria-hidden="true"></i><div><span class="k">Última visita</span><span class="v">${stats.lastVisit ? U.fmtDate(stats.lastVisit) : '—'}</span></div></div>
          ${fav ? html`<div class="summary-row"><i class="bi bi-heart" aria-hidden="true"></i><div><span class="k">Barbeiro favorito</span><span class="v">${fav.name}</span></div></div>` : ''}
        </div>
      </section>
      <section class="card card-pad stack-sm">
        <h2 class="summary-title">Precisa de ajuda?</h2>
        <p class="muted text-sm">Atrasou, quer encaixe ou tem alguma dúvida? Chama a gente.</p>
        <a class="btn btn-whatsapp btn-block" data-link="whatsapp" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i>Falar no WhatsApp</a>
      </section>`;
  }

  /* ---------- Meus dados ---------- */
  const profileForm = $('#profile-form');
  const passwordForm = $('#password-form');
  UI.maskPhone(profileForm.elements.phone);
  profileForm.elements.birthday.max = U.today();

  function fillProfile() {
    const u = user();
    profileForm.elements.name.value = u.name;
    profileForm.elements.email.value = u.email;
    profileForm.elements.phone.value = u.phone || '';
    profileForm.elements.birthday.value = u.birthday || '';
  }

  profileForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = UI.validate(profileForm, {
      name: (v) => (v.trim().split(/\s+/).length >= 2 ? null : 'Informe nome e sobrenome.'),
      email: (v) => {
        if (!U.validEmail(v)) return 'Digite um e-mail válido.';
        const other = db.userByEmail(v);
        return other && other.id !== userId ? 'Este e-mail já está em uso por outra conta.' : null;
      },
      phone: UI.rules.phone,
    });
    if (!data) return;
    db.update('users', userId, { name: data.name, email: data.email.toLowerCase(), phone: U.fmtPhone(data.phone), birthday: data.birthday || '' });
    UI.toast('Dados atualizados.');
    renderAll();
  });

  passwordForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = UI.validate(passwordForm, {
      current: UI.rules.required('a senha atual'),
      password: UI.rules.password,
      password2: (v, d) => (v === d.password ? null : 'As senhas não conferem.'),
    });
    if (!data) return;
    const res = auth.changePassword(userId, data.current, data.password);
    if (!res.ok) return UI.setError(passwordForm.elements.current, res.error);
    passwordForm.reset();
    UI.toast('Senha alterada com sucesso.');
  });

  $('#delete-account').addEventListener('click', async () => {
    const ok = await UI.confirm({
      title: 'Excluir conta',
      message: 'Seus horários futuros serão cancelados e você sairá da conta. Essa ação não pode ser desfeita.',
      confirmText: 'Excluir conta',
      danger: true,
    });
    if (!ok) return;
    db.appointments({ clientId: userId }).filter(isUpcoming).forEach((a) =>
      db.update('appointments', a.id, { status: 'cancelado', notes: 'Conta excluída pelo cliente.' })
    );
    db.update('users', userId, { active: false, passwordHash: null, salt: null });
    auth.logout();
    UI.flash('Sua conta foi excluída.', 'info');
    location.href = 'index.html';
  });

  /* ---------- Ações dos cartões ---------- */
  function openReview(appt) {
    const b = db.barber(appt.barberId) || { name: 'Equipe' };
    let rating = 5;
    const m = UI.modal({
      title: 'Avaliar atendimento',
      body: html`
        <p class="muted">${servicesText(appt)} com ${b.name} em ${U.fmtDate(appt.date)}.</p>
        <div class="field">
          <span class="label" id="rate-label">Sua nota</span>
          <div class="rate-input" role="radiogroup" aria-labelledby="rate-label">
            ${[1, 2, 3, 4, 5].map((i) => html`<button type="button" class="on" role="radio" aria-checked="${i === 5}" data-rate="${i}" aria-label="${i} ${i === 1 ? 'estrela' : 'estrelas'}"><i class="bi bi-star-fill"></i></button>`)}
          </div>
        </div>
        <div class="field">
          <label class="label" for="r-text">Comentário</label>
          <textarea class="textarea" id="r-text" maxlength="400" placeholder="Conte como foi o atendimento"></textarea>
        </div>`,
      footer: html`<button type="button" class="btn btn-ghost" data-close>Agora não</button>
        <button type="button" class="btn btn-primary" data-send><i class="bi bi-send"></i>Enviar avaliação</button>`,
    });
    m.body.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-rate]');
      if (!btn) return;
      rating = Number(btn.dataset.rate);
      $$('[data-rate]', m.body).forEach((x) => {
        x.classList.toggle('on', Number(x.dataset.rate) <= rating);
        x.setAttribute('aria-checked', String(Number(x.dataset.rate) === rating));
      });
    });
    m.el.querySelector('[data-send]').addEventListener('click', () => {
      const ta = $('#r-text', m.body);
      const text = ta.value.trim();
      if (text.length < 5) return UI.setError(ta, 'Escreva pelo menos uma frase curta.');
      const u = user();
      db.insert('reviews', {
        clientId: u.id, name: u.name, rating, text, barberId: appt.barberId, appointmentId: appt.id, visible: true,
      });
      m.close();
      UI.toast('Obrigado! Sua avaliação já aparece na página inicial.');
      renderAll();
    });
  }

  document.addEventListener('click', async (e) => {
    const cancelBtn = e.target.closest('[data-cancel]');
    if (cancelBtn) {
      const a = db.get('appointments', cancelBtn.dataset.cancel);
      if (!a || !B.canClientCancel(a)) return UI.toast('Esse horário não pode mais ser cancelado pelo site.', 'error');
      const ok = await UI.confirm({
        title: 'Cancelar horário',
        message: `Cancelar ${servicesText(a)} de ${U.fmtDateHuman(a.date).toLowerCase()} às ${a.start}? O horário fica livre para outra pessoa.`,
        confirmText: 'Cancelar horário',
        cancelText: 'Manter',
        danger: true,
      });
      if (!ok) return;
      db.update('appointments', a.id, { status: 'cancelado', notes: [a.notes, 'Cancelado pelo cliente.'].filter(Boolean).join(' ') });
      UI.toast('Horário cancelado.', 'info');
      renderAll();
      return;
    }
    const icsBtn = e.target.closest('[data-ics]');
    if (icsBtn) {
      const a = db.get('appointments', icsBtn.dataset.ics);
      const s = db.settings();
      const b = db.barber(a.barberId) || { name: '' };
      U.download('agendamento-barbearia.ics', U.icsEvent({
        title: `${servicesText(a)} · ${s.name}`, description: `Com ${b.name}. Valor: ${U.money(a.total)}.`,
        location: UI.bindings(s).fullAddress, date: a.date, start: a.start, duration: a.duration,
      }), 'text/calendar;charset=utf-8');
      return;
    }
    const reviewBtn = e.target.closest('[data-review]');
    if (reviewBtn) openReview(db.get('appointments', reviewBtn.dataset.review));
  });

  function renderAll() {
    if (!user() || user().active === false) return;
    renderHead();
    renderUpcoming();
    renderHistory();
    renderSide();
    UI.applyBranding();
  }

  UI.tabs($('.tabs'), (tab) => history.replaceState(null, '', `#${tab}`));
  fillProfile();
  renderAll();
  db.subscribe((source) => {
    if (source === 'remote') renderAll();
  });
  window.addEventListener('hashchange', () => {
    const btn = $(`[data-tab="${location.hash.slice(1)}"]`);
    if (btn) btn.click();
  });
})();
