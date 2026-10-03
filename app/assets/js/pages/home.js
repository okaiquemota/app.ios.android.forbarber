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

  /** Linha de informações do perfil: nota, bairro e equipe */
  function renderFacts() {
    const s = db.settings();
    const b = UI.bindings(s);
    const rating = db.ratingSummary();
    const team = db.barbers({ active: true }).length;
    $('#hero-facts').innerHTML = html`
      ${rating.count ? html`<span class="meta-rating"><i class="bi bi-star-fill" aria-hidden="true"></i><strong>${U.number(rating.avg, 1)}</strong> <span class="subtle">(${rating.count} ${rating.count === 1 ? 'avaliação' : 'avaliações'})</span></span>` : ''}
      ${b.district || b.city ? html`<span><i class="bi bi-geo-alt" aria-hidden="true"></i>${[b.district, b.city].filter(Boolean).join(' · ')}</span>` : ''}
      <span><i class="bi bi-people" aria-hidden="true"></i>${team} ${team === 1 ? 'profissional' : 'profissionais'}</span>`;
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
    const list = db.barbers({ active: true });
    $('#home-team').innerHTML = list.length
      ? html`${list.map((b) => html`
        <a class="member" href="agendar.html?profissional=${b.id}">
          ${UI.avatar(b.name, { color: b.color, photo: b.photo, size: 'lg' })}
          <span class="member-name">${b.name}</span>
          <span class="member-role">${b.specialty || b.title}</span>
          <span class="member-cta">Agendar</span>
        </a>`)}`
      : UI.empty('bi-people', 'Equipe em atualização', 'Em breve você conhece nossos profissionais por aqui.');
  }

  /** Planos do clube de assinatura */
  function renderClub() {
    const plans = App.club.plans({ active: true });
    $('#clube').hidden = !plans.length;
    document.querySelector('[data-club-tab]').hidden = !plans.length;
    if (!plans.length) return;
    const s = db.settings();
    const user = App.auth.current();
    const mine = user && !App.auth.isStaff(user) ? App.club.subscriptionOf(user.id) : null;
    $('#home-club').innerHTML = html`${plans.map((p) => {
      const isMine = mine && mine.planId === p.id && App.club.state(mine) === 'ativa';
      const msg = `Olá! Quero assinar o ${p.name} (${U.money(p.price)}/mês) da ${s.name}.`;
      return html`
        <article class="club-plan">
          <div class="stack-sm">
            <h3>${p.name}</h3>
            <div class="price">${U.money(p.price)}<small>/mês</small></div>
          </div>
          <ul>${App.club.features(p).map((f) => html`<li><i class="bi bi-check2"></i>${f}</li>`)}</ul>
          ${isMine
            ? html`<a class="btn btn-outline btn-block" href="minha-conta.html"><i class="bi bi-stars"></i>Seu plano</a>`
            : html`<a class="btn btn-primary btn-block" href="${U.waLink(s.whatsapp, msg)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i>Quero assinar</a>`}
        </article>`;
    })}`;
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

  // Compartilhar o perfil (WhatsApp, Instagram...) ou copiar o link
  $('[data-share]').addEventListener('click', async () => {
    const s = db.settings();
    const url = window.FORBARBER.publicRoot || location.href;
    if (navigator.share) {
      try { await navigator.share({ title: s.name, text: `Agende na ${s.name}`, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    UI.toast((await U.copyText(url)) ? 'Link copiado.' : url, 'info');
  });

  // Aba ativa conforme a rolagem
  const tabs = [...document.querySelectorAll('.profile-tabs a')];
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        tabs.forEach((t) => t.toggleAttribute('aria-current', t.getAttribute('href') === `#${en.target.id}`));
      });
    }, { rootMargin: '-35% 0px -60% 0px' });
    tabs.forEach((t) => { const sec = document.querySelector(t.getAttribute('href')); if (sec) io.observe(sec); });
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
    renderClub();
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
