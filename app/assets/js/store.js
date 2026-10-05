/* ==========================================================================
   CAMADA DE DADOS (window.App.db)
   Dois modos com a mesma interface para as páginas:
   - local: demonstração, tudo no localStorage do navegador;
   - nuvem: barbearia real no Supabase (cloud.js), carregada no início e
     gravada em fila no servidor.
   As páginas esperam o carregamento com App.ready(fn).
   ========================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const U = App.utils;

  const CLOUD = !!(window.FORBARBER && window.FORBARBER.mode === 'cloud');
  // v2: clube de assinatura, lista de espera e sinal (a demonstração é recriada)
  const KEY = 'barbearia:db:v2';
  const VERSION = 1;
  const COLLECTIONS = ['services', 'barbers', 'users', 'appointments', 'blocks', 'messages', 'reviews'];
  // Coleções que chegaram depois (clube de assinatura e lista de espera): completadas se faltarem
  const EXTRA = ['plans', 'subscriptions', 'subPayments', 'waitlist', 'products', 'sales'];
  const PREFIX = {
    services: 's', barbers: 'b', users: 'c', appointments: 'a', blocks: 'bl', messages: 'm', reviews: 'r',
    plans: 'pl', subscriptions: 'sb', subPayments: 'sp', waitlist: 'w', products: 'p', sales: 'v',
  };
  const ensureExtra = (d) => {
    EXTRA.forEach((c) => { if (!Array.isArray(d[c])) d[c] = []; });
    return d;
  };

  let data = null;
  let storageOk = true;
  const listeners = new Set();

  const storage = {
    get(key) {
      try { return window.localStorage.getItem(key); } catch (e) { storageOk = false; return null; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, value); return true; } catch (e) { return e; }
    },
  };

  function isValid(obj) {
    return obj && typeof obj === 'object' && obj.settings && COLLECTIONS.every((c) => Array.isArray(obj[c]));
  }

  function load() {
    const saved = storage.get(KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (isValid(parsed) && parsed.version === VERSION) data = parsed;
      } catch (e) { data = null; }
    }
    if (!data) {
      data = App.seed.create();
      persist();
    }
    // Completa configurações e coleções novas que não existiam numa versão salva anterior
    data.settings = { ...App.seed.DEFAULT_SETTINGS, ...data.settings };
    ensureExtra(data);
    data.meta = data.meta || {};
    // Demonstração salva antes da comanda: ganha produtos e vendas de exemplo
    let seeded = false;
    if (data.settings.demoMode && !data.meta.produtos) {
      App.seed.addProducts(data);
      seeded = true;
    }
    if (maintainDemo() || seeded) persist();
  }

  function persist() {
    if (CLOUD) return true;
    const result = storage.set(KEY, JSON.stringify(data));
    if (result === true) return true;
    const quota = result && /quota/i.test(String(result.name || result.message));
    if (App.ui && storageOk) {
      App.ui.toast(
        quota
          ? 'O armazenamento do navegador está cheio. Use imagens menores na aparência ou restaure os dados.'
          : 'Não foi possível salvar neste navegador (modo privado?). As alterações valem só até fechar a página.',
        'error'
      );
    }
    return false;
  }

  function emit(source = 'local') {
    listeners.forEach((fn) => {
      try { fn(source); } catch (e) { console.error(e); }
    });
  }
  function commit() {
    const ok = persist();
    emit('local');
    return ok;
  }

  // Sincroniza abas abertas: agende no site e veja aparecer no painel na hora
  window.addEventListener('storage', (e) => {
    if (CLOUD || e.key !== KEY || !e.newValue) return;
    try {
      const parsed = JSON.parse(e.newValue);
      if (isValid(parsed)) {
        data = ensureExtra(parsed);
        emit('remote');
      }
    } catch (err) { /* ignora */ }
  });

  /* ---------- Modo demonstração: mantém os dados sempre "atuais" ----------
     Desloca tudo em múltiplos de 7 dias (preserva os dias da semana) e
     conclui atendimentos que ficaram no passado. */
  function maintainDemo() {
    if (!data.settings.demoMode) return false;
    const t = U.today();
    const meta = data.meta;
    let changed = false;
    if (meta.seedBase) {
      const offset = Math.floor(U.diffDays(meta.seedBase, t) / 7) * 7;
      if (offset > 0) {
        shiftDates(offset);
        meta.seedBase = U.addDays(meta.seedBase, offset);
        changed = true;
      }
    }
    if (meta.lastNormalized !== t) {
      normalizeStatuses(t);
      meta.lastNormalized = t;
      changed = true;
    }
    return changed;
  }

  function shiftDates(days) {
    const ms = days * 86400000;
    const shift = (ts) => (ts ? new Date(new Date(ts).getTime() + ms).toISOString() : ts);
    data.appointments.forEach((a) => {
      a.date = U.addDays(a.date, days);
      a.createdAt = shift(a.createdAt);
      a.updatedAt = shift(a.updatedAt);
    });
    data.blocks.forEach((b) => {
      b.date = U.addDays(b.date, days);
      b.createdAt = shift(b.createdAt);
    });
    data.subscriptions.forEach((x) => {
      ['startedAt', 'periodStart', 'periodEnd'].forEach((k) => { if (x[k]) x[k] = U.addDays(x[k], days); });
      x.createdAt = shift(x.createdAt);
    });
    data.subPayments.forEach((x) => {
      ['periodStart', 'periodEnd'].forEach((k) => { if (x[k]) x[k] = U.addDays(x[k], days); });
      x.paidAt = shift(x.paidAt);
      x.createdAt = shift(x.createdAt);
    });
    data.waitlist.forEach((x) => {
      x.date = U.addDays(x.date, days);
      x.createdAt = shift(x.createdAt);
    });
    data.sales.forEach((x) => {
      x.date = U.addDays(x.date, days);
      x.createdAt = shift(x.createdAt);
    });
    ['messages', 'reviews', 'users'].forEach((c) =>
      data[c].forEach((x) => {
        x.createdAt = shift(x.createdAt);
        if (x.updatedAt) x.updatedAt = shift(x.updatedAt);
      })
    );
  }

  function normalizeStatuses(t) {
    const nm = U.nowMin();
    const rnd = U.seededRandom(U.hashCode(t));
    const methods = ['pix', 'pix', 'credito', 'debito', 'dinheiro'];
    data.appointments.forEach((a) => {
      if (a.status === 'confirmado' && a.date < t) {
        a.status = rnd() < 0.95 ? 'concluido' : 'faltou';
        if (a.status === 'concluido') a.paymentMethod = a.paymentMethod || methods[Math.floor(rnd() * methods.length)];
      } else if (a.status === 'concluido' && (a.date > t || (a.date === t && U.toMin(a.start) > nm))) {
        a.status = 'confirmado';
        a.paymentMethod = null;
      }
    });
  }

  /* ---------- CRUD genérico ---------- */
  const list = (name) => data[name];
  const get = (name, id) => data[name].find((x) => x.id === id) || null;

  const newId = (name) => (CLOUD ? U.uuid() : U.uid(PREFIX[name] || 'id'));

  function insert(name, obj) {
    const item = { ...obj, id: obj.id || newId(name), createdAt: obj.createdAt || U.nowISO() };
    data[name].push(item);
    commit();
    if (CLOUD) App.cloud.write(name, 'insert', item);
    return item;
  }
  function update(name, id, patch) {
    const item = get(name, id);
    if (!item) return null;
    Object.assign(item, patch, { updatedAt: U.nowISO() });
    commit();
    if (CLOUD) App.cloud.write(name, 'update', item, patch);
    return item;
  }
  function remove(name, id) {
    const i = data[name].findIndex((x) => x.id === id);
    const item = i >= 0 ? data[name][i] : null;
    if (i >= 0) data[name].splice(i, 1);
    commit();
    if (CLOUD && item) App.cloud.write(name, 'delete', item);
  }
  /** Insere esperando a confirmação do servidor (na nuvem); local é imediato */
  async function insertConfirmed(name, obj) {
    const item = { ...obj, id: obj.id || newId(name), createdAt: obj.createdAt || U.nowISO() };
    if (CLOUD) await App.cloud.insertNow(name, item);
    data[name].push(item);
    commit();
    return item;
  }

  /* Usados pela nuvem: recarregar tudo e aplicar mudanças de outros aparelhos */
  function replaceData(next) {
    data = ensureExtra(next);
    emit('remote');
  }
  function applyRemote(name, event, id, obj) {
    const list = data[name];
    if (!list) return;
    const i = list.findIndex((x) => x.id === id);
    if (event === 'DELETE') {
      if (i >= 0) list.splice(i, 1);
    } else if (i >= 0) {
      list[i] = { ...list[i], ...obj };
    } else {
      list.push(obj);
    }
    emit('remote');
  }

  /* ---------- Configurações ---------- */
  const settings = () => data.settings;
  function saveSettings(patch) {
    Object.assign(data.settings, patch);
    if (CLOUD) App.cloud.saveSettings(data.settings);
    return commit();
  }

  /* ---------- Consultas de domínio ---------- */
  const CATEGORY_ORDER = App.seed.CATEGORIES;
  const categoryIndex = (c) => {
    const i = CATEGORY_ORDER.indexOf(c);
    return i === -1 ? 99 : i;
  };
  function services({ active } = {}) {
    const all = data.services.filter((s) => (active ? s.active : true));
    return all
      .map((s, i) => ({ s, i }))
      .sort((a, b) => categoryIndex(a.s.category) - categoryIndex(b.s.category) || a.i - b.i)
      .map((x) => x.s);
  }
  function categories({ active } = {}) {
    const seen = [];
    services({ active }).forEach((s) => {
      if (!seen.includes(s.category)) seen.push(s.category);
    });
    return seen;
  }
  const barbers = ({ active } = {}) => data.barbers.filter((b) => (active ? b.active : true));
  const users = () => data.users;
  const userByEmail = (email) => data.users.find((u) => U.normalize(u.email) === U.normalize(email)) || null;
  const clients = ({ includeInactive } = {}) =>
    data.users.filter((u) => u.role === 'cliente' && (includeInactive || u.active !== false));
  const staffUsers = () => data.users.filter((u) => u.role !== 'cliente');

  /**
   * Filtra agendamentos.
   * @param {object} f { from, to, date, barberId, clientId, status (string|array), active (exclui cancelados) }
   */
  function appointments(f = {}) {
    const statuses = f.status ? [].concat(f.status) : null;
    return data.appointments.filter((a) => {
      if (f.date && a.date !== f.date) return false;
      if (f.from && a.date < f.from) return false;
      if (f.to && a.date > f.to) return false;
      if (f.barberId && a.barberId !== f.barberId) return false;
      if (f.clientId && a.clientId !== f.clientId) return false;
      if (statuses && !statuses.includes(a.status)) return false;
      if (f.active && (a.status === 'cancelado' || a.status === 'faltou')) return false;
      return true;
    });
  }
  const byDateTime = (a, b) => (a.date === b.date ? U.toMin(a.start) - U.toMin(b.start) : a.date < b.date ? -1 : 1);
  const appointmentEnd = (a) => U.fromMin(U.toMin(a.start) + a.duration);
  const blocks = (f = {}) =>
    data.blocks.filter((b) => (!f.date || b.date === f.date) && (!f.barberId || !b.barberId || b.barberId === f.barberId));

  /** Estatísticas de todos os clientes numa única passada */
  function clientStatsMap() {
    const map = new Map();
    const t = U.today();
    data.appointments.forEach((a) => {
      let s = map.get(a.clientId);
      if (!s) {
        s = { visits: 0, spent: 0, lastVisit: null, firstVisit: null, noShows: 0, cancels: 0, upcoming: 0, barbers: {}, services: {} };
        map.set(a.clientId, s);
      }
      if (a.status === 'concluido') {
        s.visits++;
        s.spent += a.total;
        if (!s.lastVisit || a.date > s.lastVisit) s.lastVisit = a.date;
        if (!s.firstVisit || a.date < s.firstVisit) s.firstVisit = a.date;
        s.barbers[a.barberId] = (s.barbers[a.barberId] || 0) + 1;
        a.services.forEach((x) => (s.services[x.name] = (s.services[x.name] || 0) + 1));
      } else if (a.status === 'faltou') s.noShows++;
      else if (a.status === 'cancelado') s.cancels++;
      else if (a.status === 'confirmado' && a.date >= t) s.upcoming++;
    });
    return map;
  }
  const EMPTY_STATS = { visits: 0, spent: 0, lastVisit: null, firstVisit: null, noShows: 0, cancels: 0, upcoming: 0, barbers: {}, services: {} };
  const clientStats = (clientId) => clientStatsMap().get(clientId) || { ...EMPTY_STATS };

  const unreadMessages = () => data.messages.filter((m) => !m.read).length;
  function reviews({ visible } = {}) {
    return data.reviews
      .filter((r) => (visible ? r.visible !== false : true))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  function ratingSummary() {
    const list = reviews({ visible: true });
    const avg = list.length ? U.sum(list, (r) => r.rating) / list.length : 0;
    return { avg, count: list.length };
  }

  /* ---------- Manutenção ---------- */
  function reset() {
    data = App.seed.create();
    return commit();
  }
  /** Começa do zero: mantém configurações, serviços, equipe e acessos da equipe */
  function wipe() {
    data.appointments = [];
    data.blocks = [];
    data.messages = [];
    data.reviews = [];
    data.subscriptions = [];
    data.subPayments = [];
    data.waitlist = [];
    data.sales = [];
    data.users = data.users.filter((u) => u.role !== 'cliente');
    data.settings.demoMode = false;
    return commit();
  }
  const exportJSON = () => JSON.stringify(data, null, 2);
  function importJSON(text) {
    const parsed = JSON.parse(text);
    if (!isValid(parsed)) throw new Error('Arquivo de backup inválido.');
    parsed.version = VERSION;
    parsed.meta = parsed.meta || {};
    data = ensureExtra(parsed);
    return commit();
  }
  const subscribe = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };
  const storageAvailable = () => storageOk;
  const sizeKB = () => Math.round(JSON.stringify(data).length / 1024);

  /* ---------- Carregamento: local na hora, nuvem assíncrono ---------- */
  function emptyData() {
    return {
      version: VERSION, meta: {}, settings: { ...App.seed.DEFAULT_SETTINGS, demoMode: false },
      services: [], barbers: [], users: [], appointments: [], blocks: [], messages: [], reviews: [],
      plans: [], subscriptions: [], subPayments: [], waitlist: [], products: [], sales: [],
    };
  }
  if (CLOUD) {
    data = emptyData();
    App.booted = App.cloud.boot().then((d) => {
      data = ensureExtra(d);
    });
  } else {
    load();
    App.booted = Promise.resolve();
  }

  /** Tela de erro quando a barbearia não carrega (endereço errado, sem internet) */
  App.fatal = function (err) {
    console.error(err);
    const notFound = err && err.code === 'shop_not_found';
    const root = (window.FORBARBER && window.FORBARBER.appRoot) || '';
    const home = root.replace(/[^/]+\/?$/, '');
    document.body.innerHTML = `
      <main style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#f4f5f7;color:#111827;font-family:system-ui,sans-serif;text-align:center">
        <div style="max-width:420px;display:grid;gap:12px">
          <strong style="font-size:1.4rem">${notFound ? 'Barbearia não encontrada' : 'Não foi possível carregar'}</strong>
          <p style="color:#bfb5a6">${notFound ? 'Confira o endereço: ele deve ser igual ao que a barbearia divulgou.' : U.esc(err && err.message ? err.message : 'Tente de novo em instantes.')}</p>
          <a href="${notFound ? home : location.href}" style="color:#2563eb;font-weight:600">${notFound ? 'Ir para o ForBarber' : 'Tentar de novo'}</a>
        </div>
      </main>`;
  };
  /** Roda a função quando os dados estiverem prontos */
  App.ready = (fn) => App.booted.then(() => fn()).catch((err) => {
    if (!App._fatalShown) {
      App._fatalShown = true;
      App.fatal(err);
    }
  });

  App.db = {
    KEY, list, get, insert, update, remove, commit, subscribe,
    settings, saveSettings,
    services, categories, barbers, users, userByEmail, clients, staffUsers,
    appointments, byDateTime, appointmentEnd, blocks,
    clientStatsMap, clientStats, unreadMessages, reviews, ratingSummary,
    reset, wipe, exportJSON, importJSON, storageAvailable, sizeKB,
    insertConfirmed, replaceData, applyRemote, isCloud: () => CLOUD,
    invites: () => data.invites || [],
    barber: (id) => get('barbers', id),
    service: (id) => get('services', id),
    user: (id) => get('users', id),
  };
})();
