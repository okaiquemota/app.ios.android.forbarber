/* Cadastro de serviços: preço, duração, categoria, destaque na home e ativo/inativo */
window.App.ready(function () {
  'use strict';
  const App = window.App;
  const P = App.painel;
  if (!P) return;
  const U = App.utils;
  const { html, raw, $ } = U;
  const db = App.db;
  const UI = App.ui;

  function render() {
    const list = db.services();
    if (!list.length) {
      $('#list').innerHTML = UI.empty('bi-scissors', 'Nenhum serviço', 'Cadastre o primeiro serviço para liberar o agendamento online.').toString();
      return;
    }
    const cats = db.categories();
    $('#list').innerHTML = html`
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Serviço</th><th class="num">Duração</th><th class="num">Preço</th><th>Home</th><th>Ativo</th><th><span class="sr-only">Ações</span></th></tr></thead>
        <tbody>${cats.map((c) => html`
          <tr class="table-group"><td colspan="6">${c}</td></tr>
          ${list.filter((s) => s.category === c).map((s) => html`
            <tr>
              <td><strong>${s.name}</strong><div class="text-sm subtle">${s.description}</div></td>
              <td class="num nowrap">${U.fmtDuration(s.duration)}</td>
              <td class="num nowrap">${U.money(s.price)}</td>
              <td><button type="button" class="btn btn-ghost btn-icon btn-sm" data-feature="${s.id}" aria-pressed="${!!s.featured}" aria-label="Destacar na página inicial" title="Destaque na página inicial"><i class="bi ${s.featured ? 'bi-star-fill text-primary' : 'bi-star'}"></i></button></td>
              <td><label class="switch"><input type="checkbox" data-active="${s.id}" ${s.active ? raw('checked') : ''}><span class="track"></span><span class="sr-only">Ativo</span></label></td>
              <td><div class="actions">
                <button type="button" class="btn btn-ghost btn-icon btn-sm" data-edit="${s.id}" aria-label="Editar ${s.name}"><i class="bi bi-pencil"></i></button>
                <button type="button" class="btn btn-ghost btn-icon btn-sm" data-del="${s.id}" aria-label="Excluir ${s.name}"><i class="bi bi-trash"></i></button>
              </div></td>
            </tr>`)}`)}</tbody>
      </table></div>`.toString();
  }

  function openForm(id) {
    const s = id ? db.service(id) : null;
    const durations = [];
    for (let m = 10; m <= 240; m += 5) durations.push(m);
    const m = UI.modal({
      title: s ? 'Editar serviço' : 'Novo serviço',
      body: html`
        <form id="svc-form" class="form-grid" novalidate>
          <div class="field full"><label class="label" for="sv-name">Nome</label><input class="input" id="sv-name" name="name" value="${s ? s.name : ''}" required></div>
          <div class="field"><label class="label" for="sv-cat">Categoria</label><input class="input" id="sv-cat" name="category" list="sv-cats" value="${s ? s.category : ''}" required>
            <datalist id="sv-cats">${db.categories().map((c) => html`<option value="${c}"></option>`)}</datalist></div>
          <div class="field"><label class="label" for="sv-price">Preço (R$)</label><input class="input" id="sv-price" name="price" type="number" inputmode="decimal" min="0" step="0.01" value="${s ? s.price : ''}" required></div>
          <div class="field"><label class="label" for="sv-dur">Duração</label><select class="select" id="sv-dur" name="duration">${durations.map((d) => html`<option value="${d}" ${(s ? s.duration : 30) === d ? raw('selected') : ''}>${U.fmtDuration(d)}</option>`)}</select></div>
          <div class="field"><span class="label">Visibilidade</span>
            <label class="switch"><input type="checkbox" name="featured" ${s && s.featured ? raw('checked') : ''}><span class="track"></span>Destaque na home</label></div>
          <div class="field full"><label class="label" for="sv-desc">Descrição curta</label><textarea class="textarea" id="sv-desc" name="description" rows="2" maxlength="140">${s ? s.description : ''}</textarea></div>
        </form>`,
      footer: html`<button type="button" class="btn btn-ghost" data-close>Cancelar</button><button type="button" class="btn btn-primary" data-save><i class="bi bi-check2"></i>Salvar</button>`,
    });
    const form = $('#svc-form', m.body);
    m.el.querySelector('[data-save]').addEventListener('click', () => {
      const data = UI.validate(form, {
        name: UI.rules.required('o nome'),
        category: UI.rules.required('a categoria'),
        price: (v) => (v !== '' && Number(v) >= 0 ? null : 'Informe o preço.'),
      });
      if (!data) return;
      const patch = { name: data.name, category: data.category, price: Math.round(Number(data.price) * 100) / 100, duration: Number(data.duration), description: data.description || '', featured: !!data.featured };
      if (s) db.update('services', s.id, patch);
      else db.insert('services', { ...patch, active: true });
      m.close();
      UI.toast(s ? 'Serviço atualizado.' : 'Serviço criado. Já aparece no site.');
    });
  }

  document.addEventListener('click', async (e) => {
    if (e.target.closest('#new-service')) return openForm();
    const edit = e.target.closest('[data-edit]');
    if (edit) return openForm(edit.dataset.edit);
    const feat = e.target.closest('[data-feature]');
    if (feat) {
      const s = db.service(feat.dataset.feature);
      return db.update('services', s.id, { featured: !s.featured });
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      const s = db.service(del.dataset.del);
      const ok = await UI.confirm({ title: 'Excluir serviço', message: `Excluir "${s.name}"? Agendamentos antigos continuam com o nome e o valor da época. Se for só pausar, desative em vez de excluir.`, confirmText: 'Excluir', danger: true });
      if (ok) { db.remove('services', s.id); UI.toast('Serviço excluído.', 'info'); }
    }
  });
  document.addEventListener('change', (e) => {
    const t = e.target.closest('[data-active]');
    if (t) db.update('services', t.dataset.active, { active: t.checked });
  });

  render();
  P.onChange(render);
});
