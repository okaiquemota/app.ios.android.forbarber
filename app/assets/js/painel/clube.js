/* Painel › Clube de assinatura: planos, assinantes, mensalidades e renovações */
window.App.ready(function () {
  'use strict';
  const App = window.App;
  const P = App.painel;
  if (!P) return;
  const U = App.utils;
  const { html, raw, $, $$ } = U;
  const db = App.db;
  const UI = App.ui;
  const B = App.booking;
  const C = App.club;

  let filter = ['ativas', 'vencidas', 'canceladas', 'todas'].includes(U.qs('f')) ? U.qs('f') : 'ativas';
  const STATE_LABEL = { ativa: ['Ativa', 'badge-concluido'], vencida: ['Vencida', 'badge-warning'], pausada: ['Pausada', 'badge-neutral'], cancelada: ['Cancelada', 'badge-cancelado'] };

  /* ---------- Indicadores ---------- */
  function renderKpis() {
    const subs = db.list('subscriptions');
    const active = subs.filter((x) => C.state(x) === 'ativa');
    const overdue = subs.filter((x) => C.state(x) === 'vencida');
    const t = U.today();
    const monthStart = U.startOfMonth(t);
    const received = U.sum(C.payments().filter((p) => p.paidAt.slice(0, 10) >= monthStart), (p) => p.amount);
    const visits = db.appointments({ from: monthStart, to: t, status: 'concluido' }).filter((a) => a.subscriptionId).length;
    $('#club-kpis').innerHTML = html`
      <div class="kpi"><span class="kpi-label"><i class="bi bi-people" aria-hidden="true"></i>Assinantes ativos</span><span class="kpi-value">${active.length}</span><span class="kpi-sub">${overdue.length ? `${overdue.length} vencidas para cobrar` : 'nenhuma vencida'}</span></div>
      <div class="kpi"><span class="kpi-label"><i class="bi bi-arrow-repeat" aria-hidden="true"></i>Receita recorrente</span><span class="kpi-value">${U.money(C.mrr())}</span><span class="kpi-sub">por mês, com os ativos de hoje</span></div>
      <div class="kpi"><span class="kpi-label"><i class="bi bi-cash-coin" aria-hidden="true"></i>Recebido no mês</span><span class="kpi-value">${U.money(received)}</span><span class="kpi-sub">mensalidades registradas</span></div>
      <div class="kpi"><span class="kpi-label"><i class="bi bi-scissors" aria-hidden="true"></i>Visitas do clube no mês</span><span class="kpi-value">${visits}</span><span class="kpi-sub">atendimentos concluídos pelo plano</span></div>`.toString();
  }

  /* ---------- Planos ---------- */
  function renderPlans() {
    const plans = C.plans();
    const count = (id) => db.list('subscriptions').filter((x) => x.planId === id && C.state(x) === 'ativa').length;
    $('#plans').innerHTML = plans.length
      ? html`${plans.map((p) => html`
        <article class="club-plan ${p.active === false ? 'is-off' : ''}">
          <div class="spread"><h3>${p.name}</h3>${p.active === false ? html`<span class="badge badge-neutral">Desativado</span>` : html`<span class="badge badge-primary">${count(p.id)} ${count(p.id) === 1 ? 'assinante' : 'assinantes'}</span>`}</div>
          <div class="price">${U.money(p.price)}<small>/mês</small></div>
          <ul>${C.features(p).map((f) => html`<li><i class="bi bi-check2"></i>${f}</li>`)}</ul>
          <button type="button" class="btn btn-outline btn-sm" data-edit-plan="${p.id}"><i class="bi bi-pencil"></i>Editar plano</button>
        </article>`)}`.toString()
      : UI.empty('bi-stars', 'Nenhum plano ainda', 'Crie um plano, por exemplo "4 cortes por mês", e ele aparece no site da barbearia.',
          html`<button type="button" class="btn btn-primary" data-new-plan>Criar primeiro plano</button>`).toString();
  }

  function openPlanForm(id) {
    const p = id ? C.plan(id) : null;
    const services = db.services({ active: true });
    const m = UI.modal({
      title: p ? 'Editar plano' : 'Novo plano',
      body: html`
        <form id="plan-form" class="form-grid" novalidate>
          <div class="field full"><label class="label" for="pl-name">Nome do plano</label><input class="input" id="pl-name" name="name" value="${p ? p.name : ''}" placeholder="Ex.: Clube Corte" required></div>
          <div class="field"><label class="label" for="pl-price">Mensalidade (R$)</label><input class="input" id="pl-price" name="price" type="number" inputmode="decimal" step="0.01" min="1" value="${p ? p.price : ''}" required></div>
          <div class="field"><label class="label" for="pl-uses">Visitas por mês</label><input class="input" id="pl-uses" name="uses" type="number" min="1" max="60" value="${p && p.usesPerPeriod ? p.usesPerPeriod : ''}" placeholder="Vazio = ilimitado"></div>
          <fieldset class="field full"><legend class="label">Serviços incluídos</legend>
            <div class="svc-picks">${services.map((s) => html`<label class="svc-pick"><input type="checkbox" name="svc" value="${s.id}" ${p && (p.serviceIds || []).includes(s.id) ? raw('checked') : ''}><span class="grow">${s.name}<span>${U.money(s.price)}</span></span></label>`)}</div>
            <span class="error-text"></span></fieldset>
          <div class="field"><label class="label" for="pl-disc">Desconto nos outros serviços (%)</label><input class="input" id="pl-disc" name="discount" type="number" min="0" max="100" value="${p ? p.discountOthers || 0 : 0}"></div>
          <div class="field"><span class="label">No site</span><label class="switch"><input type="checkbox" id="pl-active" ${!p || p.active !== false ? raw('checked') : ''}><span class="track"></span>Plano à venda</label></div>
          <div class="field full"><label class="label" for="pl-desc">Descrição <span class="opt">(opcional)</span></label><input class="input" id="pl-desc" name="description" maxlength="140" value="${p ? p.description || '' : ''}"></div>
        </form>`,
      footer: html`<button type="button" class="btn btn-ghost" data-close>Cancelar</button><button type="button" class="btn btn-primary" data-save><i class="bi bi-check2"></i>Salvar plano</button>`,
    });
    m.el.querySelector('[data-save]').addEventListener('click', () => {
      const form = $('#plan-form', m.body);
      const data = UI.validate(form, {
        name: (v) => (v.length >= 3 ? null : 'Dê um nome ao plano.'),
        price: (v) => (Number(v) > 0 ? null : 'Informe a mensalidade.'),
        uses: (v) => (!v || Number(v) >= 1 ? null : 'Use 1 ou mais, ou deixe vazio para ilimitado.'),
      });
      if (!data) return;
      const serviceIds = $$('input[name="svc"]:checked', form).map((x) => x.value);
      if (!serviceIds.length) {
        const f = form.querySelector('fieldset');
        f.classList.add('invalid');
        f.querySelector('.error-text').textContent = 'Escolha pelo menos um serviço incluído.';
        return;
      }
      const patch = {
        name: data.name.trim(), price: Math.round(Number(data.price) * 100) / 100, usesPerPeriod: data.uses ? Number(data.uses) : null,
        serviceIds, discountOthers: Math.min(100, Math.max(0, Number(data.discount) || 0)), description: data.description || '',
        active: $('#pl-active', m.body).checked,
      };
      if (p) db.update('plans', p.id, patch);
      else db.insert('plans', { ...patch, position: C.plans().length + 1 });
      m.close();
      UI.toast(p ? 'Plano atualizado.' : 'Plano criado. Ele já aparece no site.');
    });
  }

  /* ---------- Assinantes ---------- */
  function renderSubs() {
    const all = db.list('subscriptions').slice().sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : 1));
    const pick = { ativas: (x) => C.state(x) === 'ativa', vencidas: (x) => C.state(x) === 'vencida', canceladas: (x) => C.state(x) === 'cancelada', todas: () => true }[filter];
    const list = all.filter(pick);
    $$('#sub-filter button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === filter)));
    if (!list.length) {
      $('#subs').innerHTML = UI.empty('bi-people', filter === 'ativas' ? 'Nenhum assinante ativo' : 'Nada por aqui', 'Cadastre quem assinou no balcão ou pelo WhatsApp em "Novo assinante".').toString();
      return;
    }
    $('#subs').innerHTML = html`
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Cliente</th><th>Plano</th><th class="hide-md">Uso no mês</th><th>Período</th><th>Situação</th><th><span class="sr-only">Ações</span></th></tr></thead>
        <tbody>${list.map((x) => {
          const c = db.user(x.clientId) || { name: 'Cliente removido', phone: '' };
          const plan = C.plan(x.planId) || { name: '—', usesPerPeriod: 0, price: 0 };
          const st = C.state(x);
          const [label, cls] = STATE_LABEL[st];
          const used = C.usage(x);
          const msg = st === 'vencida'
            ? `Olá, ${U.firstName(c.name)}! Seu ${plan.name} venceu em ${U.fmtDate(x.periodEnd)}. Para continuar usando, é só renovar (${U.money(plan.price)}). Posso te mandar o Pix?`
            : `Olá, ${U.firstName(c.name)}! Passando para lembrar que seu ${plan.name} renova em ${U.fmtDate(U.addDays(x.periodEnd, 1))} (${U.money(plan.price)}).`;
          return html`<tr>
            <td><div class="cell-main">${UI.avatar(c.name, { size: 'sm' })}<div class="grow"><strong>${c.name}</strong><span>${c.phone || ''}</span></div></div></td>
            <td>${plan.name}<br><span class="subtle text-sm">${U.money(plan.price)}/mês</span></td>
            <td class="hide-md">${st === 'ativa' ? (plan.usesPerPeriod ? `${used} de ${plan.usesPerPeriod}` : `${used} (ilimitado)`) : '—'}</td>
            <td class="nowrap">${U.fmtDateShort(x.periodStart)} a ${U.fmtDateShort(x.periodEnd)}</td>
            <td><span class="badge ${cls}">${label}</span></td>
            <td><div class="actions">
              ${st !== 'cancelada' ? html`<button type="button" class="btn btn-success btn-sm" data-pay="${x.id}"><i class="bi bi-cash-coin"></i><span class="hide-md">${st === 'vencida' ? 'Renovar' : 'Mensalidade'}</span></button>` : ''}
              ${st !== 'cancelada' && U.validPhone(c.phone) ? html`<a class="btn btn-whatsapp btn-icon btn-sm" href="${U.waLink(c.phone, msg)}" target="_blank" rel="noopener" aria-label="Cobrar no WhatsApp" title="${st === 'vencida' ? 'Cobrar renovação' : 'Lembrar renovação'}"><i class="bi bi-whatsapp"></i></a>` : ''}
              <button type="button" class="btn btn-ghost btn-icon btn-sm" data-sub="${x.id}" aria-label="Detalhes" title="Detalhes"><i class="bi bi-three-dots"></i></button>
            </div></td>
          </tr>`;
        })}</tbody>
      </table></div>`.toString();
  }

  function openPayment(id) {
    const x = db.get('subscriptions', id);
    const plan = C.plan(x.planId);
    const next = C.nextPeriod(x);
    const m = UI.modal({
      title: 'Registrar mensalidade',
      size: 'sm',
      body: html`
        <p class="muted">${(db.user(x.clientId) || {}).name} · ${plan.name}</p>
        <div class="notice"><i class="bi bi-calendar-range"></i><div>Novo período: <strong>${U.fmtDate(next.start)} a ${U.fmtDate(next.end)}</strong></div></div>
        <fieldset class="field"><legend class="label">Forma de pagamento</legend>
          <div class="pay-options">${Object.entries(B.PAYMENTS).map(([k, p], i) => html`<label class="pay-option"><input type="radio" name="pay" value="${k}" ${i === 0 ? raw('checked') : ''}><i class="bi ${p.icon}" aria-hidden="true"></i>${p.label}</label>`)}</div>
        </fieldset>
        <div class="field"><label class="label" for="sp-amount">Valor recebido (R$)</label><input class="input" id="sp-amount" type="number" inputmode="decimal" step="0.01" min="0" value="${plan.price}"></div>`,
      footer: html`<button type="button" class="btn btn-ghost" data-close>Voltar</button><button type="button" class="btn btn-success" data-ok><i class="bi bi-check2-circle"></i>Registrar</button>`,
    });
    m.el.querySelector('[data-ok]').addEventListener('click', () => {
      const amount = Number($('#sp-amount', m.body).value);
      if (!(amount >= 0)) return UI.setError($('#sp-amount', m.body), 'Informe o valor.');
      C.registerPayment(x.id, { amount, method: m.body.querySelector('input[name="pay"]:checked').value });
      m.close();
      UI.toast(`Mensalidade registrada. Plano válido até ${U.fmtDate(next.end)}.`);
    });
  }

  function openSubDetails(id) {
    const x = db.get('subscriptions', id);
    const c = db.user(x.clientId) || { name: 'Cliente removido' };
    const plan = C.plan(x.planId) || { name: '—' };
    const pays = C.payments(x.id);
    const visits = db.appointments({ clientId: x.clientId }).filter((a) => a.subscriptionId === x.id).sort(db.byDateTime).reverse().slice(0, 8);
    const m = UI.modal({
      title: 'Assinatura',
      size: 'lg',
      body: html`
        <div class="detail-head">${UI.avatar(c.name, { size: 'lg' })}<div class="grow"><strong>${c.name}</strong><span>${plan.name} · desde ${U.fmtDate(x.startedAt)}</span></div><span class="badge ${STATE_LABEL[C.state(x)][1]}">${STATE_LABEL[C.state(x)][0]}</span></div>
        <div class="grid-halves">
          <div><span class="label">Mensalidades</span>
            <ul class="detail-list" style="margin-top:.4rem">${pays.length ? pays.map((p) => html`<li><span>${U.fmtDate(p.paidAt.slice(0, 10))} · ${(B.PAYMENTS[p.method] || { label: p.method }).label}</span><span class="num">${U.money(p.amount)}</span></li>`) : html`<li><span class="subtle">Nenhuma registrada</span></li>`}</ul></div>
          <div><span class="label">Visitas pelo plano</span>
            <ul class="detail-list" style="margin-top:.4rem">${visits.length ? visits.map((a) => html`<li><span>${U.fmtDate(a.date)} · ${a.services.map((s) => s.name).join(' + ')}</span>${UI.statusBadge(a.status)}</li>`) : html`<li><span class="subtle">Nenhuma ainda</span></li>`}</ul></div>
        </div>`,
      footer: html`
        ${x.status !== 'cancelada' ? html`<button type="button" class="btn btn-danger btn-sm left" data-cancel-sub><i class="bi bi-x-lg"></i>Cancelar assinatura</button>` : ''}
        <button type="button" class="btn btn-ghost" data-close>Fechar</button>`,
    });
    const cancel = m.el.querySelector('[data-cancel-sub]');
    if (cancel) cancel.addEventListener('click', async () => {
      const ok = await UI.confirm({ title: 'Cancelar assinatura', message: `${c.name} deixa de ter os benefícios do ${plan.name}. O histórico continua guardado.`, confirmText: 'Cancelar assinatura', danger: true });
      if (!ok) return;
      db.update('subscriptions', x.id, { status: 'cancelada' });
      m.close();
      UI.toast('Assinatura cancelada.', 'info');
    });
  }

  function openNewSub() {
    const plans = C.plans({ active: true });
    if (!plans.length) return UI.toast('Crie um plano antes de cadastrar assinantes.', 'error');
    const clients = db.clients().slice().sort((a, b) => a.name.localeCompare(b.name));
    const m = UI.modal({
      title: 'Novo assinante',
      body: html`
        <form id="sub-form" class="stack" novalidate>
          <div class="field"><label class="label" for="ns-client">Cliente</label>
            <select class="select" id="ns-client" name="client"><option value="">Escolha o cliente</option>${clients.map((c) => html`<option value="${c.id}">${c.name}${c.phone ? ` · ${c.phone}` : ''}</option>`)}</select>
            <span class="help">Cliente novo? Cadastre antes em Clientes.</span></div>
          <div class="field"><label class="label" for="ns-plan">Plano</label>
            <select class="select" id="ns-plan" name="plan">${plans.map((p) => html`<option value="${p.id}">${p.name} · ${U.money(p.price)}/mês</option>`)}</select></div>
          <fieldset class="field"><legend class="label">Primeira mensalidade</legend>
            <div class="pay-options">${Object.entries(B.PAYMENTS).map(([k, p], i) => html`<label class="pay-option"><input type="radio" name="pay" value="${k}" ${i === 0 ? raw('checked') : ''}><i class="bi ${p.icon}" aria-hidden="true"></i>${p.label}</label>`)}</div>
            <label class="check" style="margin-top:.5rem"><input type="checkbox" id="ns-later"> Ainda não pagou (registro o pagamento depois)</label>
          </fieldset>
        </form>`,
      footer: html`<button type="button" class="btn btn-ghost" data-close>Cancelar</button><button type="button" class="btn btn-primary" data-save><i class="bi bi-check2"></i>Cadastrar</button>`,
    });
    m.el.querySelector('[data-save]').addEventListener('click', () => {
      const form = $('#sub-form', m.body);
      const data = UI.validate(form, { client: (v) => (v ? null : 'Escolha o cliente.') });
      if (!data) return;
      const old = C.subscriptionOf(data.client);
      if (old && C.state(old) === 'ativa' && old.planId === data.plan) return UI.setError(form.elements.client, 'Esse cliente já tem este plano ativo.');
      C.subscribe(data.client, data.plan, { paid: !$('#ns-later', m.body).checked, method: form.querySelector('input[name="pay"]:checked').value });
      m.close();
      UI.toast('Assinante cadastrado. Os agendamentos dele já usam o plano.');
    });
  }

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('#new-plan') || t.closest('[data-new-plan]')) return openPlanForm();
    if (t.closest('#new-sub')) return openNewSub();
    const ep = t.closest('[data-edit-plan]');
    if (ep) return openPlanForm(ep.dataset.editPlan);
    const pay = t.closest('[data-pay]');
    if (pay) return openPayment(pay.dataset.pay);
    const det = t.closest('[data-sub]');
    if (det) return openSubDetails(det.dataset.sub);
    const f = t.closest('#sub-filter [data-f]');
    if (f) {
      filter = f.dataset.f;
      renderSubs();
    }
  });

  function render() {
    renderKpis();
    renderPlans();
    renderSubs();
  }
  render();
  P.onChange(render);
});
