/* Configurações: dados da barbearia, identidade visual, horários, regras e backup.
   Tudo é aplicado no site na hora — é aqui que se troca nome, cor e logo
   para apresentar o modelo a outra barbearia. */
(function () {
  'use strict';
  const App = window.App;
  const P = App.painel;
  if (!P) return;
  const U = App.utils;
  const { html, raw, $, $$ } = U;
  const db = App.db;
  const UI = App.ui;

  const PRESETS = [
    ['#f39c12', 'Dourado'], ['#d4a373', 'Cobre'], ['#c0392b', 'Vermelho barbeiro'], ['#2e86de', 'Azul'],
    ['#27ae60', 'Verde'], ['#b8b8b8', 'Prata'], ['#e84393', 'Rosa'], ['#8e44ad', 'Roxo'],
  ];
  const FONTS = [
    ['classico', 'Clássico', "'Rye', serif"],
    ['moderno', 'Moderno', "'Barlow Condensed', sans-serif"],
    ['elegante', 'Elegante', "'Playfair Display', serif"],
  ];

  const section = (id, icon, title, sub, body, extraClass = '') => html`
    <section class="panel settings-section ${extraClass}" id="${id}">
      <div class="panel-head"><div><h2 class="panel-title"><i class="bi ${icon}" aria-hidden="true"></i>${title}</h2>${sub ? html`<p class="panel-sub">${sub}</p>` : ''}</div></div>
      <div class="panel-body">${body}</div>
    </section>`;

  function render() {
    const s = db.settings();
    const a = s.address || {};
    const hoursOrder = [1, 2, 3, 4, 5, 6, 0];
    $('#settings').innerHTML = html`
      ${section('s-barbearia', 'bi-shop', 'Barbearia', 'Aparece no cabeçalho, rodapé, contato e mensagens de WhatsApp.', html`
        <form id="f-info" class="form-grid" novalidate>
          <div class="field"><label class="label" for="st-name">Nome da barbearia</label><input class="input" id="st-name" name="name" value="${s.name}" required></div>
          <div class="field"><label class="label" for="st-year">Fundada em</label><input class="input" id="st-year" name="foundedYear" type="number" min="1900" max="2100" value="${s.foundedYear || ''}"></div>
          <div class="field full"><label class="label" for="st-slogan">Slogan</label><input class="input" id="st-slogan" name="slogan" value="${s.slogan}" maxlength="70"></div>
          <div class="field full"><label class="label" for="st-about">Sobre a barbearia</label><textarea class="textarea" id="st-about" name="about" rows="3" maxlength="400">${s.about}</textarea></div>
          <div class="field"><label class="label" for="st-wa">WhatsApp</label><input class="input" id="st-wa" name="whatsapp" type="tel" value="${s.whatsapp}" required></div>
          <div class="field"><label class="label" for="st-phone">Telefone</label><input class="input" id="st-phone" name="phone" type="tel" value="${s.phone}"></div>
          <div class="field"><label class="label" for="st-email">E-mail</label><input class="input" id="st-email" name="email" type="email" value="${s.email}"></div>
          <div class="field"><label class="label" for="st-ig">Instagram</label><input class="input" id="st-ig" name="instagram" value="${s.instagram}" placeholder="sem @"></div>
          <div class="field full"><label class="label" for="st-street">Endereço</label><input class="input" id="st-street" name="street" value="${a.street || ''}"></div>
          <div class="field"><label class="label" for="st-district">Bairro</label><input class="input" id="st-district" name="district" value="${a.district || ''}"></div>
          <div class="field"><label class="label" for="st-cep">CEP</label><input class="input" id="st-cep" name="cep" value="${a.cep || ''}"></div>
          <div class="field"><label class="label" for="st-city">Cidade</label><input class="input" id="st-city" name="city" value="${a.city || ''}"></div>
          <div class="field"><label class="label" for="st-state">UF</label><input class="input" id="st-state" name="state" value="${a.state || ''}" maxlength="2"></div>
          <div class="full"><button class="btn btn-primary" type="submit"><i class="bi bi-check2"></i>Salvar dados</button></div>
        </form>`)}

      ${section('s-aparencia', 'bi-palette', 'Aparência', 'Muda na hora em todas as páginas.', html`
        <div class="stack-lg">
          <fieldset class="field"><legend class="label">Cor principal</legend>
            <div class="swatches">
              ${PRESETS.map(([c, n]) => html`<button type="button" class="swatch" style="--sw:${c}" data-color="${c}" aria-pressed="${c.toLowerCase() === s.primaryColor.toLowerCase()}" aria-label="${n}" title="${n}"></button>`)}
              <label class="cluster-sm text-sm muted"><input class="input" type="color" id="st-color" value="${s.primaryColor}" aria-label="Outra cor">Outra cor</label>
            </div></fieldset>
          <fieldset class="field"><legend class="label">Estilo dos títulos</legend>
            <div class="font-options">${FONTS.map(([k, label, family]) => html`
              <label class="opt"><input type="radio" name="font" value="${k}" ${s.fontStyle === k ? raw('checked') : ''}>
                <span class="opt-body" style="display:block"><span class="font-sample" style="display:block;font-family:${family};${k === 'moderno' ? 'text-transform:uppercase' : ''}">${s.name}</span><span class="text-sm subtle">${label}</span></span></label>`)}
            </div></fieldset>
          <div class="grid-2">
            <div class="field"><span class="label">Logo</span>
              <div class="image-field">
                <span class="image-preview" style="background-image:url('${s.logo || '../assets/img/logo.png'}')"></span>
                <div class="cluster-sm">
                  <label class="btn btn-outline btn-sm file-btn"><i class="bi bi-upload"></i>Enviar<input type="file" accept="image/*" data-image="logo"></label>
                  ${s.logo ? html`<button type="button" class="btn btn-ghost btn-sm" data-clear="logo">Usar padrão</button>` : ''}
                </div>
              </div><span class="help">PNG com fundo transparente fica melhor.</span></div>
            <div class="field"><span class="label">Foto de capa (início)</span>
              <div class="image-field">
                <span class="image-preview wide" style="background-image:url('${s.heroImage || '../assets/img/ambiente.jpg'}')"></span>
                <div class="cluster-sm">
                  <label class="btn btn-outline btn-sm file-btn"><i class="bi bi-upload"></i>Enviar<input type="file" accept="image/*" data-image="heroImage"></label>
                  ${s.heroImage ? html`<button type="button" class="btn btn-ghost btn-sm" data-clear="heroImage">Usar padrão</button>` : ''}
                </div>
              </div><span class="help">Foto horizontal do salão, de preferência escura.</span></div>
          </div>
        </div>`)}

      ${section('s-horarios', 'bi-clock', 'Horário de funcionamento', 'Define os horários oferecidos no agendamento online.', html`
        <form id="f-hours" class="stack" novalidate>
          <div class="hours-grid">${hoursOrder.map((d) => {
            const h = s.hours[d];
            return html`<div class="hours-row ${h.closed ? 'closed' : ''}" data-day="${d}">
              <strong>${U.WEEKDAYS[d]}</strong>
              <label class="switch"><input type="checkbox" name="open-${d}" ${h.closed ? '' : raw('checked')}><span class="track"></span><span class="sr-only">Aberto</span></label>
              <input class="input" type="time" name="from-${d}" value="${h.open}" aria-label="Abre ${U.WEEKDAYS[d]}" ${h.closed ? raw('disabled') : ''}>
              <input class="input" type="time" name="to-${d}" value="${h.close}" aria-label="Fecha ${U.WEEKDAYS[d]}" ${h.closed ? raw('disabled') : ''}>
            </div>`;
          })}</div>
          <div><button class="btn btn-primary" type="submit"><i class="bi bi-check2"></i>Salvar horários</button></div>
        </form>`)}

      ${section('s-regras', 'bi-sliders', 'Regras do agendamento', '', html`
        <form id="f-rules" class="form-grid" novalidate>
          <div class="field"><label class="label" for="st-int">Intervalo entre horários</label>
            <select class="select" id="st-int" name="slotInterval">${[15, 20, 30, 45, 60].map((v) => html`<option value="${v}" ${Number(s.slotInterval) === v ? raw('selected') : ''}>${v} minutos</option>`)}</select></div>
          <div class="field"><label class="label" for="st-adv">Antecedência mínima</label>
            <select class="select" id="st-adv" name="minAdvance">${[0, 30, 60, 120, 240].map((v) => html`<option value="${v}" ${Number(s.minAdvance) === v ? raw('selected') : ''}>${v ? U.fmtDuration(v) : 'Sem mínimo'}</option>`)}</select></div>
          <div class="field"><label class="label" for="st-win">Agenda aberta para os próximos</label>
            <select class="select" id="st-win" name="bookingWindow">${[7, 14, 30, 60].map((v) => html`<option value="${v}" ${Number(s.bookingWindow) === v ? raw('selected') : ''}>${v} dias</option>`)}</select></div>
          <div class="field"><label class="label" for="st-cancel">Cliente cancela até</label>
            <select class="select" id="st-cancel" name="cancelLimit">${[0, 1, 2, 6, 12, 24].map((v) => html`<option value="${v}" ${Number(s.cancelLimit) === v ? raw('selected') : ''}>${v ? `${v}h antes` : 'a qualquer momento'}</option>`)}</select></div>
          <div class="field"><label class="label" for="st-loyal">Cartão fidelidade: corte grátis a cada</label>
            <select class="select" id="st-loyal" name="loyaltyTarget">${[5, 8, 10, 12].map((v) => html`<option value="${v}" ${Number(s.loyaltyTarget) === v ? raw('selected') : ''}>${v} atendimentos</option>`)}</select></div>
          <div class="full"><button class="btn btn-primary" type="submit"><i class="bi bi-check2"></i>Salvar regras</button></div>
        </form>`)}

      ${section('s-dados', 'bi-database', 'Dados e demonstração', `Usando ${db.sizeKB()} KB do armazenamento deste navegador.`, html`
        <div class="stack">
          <label class="switch"><input type="checkbox" id="st-demo" ${s.demoMode ? raw('checked') : ''}><span class="track"></span>Modo demonstração (faixa no topo, acessos de teste no login e datas sempre atualizadas)</label>
          <div class="cluster">
            <button type="button" class="btn btn-outline btn-sm" id="export-json"><i class="bi bi-download"></i>Baixar backup</button>
            <label class="btn btn-outline btn-sm file-btn"><i class="bi bi-upload"></i>Restaurar backup<input type="file" accept="application/json,.json" id="import-json"></label>
            <button type="button" class="btn btn-outline btn-sm" id="reset-demo"><i class="bi bi-arrow-counterclockwise"></i>Recarregar dados de exemplo</button>
            <button type="button" class="btn btn-danger btn-sm" id="wipe"><i class="bi bi-eraser"></i>Começar do zero</button>
          </div>
          <p class="help">“Começar do zero” apaga clientes, agendamentos e mensagens, mas mantém serviços, equipe, acessos e estas configurações.</p>
        </div>`, 'danger-zone')}`.toString();

    UI.maskPhone($('#st-wa'));
    UI.maskPhone($('#st-phone'));
  }

  const save = (patch, msg = 'Configurações salvas. O site já foi atualizado.') => {
    if (db.saveSettings(patch)) UI.toast(msg);
  };

  document.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    if (form.id === 'f-info') {
      const d = UI.validate(form, {
        name: UI.rules.required('o nome'),
        whatsapp: UI.rules.phone,
        email: (v) => (!v || U.validEmail(v) ? null : 'E-mail inválido.'),
      });
      if (!d) return;
      save({
        name: d.name, slogan: d.slogan, about: d.about, foundedYear: Number(d.foundedYear) || '',
        whatsapp: U.fmtPhone(d.whatsapp), phone: d.phone ? U.fmtPhone(d.phone) : '', email: d.email,
        instagram: String(d.instagram || '').replace(/^@/, ''),
        address: { street: d.street, district: d.district, city: d.city, state: String(d.state || '').toUpperCase(), cep: d.cep },
      });
    } else if (form.id === 'f-hours') {
      const hours = db.settings().hours.map((h) => ({ ...h }));
      for (let d = 0; d < 7; d++) {
        const open = form.elements[`open-${d}`].checked;
        const from = form.elements[`from-${d}`].value;
        const to = form.elements[`to-${d}`].value;
        if (open && (!from || !to || U.toMin(to) <= U.toMin(from))) {
          return UI.toast(`Confira o horário de ${U.WEEKDAYS[d].toLowerCase()}: o fechamento precisa ser depois da abertura.`, 'error');
        }
        hours[d] = { closed: !open, open: from || hours[d].open, close: to || hours[d].close };
      }
      save({ hours }, 'Horários salvos. O agendamento online já usa os novos horários.');
    } else if (form.id === 'f-rules') {
      const d = UI.formData(form);
      save({
        slotInterval: Number(d.slotInterval), minAdvance: Number(d.minAdvance), bookingWindow: Number(d.bookingWindow),
        cancelLimit: Number(d.cancelLimit), loyaltyTarget: Number(d.loyaltyTarget),
      });
    }
  });

  document.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.name && t.name.startsWith('open-')) {
      const row = t.closest('.hours-row');
      row.classList.toggle('closed', !t.checked);
      $$('input[type="time"]', row).forEach((i) => (i.disabled = !t.checked));
    } else if (t.name === 'font') {
      save({ fontStyle: t.value }, 'Estilo dos títulos atualizado.');
    } else if (t.id === 'st-color') {
      save({ primaryColor: t.value }, 'Cor atualizada.');
      render();
    } else if (t.id === 'st-demo') {
      save({ demoMode: t.checked }, t.checked ? 'Modo demonstração ligado.' : 'Modo demonstração desligado.');
    } else if (t.dataset.image) {
      try {
        const isLogo = t.dataset.image === 'logo';
        const url = await U.readImage(t.files[0], isLogo ? 320 : 1600, isLogo ? 'image/png' : 'image/jpeg', 0.82);
        save({ [t.dataset.image]: url }, isLogo ? 'Logo atualizado.' : 'Foto de capa atualizada.');
        render();
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    } else if (t.id === 'import-json') {
      const file = t.files[0];
      if (!file) return;
      try {
        db.importJSON(await file.text());
        UI.flash('Backup restaurado.');
        location.reload();
      } catch (err) {
        UI.toast(err.message || 'Arquivo inválido.', 'error');
      }
    }
  });

  document.addEventListener('click', async (e) => {
    const sw = e.target.closest('[data-color]');
    if (sw) {
      save({ primaryColor: sw.dataset.color }, 'Cor atualizada.');
      return render();
    }
    const clear = e.target.closest('[data-clear]');
    if (clear) {
      save({ [clear.dataset.clear]: '' }, 'Imagem padrão restaurada.');
      return render();
    }
    if (e.target.closest('#export-json')) {
      return U.download(`backup-barbearia-${U.today()}.json`, db.exportJSON(), 'application/json');
    }
    if (e.target.closest('#reset-demo')) {
      const ok = await UI.confirm({ title: 'Recarregar exemplo', message: 'Tudo volta para os dados de demonstração originais (incluindo nome, cor e logo). Você continua conectado se usar um acesso de teste.', confirmText: 'Recarregar', danger: true });
      if (!ok) return;
      db.reset();
      UI.flash('Dados de exemplo recarregados.');
      location.href = '../login.html';
    }
    if (e.target.closest('#wipe')) {
      const ok = await UI.confirm({ title: 'Começar do zero', message: 'Apaga todos os clientes, agendamentos, avaliações e mensagens. Faça um backup antes se quiser guardar.', confirmText: 'Apagar e começar', danger: true });
      if (!ok) return;
      db.wipe();
      UI.toast('Pronto: base limpa para uso real.', 'info');
      render();
    }
  });

  render();
  if (location.hash) {
    const target = $(location.hash);
    if (target) target.scrollIntoView();
  }
})();
