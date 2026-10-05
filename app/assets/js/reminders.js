/* ==========================================================================
   LEMBRETES DO CLIENTE (window.App.reminders)
   O cliente escolhe quando quer ser avisado de cada horário: um tempo antes
   (30 min, 2 horas, 1 dia…), na véspera a uma hora certa ou no próprio dia
   a uma hora certa. A escolha fica na conta, vale em todos os aparelhos, e
   quem dispara os avisos é o app de celular (native.js), sem servidor.

   Cada aviso é um texto curto:
     antes:120       → 2 horas antes
     vespera:20:00   → na véspera às 20h
     dia:08:00       → no dia às 8h
   ========================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const U = App.utils;
  const { html, raw, $, $$ } = U;

  const CLOUD = !!(window.FORBARBER && window.FORBARBER.mode === 'cloud');
  const MAX = 5;
  const DEFAULT = ['antes:1440', 'antes:120'];
  const PRESETS = ['antes:1440', 'vespera:20:00', 'dia:08:00', 'antes:180', 'antes:120', 'antes:60', 'antes:30'];

  /* ---------- Formato ---------- */
  const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
  function parse(spec) {
    const m = /^(antes|vespera|dia):(.+)$/.exec(String(spec || ''));
    if (!m) return null;
    if (m[1] === 'antes') {
      const min = Number(m[2]);
      return Number.isInteger(min) && min >= 5 && min <= 7 * 1440 ? { kind: 'antes', min } : null;
    }
    return TIME.test(m[2]) ? { kind: m[1], time: m[2] } : null;
  }
  const valid = (spec) => !!parse(spec);
  const clean = (list) => [...new Set((Array.isArray(list) ? list : []).filter(valid))].slice(0, MAX);

  /** "20:00" → "20h", "08:30" → "8h30" */
  const hourLabel = (t) => {
    const [h, m] = t.split(':').map(Number);
    return m ? `${h}h${U.pad(m)}` : `${h}h`;
  };
  function amount(min) {
    if (min % 1440 === 0) return U.plural(min / 1440, 'dia', 'dias');
    if (min % 60 === 0) return U.plural(min / 60, 'hora', 'horas');
    if (min < 60) return `${min} minutos`;
    return U.fmtDuration(min);
  }
  function label(spec) {
    const p = parse(spec);
    if (!p) return '';
    if (p.kind === 'antes') return `${amount(p.min)} antes`;
    return p.kind === 'vespera' ? `Na véspera às ${hourLabel(p.time)}` : `No dia às ${hourLabel(p.time)}`;
  }
  /** Resumo para uma frase: "1 dia antes e 2 horas antes" */
  function summary(list) {
    const items = clean(list).sort(order).map((s) => {
      const l = label(s);
      return l.charAt(0).toLowerCase() + l.slice(1);
    });
    if (!items.length) return '';
    return items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
  }
  /** Do aviso mais cedo para o mais em cima da hora (referência: horário às 14h) */
  function minutesBefore(spec) {
    const p = parse(spec);
    if (p.kind === 'antes') return p.min;
    const ref = 14 * 60 - U.toMin(p.time);
    return p.kind === 'vespera' ? 1440 + ref : ref;
  }
  const order = (a, b) => minutesBefore(b) - minutesBefore(a);

  /* ---------- Quando dispara ---------- */
  const at = (date, time) => new Date(`${date}T${time}:00`);
  /** Data e hora do aviso para um agendamento, ou null se não fizer sentido */
  function fireAt(appt, spec) {
    const p = parse(spec);
    if (!p) return null;
    const start = at(appt.date, appt.start);
    let when;
    if (p.kind === 'antes') when = new Date(start.getTime() - p.min * 60000);
    else if (p.kind === 'vespera') when = at(U.addDays(appt.date, -1), p.time);
    else when = at(appt.date, p.time);
    return when < start ? when : null;
  }

  /* ---------- Onde fica guardado ---------- */
  function get(user) {
    const saved = CLOUD ? App.cloud.reminders() : user && user.reminders;
    return Array.isArray(saved) ? clean(saved) : [...DEFAULT];
  }
  async function save(user, list) {
    const next = clean(list);
    if (CLOUD) await App.cloud.saveReminders(next);
    else App.db.update('users', user.id, { reminders: next });
    if (App.native) await App.native.syncReminders();
    return next;
  }

  /* ---------- Cartão na área do cliente ---------- */
  function cardHTML(user) {
    const list = get(user);
    const native = !!App.native;
    return html`
      <div class="remind-card">
        <span class="remind-icon" aria-hidden="true"><i class="bi ${list.length ? 'bi-bell' : 'bi-bell-slash'}"></i></span>
        <div class="grow">
          <strong>Lembretes</strong>
          <span>${list.length ? `Avisamos ${summary(list)}.` : 'Você não recebe lembretes.'}${native ? '' : ' Os avisos chegam pelo app ForBarber no celular.'}</span>
        </div>
        <button type="button" class="btn btn-outline btn-sm" data-reminders>${list.length ? 'Alterar' : 'Ativar'}</button>
      </div>`;
  }

  /* ---------- Escolha dos avisos ---------- */
  function openSettings(user, { onSave } = {}) {
    let chosen = get(user);
    const extra = () => chosen.filter((s) => !PRESETS.includes(s));
    const chip = (s) => html`<button type="button" class="chip ${chosen.includes(s) ? 'active' : ''}" data-spec="${s}" aria-pressed="${chosen.includes(s)}">${label(s)}</button>`;
    const m = App.ui.modal({
      title: 'Quando quer ser avisado?',
      body: html`
        <p class="muted text-sm">Escolha até ${MAX} avisos para cada horário marcado. ${App.native ? 'Eles chegam como notificação neste celular.' : 'Eles chegam pelo app ForBarber no celular.'}</p>
        <div class="chip-group" id="rm-chips">${[...PRESETS, ...extra()].map(chip)}</div>
        <fieldset class="field remind-custom">
          <legend class="label">Outro aviso</legend>
          <div class="cluster-sm">
            <select class="select input-sm" id="rm-kind" aria-label="Tipo de aviso">
              <option value="antes">Tempo antes</option>
              <option value="vespera">Na véspera às</option>
              <option value="dia">No dia às</option>
            </select>
            <span class="cluster-sm" id="rm-before">
              <input class="input input-sm" id="rm-n" type="number" inputmode="numeric" min="1" max="999" value="10" aria-label="Quantidade" style="width:5.5rem">
              <select class="select input-sm" id="rm-unit" aria-label="Unidade">
                <option value="1">minutos</option>
                <option value="60" selected>horas</option>
                <option value="1440">dias</option>
              </select>
            </span>
            <input class="input input-sm" id="rm-time" type="time" value="10:00" aria-label="Horário do aviso" hidden style="width:auto">
            <button type="button" class="btn btn-ghost btn-sm" id="rm-add"><i class="bi bi-plus-lg"></i>Adicionar</button>
          </div>
        </fieldset>
        <p class="text-sm subtle" id="rm-summary" aria-live="polite"></p>`,
      footer: html`<button type="button" class="btn btn-ghost" data-close>Cancelar</button>
        <button type="button" class="btn btn-primary" data-save><i class="bi bi-check2"></i>Salvar</button>`,
    });
    const body = m.body;
    const refresh = () => {
      $('#rm-chips', body).innerHTML = html`${[...PRESETS, ...extra()].map(chip)}`.toString();
      $('#rm-summary', body).textContent = chosen.length ? `Você vai ser avisado ${summary(chosen)}.` : 'Nenhum aviso escolhido: você não vai receber lembretes.';
    };
    const toggle = (spec) => {
      if (chosen.includes(spec)) chosen = chosen.filter((s) => s !== spec);
      else if (chosen.length >= MAX) return App.ui.toast(`Escolha no máximo ${MAX} avisos.`, 'info');
      else chosen = [...chosen, spec];
      refresh();
    };
    body.addEventListener('click', (e) => {
      const c = e.target.closest('[data-spec]');
      if (c) return toggle(c.dataset.spec);
      if (!e.target.closest('#rm-add')) return;
      const kind = $('#rm-kind', body).value;
      let spec;
      if (kind === 'antes') {
        const n = Math.round(Number($('#rm-n', body).value));
        spec = `antes:${n * Number($('#rm-unit', body).value)}`;
        if (!(n > 0) || !valid(spec)) return App.ui.toast('Escolha entre 5 minutos e 7 dias antes.', 'error');
      } else {
        spec = `${kind}:${$('#rm-time', body).value}`;
        if (!valid(spec)) return App.ui.toast('Informe o horário do aviso.', 'error');
      }
      if (!chosen.includes(spec)) toggle(spec);
    });
    $('#rm-kind', body).addEventListener('change', (e) => {
      const before = e.target.value === 'antes';
      $('#rm-before', body).hidden = !before;
      $('#rm-time', body).hidden = before;
    });
    m.el.querySelector('[data-save]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const next = await save(user, chosen);
        if (next.length && App.native && (await App.native.requestPermission()) !== 'granted') {
          App.ui.toast('Salvo. Para receber os avisos, permita as notificações do ForBarber nos ajustes do celular.', 'info', 7000);
        } else {
          App.ui.toast(next.length ? `Pronto! Avisamos ${summary(next)}.` : 'Lembretes desligados.');
        }
        m.close();
        if (onSave) onSave(next);
      } catch (err) {
        btn.disabled = false;
        App.ui.toast(err.message || 'Não foi possível salvar.', 'error');
      }
    });
    refresh();
  }

  App.reminders = { DEFAULT, PRESETS, MAX, parse, valid, clean, label, summary, fireAt, get, save, cardHTML, openSettings };
})();
