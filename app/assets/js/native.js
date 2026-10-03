/* ==========================================================================
   APP DE CELULAR (window.App.native) — só age dentro do app iOS/Android.
   Guarda as barbearias abertas para a tela inicial do app, mostra o botão
   "Trocar de barbearia" e agenda lembretes no celular do cliente
   (2 horas antes de cada horário confirmado).
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

  /** Id numérico estável para o lembrete de cada agendamento */
  const noteId = (id) => {
    let h = 7;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return Math.abs(h % 2000000000) + 1;
  };

  let syncing = Promise.resolve();
  function syncReminders() {
    syncing = syncing.then(async () => {
      const user = App.auth.current();
      if (!user || App.auth.isStaff(user)) return;
      const s = App.db.settings();
      const now = Date.now();
      const upcoming = App.db.appointments({ clientId: user.id, status: 'confirmado', from: App.utils.today() })
        .map((a) => ({ a, at: new Date(`${a.date}T${a.start}:00`).getTime() - 2 * 3600000 }))
        .filter((x) => x.at > now + 60000);
      const pending = (await Notes.getPending().catch(() => ({ notifications: [] }))).notifications || [];
      const mine = pending.filter((n) => n.extra && n.extra.forbarber && n.extra.slug === CFG.slug);
      const wanted = new Set(upcoming.map((x) => noteId(x.a.id)));
      const stale = mine.filter((n) => !wanted.has(Number(n.id)));
      if (stale.length) await Notes.cancel({ notifications: stale.map((n) => ({ id: Number(n.id) })) }).catch(() => {});
      const have = new Set(mine.map((n) => Number(n.id)));
      const missing = upcoming.filter((x) => !have.has(noteId(x.a.id)));
      if (!missing.length) return;
      let perm = await Notes.checkPermissions().catch(() => ({ display: 'denied' }));
      if (perm.display === 'prompt' || perm.display === 'prompt-with-rationale') perm = await Notes.requestPermissions().catch(() => perm);
      if (perm.display !== 'granted') return;
      await Notes.schedule({
        notifications: missing.map(({ a, at }) => {
          const b = App.db.barber(a.barberId);
          return {
            id: noteId(a.id),
            title: `Seu horário na ${s.name} é às ${a.start}`,
            body: `${a.services.map((x) => x.name).join(' + ')}${b ? ` com ${b.name}` : ''}. Precisa remarcar? Toque aqui.`,
            schedule: { at: new Date(at), allowWhileIdle: true },
            extra: { forbarber: true, slug: CFG.slug, url: CFG.shopUrl(CFG.slug, 'minha-conta.html') },
          };
        }),
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

  App.native = { syncReminders, remember, home };

  App.ready(() => {
    const s = App.db.settings();
    const user = App.auth.current();
    remember({ slug: CFG.slug, name: s.name, logo: s.logo || '', staff: !!(user && App.auth.isStaff(user)) });
    homeButtons();
    syncReminders();
    App.db.subscribe(() => {
      homeButtons();
      syncReminders();
    });
  });
})();
