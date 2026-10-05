/* Produtos: estoque (com alerta de baixo), vendas do balcão e da comanda, entrada de mercadoria */
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
  const K = App.comanda;
  const admin = P.isAdmin;
  // Barbeiro vê o estoque e as próprias vendas; o dono vê tudo e edita
  const scope = P.scopeBarberId || undefined;

  const STOCK_FILTERS = [['todos', 'Todos'], ['baixo', 'Estoque baixo'], ['inativos', 'Fora de venda']];
  const PERIODS = [['7d', '7 dias'], ['30d', '30 dias'], ['mes', 'Este mês'], ['mes-passado', 'Mês passado']];
  const state = {
    filter: new URLSearchParams(location.search).get('f') === 'baixo' ? 'baixo' : 'todos',
    q: '',
    period: '30d',
    barber: scope || '',
  };

  $('#new-product').hidden = !admin;
  $('#commission-panel').hidden = !admin;
  $('#stock-filter').innerHTML = html`${STOCK_FILTERS.filter(([k]) => admin || k !== 'inativos').map(([k, l]) => html`<button type="button" data-f="${k}" aria-pressed="${k === state.filter}">${l}</button>`)}`.toString();
  $('#sales-period').innerHTML = html`${PERIODS.map(([k, l]) => html`<button type="button" data-p="${k}" aria-pressed="${k === state.period}">${l}</button>`)}`.toString();
  $('#f-barber').innerHTML = html`${admin ? raw('<option value="">Toda a equipe</option>') : ''}${db.barbers().filter((b) => admin || b.id === scope).map((b) => html`<option value="${b.id}">${b.name}</option>`)}`.toString();
  $('#f-barber').value = state.barber;
  $('#prod-commission').value = K.commissionRate();

  /* ---------- Resumo ---------- */
  function renderKpis() {
    const t = U.today();
    const month = K.sales({ from: U.startOfMonth(t), to: t, barberId: scope });
    const top = {};
    month.forEach((s) => s.items.forEach((i) => (top[i.name] = (top[i.name] || 0) + i.qty)));
    const best = Object.entries(top).sort((a, b) => b[1] - a[1])[0];
    const low = K.lowStock();
    const active = K.products({ active: true });
    const units = U.sum(active, (p) => Math.max(0, p.stock));
    const atCost = U.sum(active, (p) => Math.max(0, p.stock) * (p.cost || 0));
    const atPrice = U.sum(active, (p) => Math.max(0, p.stock) * p.price);
    $('#kpis').innerHTML = html`
      <div class="kpi"><span class="kpi-label"><i class="bi bi-bag-check" aria-hidden="true"></i>${scope ? 'Minhas vendas no mês' : 'Vendido no mês'}</span>
        <span class="kpi-value">${U.money(U.sum(month, (s) => s.total))}</span>
        <span class="kpi-sub"><span>${U.plural(month.length, 'venda', 'vendas')} · ${U.plural(K.itemsCount(month), 'item', 'itens')}</span></span></div>
      <div class="kpi"><span class="kpi-label"><i class="bi bi-trophy" aria-hidden="true"></i>Mais vendido no mês</span>
        <span class="kpi-value kpi-text">${best ? best[0] : '—'}</span>
        <span class="kpi-sub"><span>${best ? U.plural(best[1], 'unidade', 'unidades') : 'nenhuma venda ainda'}</span></span></div>
      <div class="kpi"><span class="kpi-label"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i>Estoque baixo</span>
        <span class="kpi-value">${low.length}</span>
        <span class="kpi-sub"><span>${low.length ? low.slice(0, 2).map((p) => p.name).join(', ') + (low.length > 2 ? '…' : '') : 'tudo em dia'}</span></span></div>
      <div class="kpi"><span class="kpi-label"><i class="bi bi-box-seam" aria-hidden="true"></i>Em estoque</span>
        <span class="kpi-value">${admin ? U.money(atCost) : U.number(units)}</span>
        <span class="kpi-sub"><span>${admin ? `${U.plural(units, 'unidade', 'unidades')} · ${U.money(atPrice)} em preço de venda` : 'unidades à venda'}</span></span></div>`.toString();
  }

  /* ---------- Estoque ---------- */
  function renderStock() {
    const q = U.normalize(state.q);
    const list = K.products()
      .filter((p) => (state.filter === 'inativos' ? p.active === false : p.active !== false))
      .filter((p) => state.filter !== 'baixo' || K.isLow(p))
      .filter((p) => !q || U.normalize(`${p.name} ${p.category}`).includes(q));
    if (!list.length) {
      $('#stock-list').innerHTML = (K.products().length
        ? UI.empty('bi-search', 'Nada por aqui', state.filter === 'baixo' ? 'Nenhum produto com estoque baixo. Tudo em dia!' : 'Nenhum produto encontrado com esse filtro.')
        : UI.empty('bi-bag', 'Nenhum produto cadastrado', 'Cadastre o que a barbearia vende (pomada, óleo, shampoo…) para vender no balcão e na comanda.',
          admin ? html`<button type="button" class="btn btn-primary" data-new-product><i class="bi bi-plus-lg"></i>Cadastrar produto</button>` : '')).toString();
      return;
    }
    $('#stock-list').innerHTML = html`
      <div class="table-wrap"><table class="table stock-table">
        <thead><tr><th>Produto</th><th class="num hide-md">Preço</th>${admin ? raw('<th class="num hide-md">Custo</th>') : ''}<th class="num">Estoque</th>${admin ? raw('<th><span class="sr-only">Ações</span></th>') : ''}</tr></thead>
        <tbody>${list.map((p) => html`
          <tr>
            <td><strong>${p.name}</strong><div class="text-sm subtle"><span class="show-md">${U.money(p.price)} · </span>${[p.category, p.minStock ? `mínimo ${p.minStock}` : ''].filter(Boolean).join(' · ')}</div></td>
            <td class="num nowrap hide-md">${U.money(p.price)}</td>
            ${admin ? html`<td class="num nowrap hide-md">${p.cost != null ? U.money(p.cost) : '—'}</td>` : ''}
            <td class="num">${K.stockBadge(p)}</td>
            ${admin ? html`<td><div class="actions">
              <button type="button" class="btn btn-ghost btn-sm" data-restock="${p.id}" title="Entrada de mercadoria"><i class="bi bi-box-arrow-in-down"></i><span class="hide-sm">Entrada</span></button>
              <button type="button" class="btn btn-ghost btn-icon btn-sm" data-edit="${p.id}" aria-label="Editar ${p.name}"><i class="bi bi-pencil"></i></button>
            </div></td>` : ''}
          </tr>`)}</tbody>
      </table></div>`.toString();
  }

  /* ---------- Vendas ---------- */
  function renderSales() {
    const r = P.period(state.period);
    const list = K.sales({ from: r.from, to: r.to > U.today() ? U.today() : r.to, barberId: state.barber || undefined, all: true })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const ok = list.filter((s) => s.status !== 'cancelada');
    if (!list.length) {
      $('#sales-list').innerHTML = UI.empty('bi-receipt', 'Nenhuma venda no período', 'Venda no balcão em "Nova venda" ou junto do atendimento, ao concluir.').toString();
      return;
    }
    $('#sales-list').innerHTML = html`
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Quando</th><th>Itens</th><th class="hide-md">Cliente · vendedor</th><th class="hide-md">Pagamento</th><th class="num">Total</th>${admin ? raw('<th><span class="sr-only">Ações</span></th>') : ''}</tr></thead>
        <tbody>${list.map((s) => {
          const pay = B.PAYMENTS[s.paymentMethod];
          const off = s.status === 'cancelada';
          return html`<tr class="${off ? 'is-off' : ''}">
            <td class="nowrap">${U.fmtDate(s.date)}<div class="text-xs subtle">${s.appointmentId ? 'Comanda' : 'Balcão'}</div></td>
            <td>${K.itemsText(s)}${off ? html` <span class="badge badge-cancelado">Cancelada</span>` : ''}</td>
            <td class="hide-md">${s.clientId ? P.clientName(s.clientId) : html`<span class="subtle">Sem cliente</span>`}<div class="text-xs subtle">${s.barberId ? (db.barber(s.barberId) || {}).name || '' : ''}</div></td>
            <td class="hide-md">${pay ? html`<i class="bi ${pay.icon}" aria-hidden="true"></i> ${pay.label}` : ''}</td>
            <td class="num nowrap">${U.money(s.total)}</td>
            ${admin ? html`<td>${off ? '' : html`<button type="button" class="btn btn-ghost btn-icon btn-sm" data-cancel-sale="${s.id}" aria-label="Cancelar venda" title="Cancelar venda (devolve ao estoque)"><i class="bi bi-x-circle"></i></button>`}</td>` : ''}
          </tr>`;
        })}</tbody>
        <tfoot><tr><td colspan="${admin ? 2 : 2}">${U.plural(ok.length, 'venda', 'vendas')} · ${U.plural(K.itemsCount(ok), 'item', 'itens')}</td><td class="hide-md"></td><td class="hide-md"></td><td class="num">${U.money(U.sum(ok, (s) => s.total))}</td>${admin ? raw('<td></td>') : ''}</tr></tfoot>
      </table></div>`.toString();
  }

  /* ---------- Cadastro de produto ---------- */
  function openForm(id) {
    const p = id ? K.product(id) : null;
    const cats = [...new Set(K.products().map((x) => x.category).filter(Boolean))];
    const m = UI.modal({
      title: p ? 'Editar produto' : 'Novo produto',
      body: html`
        <form id="prod-form" class="form-grid" novalidate>
          <div class="field full"><label class="label" for="pr-name">Nome</label><input class="input" id="pr-name" name="name" value="${p ? p.name : ''}" maxlength="80" required></div>
          <div class="field"><label class="label" for="pr-cat">Categoria <span class="label-hint">(opcional)</span></label><input class="input" id="pr-cat" name="category" list="pr-cats" value="${p ? p.category : ''}" maxlength="40">
            <datalist id="pr-cats">${cats.map((c) => html`<option value="${c}"></option>`)}</datalist></div>
          <div class="field"><label class="label" for="pr-price">Preço de venda (R$)</label><input class="input" id="pr-price" name="price" type="number" inputmode="decimal" min="0" step="0.01" value="${p ? p.price : ''}" required></div>
          <div class="field"><label class="label" for="pr-cost">Custo (R$) <span class="label-hint">(opcional)</span></label><input class="input" id="pr-cost" name="cost" type="number" inputmode="decimal" min="0" step="0.01" value="${p && p.cost != null ? p.cost : ''}"></div>
          <div class="field"><label class="label" for="pr-stock">${p ? 'Estoque atual (contagem)' : 'Quantidade em estoque'}</label><input class="input" id="pr-stock" name="stock" type="number" inputmode="numeric" step="1" value="${p ? p.stock : 0}" required></div>
          <div class="field"><label class="label" for="pr-min">Avisar quando chegar a</label><input class="input" id="pr-min" name="minStock" type="number" inputmode="numeric" min="0" step="1" value="${p ? p.minStock || 0 : 3}"><span class="help">Estoque mínimo: aparece o alerta de estoque baixo.</span></div>
          <div class="field"><span class="label">Venda</span><label class="switch"><input type="checkbox" name="active" ${!p || p.active !== false ? raw('checked') : ''}><span class="track"></span>À venda</label></div>
        </form>`,
      footer: html`${p ? html`<button type="button" class="btn btn-ghost btn-sm left" data-delete><i class="bi bi-trash"></i>Excluir</button>` : ''}
        <button type="button" class="btn btn-ghost" data-close>Cancelar</button><button type="button" class="btn btn-primary" data-save><i class="bi bi-check2"></i>Salvar</button>`,
    });
    const form = $('#prod-form', m.body);
    m.el.querySelector('[data-save]').addEventListener('click', () => {
      const data = UI.validate(form, {
        name: UI.rules.required('o nome'),
        price: (v) => (v !== '' && Number(v) >= 0 ? null : 'Informe o preço.'),
        stock: (v) => (v !== '' && Number.isInteger(Number(v)) ? null : 'Informe a quantidade (número inteiro).'),
      });
      if (!data) return;
      const patch = {
        name: data.name.trim(), category: (data.category || '').trim(), price: Math.round(Number(data.price) * 100) / 100,
        cost: data.cost === '' ? null : Math.round(Number(data.cost) * 100) / 100,
        stock: Number(data.stock), minStock: Math.max(0, Math.round(Number(data.minStock) || 0)), active: !!data.active,
      };
      if (p) db.update('products', p.id, patch);
      else db.insert('products', patch);
      m.close();
      UI.toast(p ? 'Produto atualizado.' : 'Produto cadastrado. Já dá para vender.');
    });
    const del = m.el.querySelector('[data-delete]');
    if (del) {
      del.addEventListener('click', async () => {
        const ok = await UI.confirm({ title: 'Excluir produto', message: `Excluir "${p.name}"? As vendas antigas continuam com o nome e o valor da época. Para só parar de vender, desligue "À venda".`, confirmText: 'Excluir', danger: true });
        if (!ok) return;
        db.remove('products', p.id);
        m.close();
        UI.toast('Produto excluído.', 'info');
      });
    }
  }

  /* ---------- Entrada de mercadoria ---------- */
  function openRestock(id) {
    const p = K.product(id);
    const m = UI.modal({
      title: 'Entrada de mercadoria',
      size: 'sm',
      body: html`
        <p class="muted"><strong>${p.name}</strong> · hoje: ${p.stock} ${p.stock === 1 ? 'unidade' : 'unidades'}</p>
        <div class="field"><label class="label" for="rs-qty">Quantas chegaram?</label>
          <input class="input" id="rs-qty" type="number" inputmode="numeric" min="1" step="1" value="10"></div>`,
      footer: html`<button type="button" class="btn btn-ghost" data-close>Cancelar</button><button type="button" class="btn btn-primary" data-ok><i class="bi bi-box-arrow-in-down"></i>Somar ao estoque</button>`,
    });
    const input = $('#rs-qty', m.body);
    input.focus();
    input.select();
    m.el.querySelector('[data-ok]').addEventListener('click', async () => {
      const n = Math.round(Number(input.value));
      if (!(n > 0)) return UI.setError(input, 'Informe a quantidade que chegou.');
      try {
        await K.addStock(p.id, n);
        m.close();
        UI.toast(`${p.name}: +${n}. Agora são ${K.product(p.id).stock}.`);
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    });
  }

  /* ---------- Venda no balcão ---------- */
  function openSale() {
    if (!K.products({ active: true }).length) {
      return UI.toast(admin ? 'Cadastre um produto primeiro.' : 'Nenhum produto à venda. Peça ao administrador para cadastrar.', 'info');
    }
    const me = P.me();
    const pick = { clientId: null, newClient: false };
    const barbers = db.barbers({ active: true });
    const m = UI.modal({
      title: 'Nova venda',
      body: html`
        <div class="field"><span class="label">Produtos</span><div id="sale-cart"></div></div>
        <div class="form-grid">
          <div class="field"><span class="label">Cliente <span class="label-hint">(opcional)</span></span><div id="sale-client"></div></div>
          <div class="field"><label class="label" for="sale-seller">Vendido por</label>
            <select class="select" id="sale-seller">
              ${admin ? raw('<option value="">Ninguém (sem comissão)</option>') : ''}
              ${barbers.filter((b) => admin || b.id === me.barberId).map((b) => html`<option value="${b.id}" ${b.id === me.barberId ? raw('selected') : ''}>${b.name}</option>`)}
            </select></div>
        </div>
        <fieldset class="field">
          <legend class="label">Forma de pagamento</legend>
          <div class="pay-options">
            ${Object.entries(B.PAYMENTS).map(([k, p], i) => html`<label class="pay-option"><input type="radio" name="sale-pay" value="${k}" ${i === 0 ? raw('checked') : ''}><i class="bi ${p.icon}" aria-hidden="true"></i>${p.label}</label>`)}
          </div>
        </fieldset>
        <div class="conclude-total"><span>Total</span><strong class="num" id="sale-sum">${U.money(0)}</strong></div>`,
      footer: html`<button type="button" class="btn btn-ghost" data-close>Cancelar</button>
        <button type="button" class="btn btn-primary" data-ok><i class="bi bi-bag-check"></i>Registrar venda</button>`,
    });
    const cart = K.cart($('#sale-cart', m.body), { onChange: () => ($('#sale-sum', m.body).textContent = U.money(cart.total())) });
    P.clientPicker($('#sale-client', m.body), pick, () => {});
    m.el.querySelector('[data-ok]').addEventListener('click', async (e) => {
      const items = cart.items();
      if (!items.length) return UI.toast('Adicione pelo menos um produto.', 'error');
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        let clientId = pick.newClient ? null : pick.clientId;
        if (pick.newClient && pick.newName && pick.newName.trim().length >= 2) {
          const existing = U.validPhone(pick.newPhone) && db.clients().find((c) => U.digits(c.phone) === U.digits(pick.newPhone));
          clientId = existing ? existing.id : (await db.insertConfirmed('users', {
            role: 'cliente', name: pick.newName.trim(), phone: U.fmtPhone(pick.newPhone || ''), email: '', birthday: '', notes: '',
            salt: null, passwordHash: null, active: true, barberId: null,
          })).id;
        }
        const method = m.body.querySelector('input[name="sale-pay"]:checked').value;
        const sale = await K.register({ items, paymentMethod: method, clientId, barberId: $('#sale-seller', m.body).value || null });
        m.close();
        UI.toast(`Venda registrada · ${U.money(sale.total)} no ${B.PAYMENTS[method].label.toLowerCase()}.`);
      } catch (err) {
        btn.disabled = false;
        UI.toast(err.message, 'error');
      }
    });
  }

  /* ---------- Eventos ---------- */
  document.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-f]');
    if (f) {
      state.filter = f.dataset.f;
      $$('#stock-filter button').forEach((b) => b.setAttribute('aria-pressed', String(b === f)));
      return renderStock();
    }
    const per = e.target.closest('[data-p]');
    if (per) {
      state.period = per.dataset.p;
      $$('#sales-period button').forEach((b) => b.setAttribute('aria-pressed', String(b === per)));
      return renderSales();
    }
    if (e.target.closest('#new-product, [data-new-product]')) return openForm();
    if (e.target.closest('#new-sale')) return openSale();
    const edit = e.target.closest('[data-edit]');
    if (edit) return openForm(edit.dataset.edit);
    const rs = e.target.closest('[data-restock]');
    if (rs) return openRestock(rs.dataset.restock);
    const cs = e.target.closest('[data-cancel-sale]');
    if (cs) {
      const s = db.get('sales', cs.dataset.cancelSale);
      const ok = await UI.confirm({ title: 'Cancelar venda', message: `Cancelar a venda de ${K.itemsText(s)} (${U.money(s.total)})? Os itens voltam para o estoque e o valor sai do financeiro.`, confirmText: 'Cancelar venda', cancelText: 'Manter', danger: true });
      if (!ok) return;
      try {
        await K.cancel(s.id);
        UI.toast('Venda cancelada. Itens de volta ao estoque.', 'info');
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    }
    if (e.target.closest('#save-commission')) {
      const v = Number($('#prod-commission').value);
      if (!(v >= 0 && v <= 100)) return UI.setError($('#prod-commission'), 'Entre 0 e 100.');
      db.saveSettings({ productCommission: Math.round(v * 10) / 10 });
      UI.toast('Comissão sobre produtos salva.');
    }
  });
  $('#f-q').addEventListener('input', U.debounce((e) => { state.q = e.target.value; renderStock(); }, 150));
  $('#f-barber').addEventListener('change', (e) => { state.barber = e.target.value; renderSales(); });
  UI.tabs($('.tabs'), (tab) => history.replaceState(null, '', `${location.search}#${tab}`));

  function render() {
    renderKpis();
    renderStock();
    renderSales();
  }
  render();
  P.onChange(render);
});
