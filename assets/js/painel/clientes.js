/* Clientes (CRM): segmentos úteis para barbearia, ficha completa e exportação */
(function () {
  'use strict';
  const App = window.App;
  const P = App.painel;
  if (!P) return;
  const U = App.utils;
  const { html, $, $$ } = U;
  const db = App.db;
  const UI = App.ui;

  const state = { segment: 'todos', sort: 'nome', q: '', limit: 60 };

  function segments(stats) {
    const t = U.today();
    const month = t.slice(5, 7);
    const lost = U.addDays(t, -45);
    const newSince = U.addDays(t, -30);
    return [
      ['todos', 'Todos', () => true],
      ['frequentes', 'Frequentes', (c) => (stats.get(c.id) || {}).visits >= 5],
      ['sumidos', 'Sumidos 45+ dias', (c) => { const s = stats.get(c.id); return s && s.lastVisit && s.lastVisit < lost && !s.upcoming; }],
      ['aniversario', 'Aniversário no mês', (c) => c.birthday && c.birthday.slice(5, 7) === month],
      ['novos', 'Novos (30 dias)', (c) => c.createdAt.slice(0, 10) >= newSince],
      ['online', 'Conta online', (c) => !!c.passwordHash],
    ];
  }

  function filtered() {
    const stats = db.clientStatsMap();
    const seg = segments(stats).find((s) => s[0] === state.segment)[2];
    const q = U.normalize(state.q);
    const d = U.digits(state.q);
    const rows = db.clients()
      .filter(seg)
      .filter((c) => !q || U.normalize(`${c.name} ${c.email}`).includes(q) || (d.length >= 3 && U.digits(c.phone).includes(d)))
      .map((c) => ({ c, s: stats.get(c.id) || { visits: 0, spent: 0, lastVisit: null } }));
    const by = {
      nome: (a, b) => a.c.name.localeCompare(b.c.name, 'pt-BR'),
      ultima: (a, b) => (b.s.lastVisit || '').localeCompare(a.s.lastVisit || ''),
      visitas: (a, b) => b.s.visits - a.s.visits,
      gasto: (a, b) => b.s.spent - a.s.spent,
    };
    return rows.sort(by[state.sort]);
  }

  function render() {
    const stats = db.clientStatsMap();
    const all = db.clients();
    $('#segment').innerHTML = html`${segments(stats).map(([k, l, fn]) => html`<button type="button" data-seg="${k}" aria-pressed="${k === state.segment}">${l} <span class="subtle">${all.filter(fn).length}</span></button>`)}`.toString();
    const rows = filtered();
    $('#list-sub').textContent = `${U.plural(all.length, 'cliente cadastrado', 'clientes cadastrados')} · ${rows.length} na lista`;
    if (!rows.length) {
      $('#list').innerHTML = UI.empty('bi-people', 'Nenhum cliente encontrado', 'Ajuste a busca ou cadastre um cliente novo.').toString();
      return;
    }
    const t = U.today();
    $('#list').innerHTML = html`
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Cliente</th><th>WhatsApp</th><th class="num">Visitas</th><th class="hide-md">Última visita</th><th class="num hide-md">Total gasto</th><th><span class="sr-only">Ações</span></th></tr></thead>
        <tbody>${rows.slice(0, state.limit).map(({ c, s }) => html`
          <tr class="clickable" data-client="${c.id}">
            <td><div class="cell-main">${UI.avatar(c.name, { size: 'sm' })}<div class="grow"><strong>${c.name}</strong><span>${c.email || (c.passwordHash ? '' : 'cadastro no balcão')}</span></div></div></td>
            <td class="nowrap">${c.phone ? html`<a class="link" href="${U.waLink(c.phone)}" target="_blank" rel="noopener" data-stop><i class="bi bi-whatsapp"></i>${c.phone}</a>` : '—'}</td>
            <td class="num">${s.visits}</td>
            <td class="hide-md nowrap">${s.lastVisit ? html`${U.fmtDate(s.lastVisit)} <span class="subtle">· ${U.diffDays(s.lastVisit, t)}d</span>` : html`<span class="subtle">—</span>`}</td>
            <td class="num hide-md">${U.money(s.spent)}</td>
            <td><div class="actions"><button type="button" class="btn btn-ghost btn-icon btn-sm" data-book="${c.id}" aria-label="Agendar para ${c.name}" title="Agendar"><i class="bi bi-calendar-plus"></i></button></div></td>
          </tr>`)}</tbody>
      </table></div>
      ${rows.length > state.limit ? html`<div class="more-row"><button type="button" class="btn btn-outline btn-sm" id="more">Mostrar mais (${rows.length - state.limit})</button></div>` : ''}`.toString();
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-stop]')) return;
    const seg = e.target.closest('[data-seg]');
    if (seg) { state.segment = seg.dataset.seg; state.limit = 60; return render(); }
    const book = e.target.closest('[data-book]');
    if (book) return P.openAppointmentForm({ clientId: book.dataset.book });
    const row = e.target.closest('[data-client]');
    if (row) return P.openClientDetails(row.dataset.client);
    if (e.target.closest('#more')) { state.limit += 60; return render(); }
    if (e.target.closest('#new-client')) return P.openClientForm();
    if (e.target.closest('#export')) {
      const csv = U.toCSV(filtered(), [
        { label: 'Nome', value: (r) => r.c.name },
        { label: 'WhatsApp', value: (r) => r.c.phone },
        { label: 'E-mail', value: (r) => r.c.email },
        { label: 'Aniversário', value: (r) => (r.c.birthday ? U.fmtDate(r.c.birthday) : '') },
        { label: 'Visitas', value: (r) => r.s.visits },
        { label: 'Última visita', value: (r) => (r.s.lastVisit ? U.fmtDate(r.s.lastVisit) : '') },
        { label: 'Total gasto', value: (r) => U.number(r.s.spent, 2) },
        { label: 'Anotações', value: (r) => r.c.notes },
      ]);
      U.download(`clientes-${U.today()}.csv`, csv, 'text/csv;charset=utf-8');
    }
  });
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
  $('#f-q').addEventListener('input', U.debounce((e) => { state.q = e.target.value; render(); }, 150));

  render();
  P.onChange(render);
})();
