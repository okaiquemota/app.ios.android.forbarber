/* Página de serviços: quadro de preços agrupado por categoria, com filtro */
(function () {
  'use strict';
  const App = window.App;
  const U = App.utils;
  const { html, $ } = U;
  const db = App.db;
  const UI = App.ui;

  let current = U.qs('categoria') || 'Todos';

  function render() {
    const services = db.services({ active: true });
    const cats = db.categories({ active: true });
    if (current !== 'Todos' && !cats.includes(current)) current = 'Todos';

    $('#svc-filter').innerHTML = html`
      ${['Todos', ...cats].map((c) => {
        const count = c === 'Todos' ? services.length : services.filter((s) => s.category === c).length;
        return html`<button type="button" class="chip ${c === current ? 'active' : ''}" data-cat="${c}" aria-pressed="${c === current}">
          ${c}<span class="count">${count}</span></button>`;
      })}`;

    const visible = cats.filter((c) => current === 'Todos' || c === current);
    $('#svc-list').innerHTML = services.length
      ? html`${visible.map((c) => html`
          <section class="svc-group" aria-labelledby="cat-${U.normalize(c).replace(/\W+/g, '-')}">
            <h2 class="svc-group-title" id="cat-${U.normalize(c).replace(/\W+/g, '-')}">${c}</h2>
            <div class="board">${services.filter((s) => s.category === c).map(App.site.boardItem)}</div>
          </section>`)}`
      : UI.empty('bi-scissors', 'Nenhum serviço cadastrado', 'Os serviços aparecem aqui assim que forem cadastrados no painel.');
  }

  $('#svc-filter').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cat]');
    if (!chip) return;
    current = chip.dataset.cat;
    render();
    const url = new URL(location.href);
    if (current === 'Todos') url.searchParams.delete('categoria');
    else url.searchParams.set('categoria', current);
    history.replaceState(null, '', url);
  });

  render();
  db.subscribe((source) => {
    if (source === 'remote') render();
  });
})();
