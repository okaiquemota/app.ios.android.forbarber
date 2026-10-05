/* ==========================================================================
   AVISOS DE AGENDAMENTO NO PAINEL (window.App.avisos)
   - Na hora: com o painel aberto, quem é da equipe vê um aviso quando entra,
     muda ou cai um horário (de outro aparelho, do site ou de outra aba).
     No computador, pode virar notificação do sistema com a aba em segundo plano.
   - Com o app fechado: o celular recebe push (native.js + função notify-booking).
   - Cada pessoa escolhe o que quer receber (novos, cancelamentos, de quem).
   ========================================================================== */
window.App.ready(function () {
  'use strict';
  const App = window.App;
  const P = App.painel;
  if (!P) return;
  const U = App.utils;
  const { html, raw, $ } = U;
  const db = App.db;
  const UI = App.ui;
  const N = App.native;
  const DESKTOP_KEY = 'forbarber:desktopAlerts';

  /* ---------- Preferências de quem está logado ---------- */
  function prefs() {
    const u = P.me();
    return {
      pushNew: u.pushNew !== false,
      pushCancel: u.pushCancel !== false,
      // vazio = padrão: o dono recebe tudo, o barbeiro só os horários dele
      pushAll: u.pushAll == null ? !u.barberId || u.role === 'admin' : !!u.pushAll,
    };
  }
  async function savePrefs(next) {
    if (db.isCloud()) await App.cloud.savePushPrefs(next);
    else db.update('users', P.user.id, next);
  }
  const desktopOn = () => {
    try { return localStorage.getItem(DESKTOP_KEY) === '1' && 'Notification' in window && Notification.permission === 'granted'; } catch (e) { return false; }
  };

  /* ---------- O que mudou desde a última olhada ---------- */
  const snapshot = new Map();
  const take = () => {
    snapshot.clear();
    db.list('appointments').forEach((a) => snapshot.set(a.id, { status: a.status, date: a.date, start: a.start, barberId: a.barberId, clientId: a.clientId }));
  };

  function diff() {
    const t = U.today();
    const found = [];
    db.list('appointments').forEach((a) => {
      if (a.busyOnly || a.date < t) return;
      const before = snapshot.get(a.id);
      if (!before) {
        if (a.status === 'confirmado') found.push({ event: 'novo', a });
      } else if (before.status === 'confirmado' && a.status === 'cancelado') {
        found.push({ event: 'cancelado', a });
      } else if (before.status === 'confirmado' && a.status === 'confirmado'
        && (before.date !== a.date || before.start !== a.start || before.barberId !== a.barberId)) {
        found.push({ event: 'alterado', a, before });
      }
    });
    return found;
  }

  /** Remarcação pelo site chega como "cancelou um" + "marcou outro" do mesmo cliente */
  function merge(list) {
    const out = [];
    list.forEach((x) => {
      if (x.event !== 'novo') return;
      const old = list.find((y) => y.event === 'cancelado' && y.a.clientId === x.a.clientId && !y.used);
      if (old) {
        old.used = true;
        out.push({ event: 'remarcado', a: x.a, before: old.a });
      } else out.push(x);
    });
    list.forEach((x) => { if (x.event !== 'novo' && !x.used) out.push(x); });
    return out;
  }

  const TITLES = { novo: 'Novo agendamento', remarcado: 'Horário remarcado', alterado: 'Agendamento alterado', cancelado: 'Agendamento cancelado' };
  function wants(x, p) {
    if (x.event === 'cancelado' ? !p.pushCancel : !p.pushNew) return false;
    if (p.pushAll) return true;
    const mine = P.me().barberId;
    return x.a.barberId === mine || (x.before && x.before.barberId === mine);
  }
  function text(x) {
    const a = x.a;
    const b = db.barber(a.barberId);
    const when = `${U.fmtDateHuman(a.date).toLowerCase()} às ${a.start}`;
    let body = `${P.clientName(a.clientId)} · ${P.servicesText(a) || 'Atendimento'} · ${when}${b ? ` com ${b.name}` : ''}`;
    if (x.before && x.before.date) body += ` (antes: ${U.fmtDateHuman(x.before.date).toLowerCase()} às ${x.before.start})`;
    return { title: TITLES[x.event], body };
  }

  function show(x) {
    const { title, body } = text(x);
    const open = () => P.openAppointment(x.a.id);
    UI.toast(html`<strong>${title}</strong><br>${body}`, x.event === 'cancelado' ? 'info' : 'success', 9000, open);
    if (document.hidden && desktopOn()) {
      try {
        const n = new Notification(title, { body, tag: `${x.event}-${x.a.id}`, icon: db.settings().logo || U.path('assets/img/icon-192.png') });
        n.onclick = () => { window.focus(); open(); n.close(); };
      } catch (e) { /* navegador sem suporte */ }
    }
  }

  let pending = [];
  let timer = null;
  function flush() {
    timer = null;
    const p = prefs();
    merge(pending).filter((x) => wants(x, p)).slice(0, 4).forEach(show);
    pending = [];
  }

  take();
  db.subscribe((source) => {
    // As minhas próprias mudanças não geram aviso; as de fora sim
    if (source === 'remote') pending.push(...diff());
    take();
    // Remarcação chega em duas partes pelo tempo real: espera um instante para juntar
    if (pending.length && !timer) timer = setTimeout(flush, 1200);
  });

  /* ---------- Tela de configuração ---------- */
  async function deviceBlock() {
    if (N) {
      if (!N.pushAvailable()) {
        return html`<div class="notice"><i class="bi bi-phone"></i><div>Com o painel aberto, os avisos aparecem na tela.
          ${db.isCloud() ? 'Para receber também com o app fechado, a barbearia precisa ativar os avisos do ForBarber.' : 'Na demonstração, os avisos só aparecem com o painel aberto.'}</div></div>`;
      }
      const st = await N.pushPermission();
      if (st === 'granted' && N.pushRegistered()) return html`<div class="notice ok"><i class="bi bi-check2-circle"></i><div><strong>Este celular recebe os avisos</strong>, mesmo com o app fechado.</div></div>`;
      if (st === 'denied') return html`<div class="notice warn"><i class="bi bi-bell-slash"></i><div>As notificações do ForBarber estão bloqueadas. Libere em <strong>Ajustes do celular › ForBarber › Notificações</strong>.</div></div>`;
      return html`<div class="notice"><i class="bi bi-bell"></i><div class="grow">Receba os avisos no celular, mesmo com o app fechado.</div>
        <button type="button" class="btn btn-primary btn-sm" data-enable-push>Ativar neste celular</button></div>`;
    }
    const can = 'Notification' in window;
    return html`
      <label class="switch"><input type="checkbox" id="av-desktop" ${desktopOn() ? raw('checked') : ''} ${can ? '' : raw('disabled')}><span class="track"></span>
        Notificação do computador quando a aba do painel estiver em segundo plano</label>
      <p class="help">Com o app ForBarber no celular, os avisos chegam mesmo com tudo fechado.</p>`;
  }

  async function openSettings() {
    const p = prefs();
    const hasBarber = !!P.me().barberId;
    const m = UI.modal({
      title: 'Avisos de agendamento',
      body: html`
        <div id="av-device"></div>
        <fieldset class="field">
          <legend class="label">O que avisar</legend>
          <label class="switch"><input type="checkbox" id="av-new" ${p.pushNew ? raw('checked') : ''}><span class="track"></span>Novos agendamentos, remarcações e mudanças</label>
          <label class="switch"><input type="checkbox" id="av-cancel" ${p.pushCancel ? raw('checked') : ''}><span class="track"></span>Cancelamentos</label>
        </fieldset>
        ${hasBarber ? html`<fieldset class="field">
          <legend class="label">De quem</legend>
          <div class="seg" id="av-scope">
            <button type="button" data-all="0" aria-pressed="${!p.pushAll}">Só os meus horários</button>
            <button type="button" data-all="1" aria-pressed="${p.pushAll}">Toda a barbearia</button>
          </div>
        </fieldset>` : ''}`,
      footer: html`<button type="button" class="btn btn-ghost" data-close>Cancelar</button>
        <button type="button" class="btn btn-primary" data-save><i class="bi bi-check2"></i>Salvar</button>`,
    });
    let all = p.pushAll;
    const drawDevice = async () => { $('#av-device', m.body).innerHTML = (await deviceBlock()).toString(); };
    drawDevice();
    m.body.addEventListener('click', async (e) => {
      const seg = e.target.closest('[data-all]');
      if (seg) {
        all = seg.dataset.all === '1';
        m.body.querySelectorAll('[data-all]').forEach((b) => b.setAttribute('aria-pressed', String(b === seg)));
      }
      if (e.target.closest('[data-enable-push]')) {
        const st = await N.enablePush();
        if (st !== 'granted') UI.toast('Sem permissão, o celular não recebe os avisos. Dá para liberar depois nos ajustes do celular.', 'info', 7000);
        setTimeout(drawDevice, 1500); // o registro termina em segundo plano
      }
    });
    m.body.addEventListener('change', async (e) => {
      if (e.target.id !== 'av-desktop') return;
      let on = e.target.checked;
      if (on && Notification.permission !== 'granted') on = (await Notification.requestPermission()) === 'granted';
      if (!on && e.target.checked) {
        e.target.checked = false;
        UI.toast('O navegador bloqueou as notificações deste site.', 'info');
      }
      try { localStorage.setItem(DESKTOP_KEY, on ? '1' : '0'); } catch (err) { /* segue */ }
    });
    m.el.querySelector('[data-save]').addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try {
        await savePrefs({ pushNew: $('#av-new', m.body).checked, pushCancel: $('#av-cancel', m.body).checked, pushAll: hasBarber ? all : true });
        m.close();
        UI.toast('Avisos atualizados.');
      } catch (err) {
        e.currentTarget.disabled = false;
        UI.toast(err.message, 'error');
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-avisos]')) return;
    e.preventDefault();
    openSettings();
  });

  /* ---------- Convite para ligar os avisos no celular (uma vez) ---------- */
  const NUDGE_KEY = 'forbarber:pushNudge';
  async function nudge() {
    if (!N || !N.pushAvailable() || document.body.dataset.page !== 'dashboard') return;
    try { if (localStorage.getItem(NUDGE_KEY)) return; } catch (e) { return; }
    if ((await N.pushPermission()) !== 'prompt') return;
    const el = document.createElement('div');
    el.className = 'notice';
    el.innerHTML = html`<i class="bi bi-bell"></i><div class="grow"><strong>Saiba na hora quando entrar um agendamento.</strong> O celular avisa mesmo com o app fechado.</div>
      <button type="button" class="btn btn-primary btn-sm" data-nudge-yes>Ativar</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nudge-no>Agora não</button>`.toString();
    $('#conteudo').prepend(el);
    el.addEventListener('click', async (e) => {
      if (!e.target.closest('[data-nudge-yes], [data-nudge-no]')) return;
      try { localStorage.setItem(NUDGE_KEY, '1'); } catch (err) { /* segue */ }
      if (e.target.closest('[data-nudge-yes]')) {
        const st = await N.enablePush();
        UI.toast(st === 'granted' ? 'Pronto! Os novos agendamentos chegam no celular.' : 'Sem permissão. Dá para ativar depois em Notificações › Avisos.', st === 'granted' ? 'success' : 'info');
      }
      el.remove();
    });
  }
  nudge();

  /* ---------- Toque no aviso: abre o agendamento (?a=id) ---------- */
  const fromPush = new URLSearchParams(location.search).get('a');
  if (fromPush && db.get('appointments', fromPush)) setTimeout(() => P.openAppointment(fromPush), 50);

  App.avisos = { openSettings, prefs };
});
