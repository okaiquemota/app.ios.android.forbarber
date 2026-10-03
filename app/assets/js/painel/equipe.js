/* Equipe: perfis públicos, dias de trabalho, comissão, números do mês e acesso ao painel */
window.App.ready(function () {
  'use strict';
  const App = window.App;
  const P = App.painel;
  if (!P) return;
  const U = App.utils;
  const { html, raw, $, $$ } = U;
  const db = App.db;
  const UI = App.ui;
  const auth = App.auth;
  const ORDER = [1, 2, 3, 4, 5, 6, 0];

  const CLOUD = db.isCloud();
  const accountOf = (barberId) => db.staffUsers().find((u) => u.barberId === barberId) || null;
  const inviteOf = (barberId) => db.invites().find((i) => i.barberId === barberId) || null;
  const loginUrl = () => `${window.FORBARBER.publicRoot}cadastro.html`;

  function render() {
    const t = U.today();
    const from = U.startOfMonth(t);
    const list = db.barbers();
    $('#list').innerHTML = list.length
      ? html`${list.map((b) => {
          const done = db.appointments({ from, to: t, barberId: b.id, status: 'concluido' });
          const revenue = U.sum(done, (a) => a.total);
          const acc = accountOf(b.id);
          return html`<article class="staff-card ${b.active ? '' : 'inactive'}">
            <div class="staff-head">
              ${P.barberAvatar(b, 'lg')}
              <div class="grow"><h2>${b.name}</h2><span class="text-sm text-primary">${b.title}</span></div>
              ${b.active ? '' : html`<span class="badge badge-neutral">Inativo</span>`}
            </div>
            <div class="staff-stats">
              <div><strong>${done.length}</strong><span>atendimentos no mês</span></div>
              <div><strong>${U.compactMoney(revenue)}</strong><span>faturado no mês</span></div>
              <div><strong>${U.compactMoney((revenue * (b.commission || 0)) / 100)}</strong><span>comissão (${b.commission || 0}%)</span></div>
            </div>
            <div class="staff-meta">
              ${b.specialty ? html`<span><i class="bi bi-scissors"></i>${b.specialty}</span>` : ''}
              <span><i class="bi bi-calendar-week"></i>${ORDER.filter((d) => b.workDays.includes(d)).map((d) => U.WEEKDAYS_SHORT[d]).join(' · ') || 'Sem dias definidos'}</span>
              <span><i class="bi bi-key"></i>${acc ? `${acc.email} · ${auth.ROLES[acc.role]}` : inviteOf(b.id) ? `Convite pendente: ${inviteOf(b.id).email}` : 'Sem acesso ao painel'}</span>
            </div>
            <div class="cluster">
              <button type="button" class="btn btn-outline btn-sm" data-edit="${b.id}"><i class="bi bi-pencil"></i>Editar</button>
              <a class="btn btn-ghost btn-sm" href="agenda.html">Agenda</a>
            </div>
          </article>`;
        })}`.toString()
      : UI.empty('bi-person-badge', 'Nenhum profissional', 'Cadastre a equipe para liberar a agenda.').toString();
  }

  /** Na nuvem cada pessoa cria a própria senha: o dono só convida pelo e-mail */
  function cloudAccess(b, acc) {
    const inv = b && inviteOf(b.id);
    if (acc) {
      return html`<div class="field full"><span class="label">Acesso ao painel</span>
        <span class="help">Entra com <strong>${acc.email}</strong> (${auth.ROLES[acc.role]}). A senha é pessoal; se esquecer, use "Esqueci a senha" no login.</span></div>`;
    }
    return html`<div class="field full"><span class="label">Acesso ao painel</span>
        <span class="help">${inv
          ? html`Convite pendente para <strong>${inv.email}</strong>. Ele cria a conta com esse e-mail e já entra como barbeiro. <button type="button" class="link" data-cancel-invite="${inv.email}">Cancelar convite</button>`
          : 'Opcional. Informe o e-mail do barbeiro: ele cria a própria senha e entra na equipe.'}</span></div>
      <div class="field full"><label class="label" for="bb-email">E-mail do barbeiro</label><input class="input" id="bb-email" name="email" type="email" value="${inv ? inv.email : ''}"></div>`;
  }

  function openForm(id) {
    const b = id ? db.barber(id) : null;
    const acc = b ? accountOf(b.id) : null;
    const used = db.barbers().map((x) => x.color);
    const colors = App.seed.TEAM_COLORS;
    let color = b ? b.color : colors.find((c) => !used.includes(c)) || colors[0];
    const isMe = acc && acc.id === P.user.id;
    const m = UI.modal({
      title: b ? 'Editar profissional' : 'Novo profissional',
      size: 'lg',
      body: html`
        <form id="barber-form" class="form-grid" novalidate>
          <div class="field"><label class="label" for="bb-name">Nome</label><input class="input" id="bb-name" name="name" value="${b ? b.name : ''}" required></div>
          <div class="field"><label class="label" for="bb-title">Cargo</label><input class="input" id="bb-title" name="title" value="${b ? b.title : 'Barbeiro'}"></div>
          <div class="field full"><label class="label" for="bb-spec">Especialidade</label><input class="input" id="bb-spec" name="specialty" value="${b ? b.specialty : ''}" placeholder="Ex.: degradê e barba" required></div>
          <div class="field full"><label class="label" for="bb-bio">Apresentação no site</label><textarea class="textarea" id="bb-bio" name="bio" rows="2" maxlength="200">${b ? b.bio : ''}</textarea></div>
          <fieldset class="field full"><legend class="label">Dias de atendimento</legend>
            <div class="chip-group">${ORDER.map((d) => html`<label class="chip"><input type="checkbox" name="days" value="${d}" ${!b || b.workDays.includes(d) ? (d === 0 && !b ? '' : raw('checked')) : ''}>${U.WEEKDAYS_SHORT[d]}</label>`)}</div></fieldset>
          <div class="field"><label class="label" for="bb-comm">Comissão (%)</label><input class="input" id="bb-comm" name="commission" type="number" min="0" max="100" step="1" value="${b ? b.commission : 40}"></div>
          <fieldset class="field"><legend class="label">Cor na agenda</legend>
            <div class="swatches" id="bb-colors">${colors.map((c) => html`<button type="button" class="swatch" style="--sw:${c}" data-color="${c}" aria-pressed="${c === color}" aria-label="Cor ${c}"></button>`)}</div></fieldset>
          <div class="field full"><label class="switch"><input type="checkbox" name="active" ${!b || b.active ? raw('checked') : ''} ${isMe ? raw('disabled') : ''}><span class="track"></span>Ativo (aparece no site e recebe agendamentos)</label></div>
          <div class="full"><hr style="margin:0"></div>
          ${CLOUD ? cloudAccess(b, acc) : html`
          <div class="field full"><span class="label">Acesso ao painel</span><span class="help">${acc ? 'Deixe a senha em branco para manter a atual.' : 'Opcional. Com acesso, o barbeiro vê a própria agenda, comissão e os clientes.'}</span></div>
          <div class="field"><label class="label" for="bb-email">E-mail de login</label><input class="input" id="bb-email" name="email" type="email" value="${acc ? acc.email : ''}"></div>
          <div class="field"><label class="label" for="bb-pass">${acc ? 'Nova senha' : 'Senha'}</label><input class="input" id="bb-pass" name="password" type="password" autocomplete="new-password"></div>`}
        </form>`,
      footer: html`<button type="button" class="btn btn-ghost" data-close>Cancelar</button><button type="button" class="btn btn-primary" data-save><i class="bi bi-check2"></i>Salvar</button>`,
    });
    m.body.addEventListener('click', async (e) => {
      const ci = e.target.closest('[data-cancel-invite]');
      if (ci) {
        await App.cloud.cancelInvite(ci.dataset.cancelInvite).catch((err) => UI.toast(err.message, 'error'));
        m.close();
        return UI.toast('Convite cancelado.', 'info');
      }
      const sw = e.target.closest('[data-color]');
      if (!sw) return;
      color = sw.dataset.color;
      $$('[data-color]', m.body).forEach((x) => x.setAttribute('aria-pressed', String(x === sw)));
    });
    const form = $('#barber-form', m.body);
    m.el.querySelector('[data-save]').addEventListener('click', async () => {
      const data = UI.validate(form, {
        name: UI.rules.required('o nome'),
        specialty: UI.rules.required('a especialidade'),
        email: (v) => {
          if (CLOUD && acc) return null;
          if (!v) return acc ? 'Informe o e-mail de login.' : null;
          if (!U.validEmail(v)) return 'E-mail inválido.';
          const other = db.userByEmail(v);
          return other && (!acc || other.id !== acc.id) ? 'Este e-mail já está em uso.' : null;
        },
        password: (v, d) => (CLOUD ? null : d.email && !acc && String(v).length < 6 ? 'Crie uma senha com 6 caracteres ou mais.' : v && String(v).length < 6 ? 'Mínimo de 6 caracteres.' : null),
      });
      if (!data) return;
      const days = [].concat(data.days || []).map(Number);
      const patch = {
        name: data.name, title: data.title || 'Barbeiro', specialty: data.specialty, bio: data.bio || '',
        workDays: days, commission: Math.min(100, Math.max(0, Number(data.commission) || 0)), color,
        active: isMe ? true : !!data.active,
      };
      let saved;
      try {
        saved = b ? db.update('barbers', b.id, patch) : await db.insertConfirmed('barbers', { ...patch, photo: '' });
      } catch (err) {
        return UI.toast(err.message, 'error');
      }
      if (CLOUD) {
        if (acc) db.update('users', acc.id, { name: data.name, active: isMe ? true : !!data.active });
        else if (data.email && (!inviteOf(saved.id) || inviteOf(saved.id).email !== data.email.toLowerCase())) {
          try {
            await App.cloud.invite({ email: data.email, barberId: saved.id, name: data.name });
            UI.toast(`Convite criado. Peça para ${U.firstName(data.name)} criar a conta com ${data.email.toLowerCase()} em ${loginUrl()}`, 'info', 9000);
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        }
      } else if (acc) {
        db.update('users', acc.id, { email: data.email.toLowerCase(), name: data.name, active: isMe ? true : !!data.active });
        if (data.password) auth.setPassword(acc.id, data.password);
      } else if (data.email) {
        const u = db.insert('users', { role: 'barbeiro', name: data.name, email: data.email.toLowerCase(), phone: '', birthday: '', notes: '', barberId: saved.id, active: true, salt: null, passwordHash: null });
        auth.setPassword(u.id, data.password);
      }
      m.close();
      UI.toast(b ? 'Profissional atualizado.' : 'Profissional cadastrado. Já aparece no site e no agendamento.');
    });
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('#new-barber')) return openForm();
    const edit = e.target.closest('[data-edit]');
    if (edit) openForm(edit.dataset.edit);
  });

  render();
  P.onChange(render);
});
