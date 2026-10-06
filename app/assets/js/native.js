/* ==========================================================================
   APP DE CELULAR (window.App.native) — só age dentro do app iOS/Android.
   Guarda as barbearias abertas para a tela inicial do app, mostra o botão
   "Trocar de barbearia", agenda os lembretes do cliente (nos momentos que
   ele escolheu) e registra o celular da equipe para avisos de agendamento.
   ========================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const CFG = window.FORBARBER;
  if (!CFG.native) {
    App.native = null;
    return;
  }
  const cap = window.Capacitor;
  document.documentElement.classList.add('is-native', `is-${CFG.platform}`);

  const SHOPS_KEY = 'forbarber:shops';
  const home = new URL('../index.html', CFG.appRoot).href;
  const Notes = cap.registerPlugin('LocalNotifications');

  function remember(entry) {
    try {
      const list = JSON.parse(localStorage.getItem(SHOPS_KEY) || '[]').filter((s) => s.slug !== entry.slug);
      list.unshift({ ...entry, openedAt: Date.now() });
      localStorage.setItem(SHOPS_KEY, JSON.stringify(list.slice(0, 12)));
    } catch (e) { /* sem armazenamento: segue */ }
  }

  /** Id numérico estável para cada lembrete (agendamento + momento do aviso) */
  const noteId = (id) => {
    let h = 7;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return Math.abs(h % 2000000000) + 1;
  };

  async function permission() {
    const p = await Notes.checkPermissions().catch(() => ({ display: 'denied' }));
    return p.display;
  }
  async function requestPermission() {
    let p = await permission();
    if (p === 'prompt' || p === 'prompt-with-rationale') p = (await Notes.requestPermissions().catch(() => ({ display: p }))).display;
    return p;
  }

  /** Texto do aviso conforme o dia em que ele chega: "Amanhã às 10:00", "Hoje às 10:00"... */
  function reminderText(a, when, s) {
    const b = App.db.barber(a.barberId);
    const days = App.utils.diffDays(App.utils.toISODate(when), a.date);
    const day = days === 0 ? 'Hoje' : days === 1 ? 'Amanhã' : App.utils.fmtDateHuman(a.date);
    return {
      title: `${day} às ${a.start} na ${s.name}`,
      body: `${a.services.map((x) => x.name).join(' + ')}${b ? ` com ${b.name}` : ''}. Precisa remarcar? Toque aqui.`,
    };
  }

  /* Lembretes do cliente: um aviso para cada horário marcado e cada momento que
     ele escolheu (App.reminders). Os avisos ficam agendados no próprio celular:
     chegam mesmo sem internet. Sai da conta = avisos desta barbearia somem. */
  let syncing = Promise.resolve();
  function syncReminders() {
    syncing = syncing.then(async () => {
      // Página sem o módulo de lembretes (painel) ou app da equipe: não mexe nos avisos
      if (!App.reminders || CFG.appKind === 'pro') return;
      const user = App.auth.current();
      const client = user && !App.auth.isStaff(user) ? user : null;
      const s = App.db.settings();
      const now = Date.now();
      const wanted = [];
      if (client) {
        const specs = App.reminders.get(client);
        App.db.appointments({ clientId: client.id, status: 'confirmado', from: App.utils.today() })
          .sort(App.db.byDateTime)
          .slice(0, 12) // o iPhone guarda no máximo 64 avisos pendentes
          .forEach((a) => specs.forEach((spec) => {
            const when = App.reminders.fireAt(a, spec);
            if (when && when.getTime() > now + 60000) wanted.push({ a, when, spec, id: noteId(`${a.id}|${spec}`) });
          }));
      }
      const pending = (await Notes.getPending().catch(() => ({ notifications: [] }))).notifications || [];
      const mine = pending.filter((n) => n.extra && n.extra.forbarber && n.extra.slug === CFG.slug);
      const ids = new Set(wanted.map((x) => x.id));
      const stale = mine.filter((n) => !ids.has(Number(n.id)));
      if (stale.length) await Notes.cancel({ notifications: stale.map((n) => ({ id: Number(n.id) })) }).catch(() => {});
      const have = new Set(mine.map((n) => Number(n.id)));
      const missing = wanted.filter((x) => !have.has(x.id));
      if (!missing.length || (await requestPermission()) !== 'granted') return;
      await Notes.schedule({
        notifications: missing.map(({ a, when, spec, id }) => ({
          id,
          ...reminderText(a, when, s),
          schedule: { at: when, allowWhileIdle: true },
          extra: { forbarber: true, slug: CFG.slug, spec, url: CFG.shopUrl(CFG.slug, 'minha-conta.html') },
        })),
      }).catch(() => {});
    }).catch(() => {});
    return syncing;
  }

  // Toque no lembrete: abre a área do cliente daquela barbearia
  Notes.addListener('localNotificationActionPerformed', (ev) => {
    const url = ev && ev.notification && ev.notification.extra && ev.notification.extra.url;
    if (url) location.href = url;
  }).catch(() => {});

  /** Botão para voltar à tela inicial do app (lista de barbearias) */
  function homeButtons() {
    // Depois que o cabeçalho/menu da página terminar de montar
    setTimeout(addHomeButtons, 0);
  }
  function addHomeButtons() {
    document.querySelectorAll('[data-native-home]').forEach((el) => el.remove());
    const make = (cls, label) => {
      const a = document.createElement('a');
      a.href = home;
      a.className = cls;
      a.dataset.nativeHome = '';
      a.innerHTML = `<i class="bi bi-grid" aria-hidden="true"></i><span>${label}</span>`;
      return a;
    };
    const mobile = document.querySelector('#mobile-nav .mobile-nav-actions');
    if (mobile) mobile.appendChild(make('btn btn-ghost btn-block', 'Trocar de barbearia'));
    const side = document.querySelector('#side .side-foot');
    if (side) side.prepend(make('side-link', 'Outras barbearias'));
  }

  /* ---------- Avisos de agendamento para a equipe (push) ----------
     Só com push: true no config.js (Firebase e chave da Apple configurados).
     O celular fica registrado na conta: o servidor manda o aviso quando entra,
     muda ou cai um horário (supabase/functions/notify-booking). */
  const PUSH_KEY = 'forbarber:pushToken';
  // Push só no ForBarber Pro (o app do cliente nem tem o plugin)
  const Push = CFG.push && CFG.appKind === 'pro' ? cap.registerPlugin('PushNotifications') : null;
  const pushOn = () => !!(Push && App.auth.isCloud());
  let pushListening = false;
  function pushListeners() {
    if (pushListening || !Push) return;
    pushListening = true;
    Push.addListener('registration', async ({ value }) => {
      try {
        await App.cloud.registerDevice(value, CFG.platform);
        localStorage.setItem(PUSH_KEY, value);
      } catch (e) { console.warn('ForBarber: celular não registrado para avisos', e); }
    }).catch(() => {});
    Push.addListener('registrationError', (e) => console.warn('ForBarber: push', e)).catch(() => {});
    // Toque no aviso: abre a agenda no dia, com o agendamento aberto
    Push.addListener('pushNotificationActionPerformed', ({ notification }) => {
      const d = (notification && notification.data) || {};
      if (d.slug && d.path) location.href = CFG.shopUrl(d.slug, d.path);
    }).catch(() => {});
  }
  async function pushPermission() {
    if (!pushOn()) return 'unavailable';
    return (await Push.checkPermissions().catch(() => ({ receive: 'denied' }))).receive;
  }
  /** Liga os avisos neste celular (pede a permissão se ainda não pediu) */
  async function enablePush() {
    if (!pushOn()) return 'unavailable';
    pushListeners();
    let p = await pushPermission();
    if (p === 'prompt' || p === 'prompt-with-rationale') p = (await Push.requestPermissions().catch(() => ({ receive: 'denied' }))).receive;
    if (p !== 'granted') return p;
    if (CFG.platform === 'android') {
      await Push.createChannel({ id: 'agendamentos', name: 'Agendamentos', description: 'Novos horários, remarcações e cancelamentos', importance: 5, visibility: 1, sound: 'default', vibration: true }).catch(() => {});
    }
    await Push.register();
    return 'granted';
  }
  const pushRegistered = () => {
    try { return !!localStorage.getItem(PUSH_KEY); } catch (e) { return false; }
  };
  /** Ao abrir o app como equipe: renova o registro (o token pode mudar) */
  async function syncPush() {
    const user = App.auth.current();
    if (!pushOn() || !user || !App.auth.isStaff(user)) return;
    pushListeners();
    if ((await pushPermission()) === 'granted') enablePush().catch(() => {});
  }
  /** Antes de sair da conta: este celular deixa de receber os avisos dela */
  async function beforeLogout() {
    let token = null;
    try { token = localStorage.getItem(PUSH_KEY); localStorage.removeItem(PUSH_KEY); } catch (e) { /* segue */ }
    if (token && App.auth.isCloud()) await App.cloud.unregisterDevice(token).catch(() => {});
  }

  App.native = {
    syncReminders, permission, requestPermission, remember, home,
    pushAvailable: pushOn, pushPermission, enablePush, pushRegistered, beforeLogout,
  };

  App.ready(() => {
    const s = App.db.settings();
    const user = App.auth.current();
    remember({ slug: CFG.slug, name: s.name, logo: s.logo || '', staff: !!(user && App.auth.isStaff(user)) });
    homeButtons();
    syncReminders();
    syncPush();
    App.db.subscribe(() => {
      homeButtons();
      syncReminders();
    });
  });
})();
