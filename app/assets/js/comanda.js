/* ==========================================================================
   COMANDA E ESTOQUE (window.App.comanda)
   Produtos (pomada, óleo, shampoo…) com preço, custo e estoque; vendas no
   balcão ou junto do atendimento (comanda), que baixam o estoque na hora.
   Na nuvem, venda e cancelamento passam por funções do banco (register_sale,
   cancel_sale) para o estoque nunca ficar inconsistente entre aparelhos.
   ========================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const U = App.utils;
  const { html, raw, $ } = U;

  const db = () => App.db;
  const cloud = () => db().isCloud();
  const round2 = (n) => Math.round(n * 100) / 100;

  /* ---------- Produtos ---------- */
  function products({ active } = {}) {
    return db().list('products')
      .filter((p) => (active ? p.active !== false : true))
      .sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
  }
  const product = (id) => db().get('products', id);
  /** Estoque baixo: chegou no mínimo (ou zerou) */
  const isLow = (p) => p.active !== false && p.stock <= Math.max(0, p.minStock || 0);
  const lowStock = () => products({ active: true }).filter(isLow);
  function stockBadge(p) {
    if (p.stock < 0) return html`<span class="badge badge-faltou">${p.stock} · confira</span>`;
    if (p.stock === 0) return html`<span class="badge badge-faltou">Esgotado</span>`;
    if (isLow(p)) return html`<span class="badge badge-warning">${p.stock} · baixo</span>`;
    return html`<span class="badge badge-neutral">${p.stock}</span>`;
  }

  /* ---------- Vendas ---------- */
  /** @param {object} f { from, to, barberId, appointmentId, all (inclui canceladas) } */
  function sales(f = {}) {
    return db().list('sales').filter((s) => {
      if (!f.all && s.status === 'cancelada') return false;
      if (f.from && s.date < f.from) return false;
      if (f.to && s.date > f.to) return false;
      if (f.barberId && s.barberId !== f.barberId) return false;
      if (f.appointmentId && s.appointmentId !== f.appointmentId) return false;
      return true;
    });
  }
  const itemsText = (s) => s.items.map((i) => (i.qty > 1 ? `${i.qty}x ${i.name}` : i.name)).join(', ');
  const itemsCount = (list) => U.sum(list, (s) => U.sum(s.items, (i) => i.qty));
  const commissionRate = () => Number(db().settings().productCommission ?? 10) || 0;
  /** Comissão do barbeiro sobre o que ele vendeu */
  const commissionOf = (s) => (s.barberId ? (s.total * commissionRate()) / 100 : 0);

  /**
   * Registra uma venda e baixa o estoque.
   * @param {object} v { items: [{ productId, qty, price }], paymentMethod, clientId, barberId, appointmentId, date }
   */
  async function register(v) {
    const items = (v.items || []).filter((i) => i.qty > 0);
    if (!items.length) throw new Error('Escolha pelo menos um produto.');
    if (cloud()) return App.cloud.registerSale(v, items);
    const lines = items.map((i) => {
      const p = product(i.productId);
      if (!p) throw new Error('Um dos produtos não existe mais.');
      return { productId: p.id, name: p.name, price: round2(i.price ?? p.price), qty: i.qty };
    });
    lines.forEach((l) => db().update('products', l.productId, { stock: product(l.productId).stock - l.qty }));
    return db().insert('sales', {
      date: v.date || U.today(),
      clientId: v.clientId || null,
      barberId: v.barberId || null,
      appointmentId: v.appointmentId || null,
      items: lines,
      total: round2(U.sum(lines, (l) => l.price * l.qty)),
      paymentMethod: v.paymentMethod,
      status: 'ok',
      createdBy: App.auth.current() ? App.auth.current().id : null,
    });
  }

  /** Cancela a venda e devolve os itens ao estoque */
  async function cancel(id) {
    if (cloud()) return App.cloud.cancelSale(id);
    const s = db().get('sales', id);
    if (!s || s.status === 'cancelada') return;
    s.items.forEach((i) => {
      const p = product(i.productId);
      if (p) db().update('products', p.id, { stock: p.stock + i.qty });
    });
    db().update('sales', id, { status: 'cancelada' });
  }

  /** Entrada de mercadoria (soma ao estoque) */
  async function addStock(id, qty) {
    if (cloud()) return App.cloud.addStock(id, qty);
    const p = product(id);
    db().update('products', id, { stock: p.stock + qty });
  }

  /* ---------- Carrinho (usado na comanda do atendimento e na venda avulsa) ---------- */
  /**
   * Monta o carrinho dentro de `box`. Retorna { items(), total(), clear() }.
   * onChange é chamado sempre que muda (para atualizar o total da tela).
   */
  function cart(box, { onChange } = {}) {
    let lines = []; // { productId, qty, price }
    const list = () => products({ active: true });
    function render() {
      const opts = list();
      box.innerHTML = html`
        <div class="cart">
          ${lines.length ? html`<ul class="cart-lines">${lines.map((l, i) => {
            const p = product(l.productId) || { name: '?', stock: 0 };
            const over = l.qty > p.stock;
            return html`<li>
              <span class="grow"><strong>${p.name}</strong><span class="${over ? 'text-danger' : 'subtle'}">${over ? `Estoque: ${p.stock}` : U.money(l.price)}</span></span>
              <span class="qty" role="group" aria-label="Quantidade de ${p.name}">
                <button type="button" class="btn btn-ghost btn-icon btn-sm" data-cart-dec="${i}" aria-label="Menos"><i class="bi bi-dash"></i></button>
                <span class="num">${l.qty}</span>
                <button type="button" class="btn btn-ghost btn-icon btn-sm" data-cart-inc="${i}" aria-label="Mais"><i class="bi bi-plus"></i></button>
              </span>
              <span class="num cart-sub">${U.money(l.price * l.qty)}</span>
            </li>`;
          })}</ul>` : ''}
          ${opts.length
            ? html`<select class="select input-sm" data-cart-add aria-label="Adicionar produto">
                <option value="">${lines.length ? '+ Adicionar outro produto' : '+ Adicionar produto'}</option>
                ${opts.map((p) => html`<option value="${p.id}">${p.name} · ${U.money(p.price)}${p.stock <= 0 ? ' · sem estoque' : ` · ${p.stock} em estoque`}</option>`)}
              </select>`
            : html`<p class="text-sm subtle">Nenhum produto cadastrado. ${App.painel && App.painel.isAdmin ? raw('<a class="link" href="produtos.html">Cadastrar produtos</a>') : ''}</p>`}
        </div>`.toString();
    }
    const changed = () => {
      render();
      if (onChange) onChange();
    };
    box.addEventListener('change', (e) => {
      const sel = e.target.closest('[data-cart-add]');
      if (!sel || !sel.value) return;
      const p = product(sel.value);
      const found = lines.find((l) => l.productId === p.id);
      if (found) found.qty++;
      else lines.push({ productId: p.id, qty: 1, price: p.price });
      changed();
    });
    box.addEventListener('click', (e) => {
      const inc = e.target.closest('[data-cart-inc]');
      const dec = e.target.closest('[data-cart-dec]');
      if (inc) lines[Number(inc.dataset.cartInc)].qty++;
      else if (dec) {
        const i = Number(dec.dataset.cartDec);
        lines[i].qty--;
        if (lines[i].qty <= 0) lines.splice(i, 1);
      } else return;
      changed();
    });
    render();
    return {
      items: () => lines.map((l) => ({ ...l })),
      total: () => round2(U.sum(lines, (l) => l.price * l.qty)),
      clear: () => { lines = []; changed(); },
    };
  }

  App.comanda = {
    products, product, isLow, lowStock, stockBadge,
    sales, itemsText, itemsCount, commissionRate, commissionOf,
    register, cancel, addStock, cart,
  };
})();
