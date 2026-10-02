/* Página inicial: dados vivos vindos da camada de dados (equipe, preços, avaliações, horários) */
window.App.ready(function () {
  'use strict';
  const App = window.App;
  const U = App.utils;
  const { html, raw, $ } = U;
  const db = App.db;
  const UI = App.ui;
  const B = App.booking;

  let nextService = null;

  function renderStatus() {
    $('#open-status').innerHTML = App.site.openChip();
  }

  function renderFacts() {
    const s = db.settings();
    const rating = db.ratingSummary();
    const team = db.barbers({ active: true }).length;
    const years = s.foundedYear ? new Date().getFullYear() - Number(s.foundedYear) : 0;
    $('#hero-facts').innerHTML = html`
      ${rating.count ? html`<div class="fact"><strong>${U.number(rating.avg, 1)}<i class="bi bi-star-fill" aria-hidden="true"></i></strong><span>nota média em ${rating.count} avaliações</span></div>` : ''}
      <div class="fact"><strong>${team}</strong><span>${team === 1 ? 'barbeiro' : 'barbeiros'} na equipe</span></div>
      ${years > 0 ? html`<div class="fact"><strong>${years}+</strong><span>anos de casa</span></div>` : ''}`;
  }

  /** Cartão interativo: escolha o serviço e veja o próximo horário livre de verdade */
  function renderNextSlot() {
    const el = $('#next-slot');
    const services = db.services({ active: true });
    if (!services.length || !db.barbers({ active: true }).length) {
      el.hidden = true;
      return;
    }
    if (!nextService || !db.service(nextService)) nextService = (services.find((s) => s.featured) || services[0]).id;
    const svc = db.service(nextService);
    const next = B.nextAvailable({ duration: svc.duration });
    const barber = next && db.barber(next.barberId);
    el.innerHTML = html`
      <span class="eyebrow plain"><i class="bi bi-lightning-charge-fill" aria-hidden="true"></i>Próximo horário livre</span>
      <label class="field">
        <span class="sr-only">Serviço</span>
        <select class="select" id="ns-service">
          ${services.map((s) => html`<option value="${s.id}" ${s.id === nextService ? raw('selected') : ''}>${s.name} · ${U.fmtDuration(s.duration)} · ${U.money(s.price)}</option>`)}
        </select>
      </label>
      ${next && barber
        ? html`
          <div class="next-slot-when">${U.fmtDateHuman(next.date)} às ${next.time}<small>${U.fmtDateLong(next.date)}</small></div>
          <div class="next-slot-who">
            ${UI.avatar(barber.name, { color: barber.color, photo: barber.photo })}
            <div><strong>${barber.name}</strong><span class="text-sm subtle">${barber.specialty}</span></div>
          </div>
          <a class="btn btn-primary btn-block" href="agendar.html?servico=${svc.id}&profissional=${barber.id}&data=${next.date}&hora=${next.time}">
            <i class="bi bi-check2"></i>Reservar este horário</a>`
        : html`<p class="muted">A agenda está cheia nos próximos dias. Chame a gente no WhatsApp que encaixamos você.</p>`}
      <a class="link text-sm" href="agendar.html">Escolher outro dia ou barbeiro <i class="bi bi-arrow-right"></i></a>`;
    $('#ns-service').addEventListener('change', (e) => {
      nextService = e.target.value;
      renderNextSlot();
    });
  }

  function renderServices() {
    const list = db.services({ active: true });
    const featured = list.filter((s) => s.featured);
    $('#home-services').innerHTML = html`${(featured.length ? featured : list).slice(0, 8).map(App.site.boardItem)}`;
  }

  function renderTeam() {
    const order = [1, 2, 3, 4, 5, 6, 0];
    const list = db.barbers({ active: true });
    $('#home-team').innerHTML = list.length
      ? html`${list.map((b) => html`
        <article class="member">
          <div class="member-top">
            ${UI.avatar(b.name, { color: b.color, photo: b.photo, size: 'lg' })}
            <div><h3 class="member-name">${b.name}</h3><p class="member-role">${b.title}</p></div>
          </div>
          ${b.bio ? html`<p class="member-bio">${b.bio}</p>` : ''}
          ${b.specialty ? html`<p class="member-spec"><i class="bi bi-scissors" aria-hidden="true"></i>${b.specialty}</p>` : ''}
          <div>
            <span class="sr-only">Atende: ${order.filter((d) => b.workDays.includes(d)).map((d) => U.WEEKDAYS[d]).join(', ')}</span>
            <div class="week-days" aria-hidden="true">
              ${order.map((d) => html`<span class="${b.workDays.includes(d) ? 'on' : ''}">${U.WEEKDAYS_SHORT[d]}</span>`)}
            </div>
          </div>
          <a class="btn btn-outline btn-block" href="agendar.html?profissional=${b.id}">Agendar com ${U.firstName(b.name)}</a>
        </article>`)}`
      : UI.empty('bi-people', 'Equipe em atualização', 'Em breve você conhece nossos barbeiros por aqui.');
  }

  function renderReviews() {
    const summary = db.ratingSummary();
    $('#rating-summary').innerHTML = summary.count
      ? html`<span class="rating-big">${U.number(summary.avg, 1)}</span>
          <div>${UI.stars(summary.avg)}<div class="text-sm subtle">${summary.count} avaliações de clientes</div></div>`
      : '';
    const list = db.reviews({ visible: true }).slice(0, 6);
    $('#home-reviews').innerHTML = list.length
      ? html`${list.map((r) => {
          const barber = db.barber(r.barberId);
          return html`
            <figure class="review">
              ${UI.stars(r.rating)}
              <blockquote>“${r.text}”</blockquote>
              <figcaption class="review-author">
                ${UI.avatar(r.name, { size: 'sm' })}
                <div><strong>${r.name}</strong><span class="text-xs subtle">${barber ? `Atendido por ${U.firstName(barber.name)} · ` : ''}${U.relTime(r.createdAt)}</span></div>
              </figcaption>
            </figure>`;
        })}`
      : UI.empty('bi-chat-heart', 'Ainda sem avaliações', 'Depois do seu atendimento, conte pra gente como foi.');
  }

  function renderHours() {
    $('#home-hours').innerHTML = App.site.hoursList();
  }

  $('[data-load-map]').addEventListener('click', () => {
    const card = $('#map-card');
    const q = encodeURIComponent(UI.bindings(db.settings()).fullAddress);
    card.innerHTML = `<iframe title="Mapa com a localização da barbearia" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?q=${q}&z=16&output=embed"></iframe>`;
    card.classList.add('loaded');
  });

  function renderAll() {
    renderStatus();
    renderFacts();
    renderNextSlot();
    renderServices();
    renderTeam();
    renderReviews();
    renderHours();
    UI.applyBranding();
  }

  renderAll();
  db.subscribe((source) => {
    if (source === 'remote') renderAll();
  });
  setInterval(() => {
    renderStatus();
    if (document.activeElement?.id !== 'ns-service') renderNextSlot();
  }, 60000);
});
