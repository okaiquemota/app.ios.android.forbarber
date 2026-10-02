/* ==========================================================================
   NUVEM (window.App.cloud) — liga o ForBarber ao Supabase.
   A camada de dados (store.js) continua síncrona para as páginas: aqui a
   barbearia é carregada no início (conforme o papel de quem está logado),
   as gravações vão para o servidor em fila e as mudanças de outros
   aparelhos chegam em tempo real no painel.
   Só é usado quando config.js tem supabaseUrl e a barbearia não é a demo.
   ========================================================================== */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const CFG = window.FORBARBER || {};

  let sb = null;
  let shop = null;
  let me = null; // { kind: 'staff' | 'client' | 'pending', user, authUser }
  let channel = null;
  let queue = Promise.resolve();

  /* ---------- Cliente Supabase ---------- */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Não foi possível carregar o sistema. Verifique a internet.'));
      document.head.appendChild(s);
    });
  }
  async function client() {
    if (sb) return sb;
    if (!window.supabase) await loadScript(`${CFG.appRoot}assets/vendor/supabase/supabase.js`);
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    return sb;
  }

  /* ---------- Conversão banco <-> objetos usados nas páginas ---------- */
  const t5 = (t) => (t ? String(t).slice(0, 5) : t);
  const FIELDS = {
    services: { name: 'name', category: 'category', description: 'description', duration: 'duration', price: 'price', featured: 'featured', active: 'active', position: 'position' },
    barbers: { name: 'name', title: 'title', specialty: 'specialty', bio: 'bio', color: 'color', photo: 'photo', workDays: 'work_days', commission: 'commission', active: 'active' },
    clients: { name: 'name', phone: 'phone', email: 'email', birthday: 'birthday', notes: 'notes', active: 'active' },
    appointments: { clientId: 'client_id', barberId: 'barber_id', services: 'services', date: 'date', start: 'start_time', duration: 'duration', total: 'total', status: 'status', paymentMethod: 'payment_method', notes: 'notes', source: 'source', overbook: 'overbook' },
    blocks: { barberId: 'barber_id', date: 'date', start: 'start_time', end: 'end_time', reason: 'reason' },
    messages: { name: 'name', email: 'email', phone: 'phone', subject: 'subject', message: 'message', read: 'read' },
    reviews: { clientId: 'client_id', appointmentId: 'appointment_id', barberId: 'barber_id', name: 'name', rating: 'rating', text: 'text', visible: 'visible' },
    members: { name: 'name', phone: 'phone', active: 'active', barberId: 'barber_id' },
  };
  const TABLE = { services: 'services', barbers: 'barbers', appointments: 'appointments', blocks: 'blocks', messages: 'messages', reviews: 'reviews' };

  function toRow(kind, obj) {
    const map = FIELDS[kind];
    const row = {};
    Object.keys(obj).forEach((k) => {
      if (!map[k]) return;
      let v = obj[k];
      if (k === 'birthday' && !v) v = null;
      row[map[k]] = v;
    });
    return row;
  }

  const FROM = {
    services: (r) => ({ id: r.id, name: r.name, category: r.category, description: r.description, duration: r.duration, price: Number(r.price), featured: r.featured, active: r.active, position: r.position, createdAt: r.created_at }),
    barbers: (r) => ({ id: r.id, name: r.name, title: r.title, specialty: r.specialty, bio: r.bio, color: r.color, photo: r.photo, workDays: r.work_days || [], commission: Number(r.commission), active: r.active, createdAt: r.created_at }),
    clients: (r) => ({
      id: r.id, role: 'cliente', name: r.name, phone: r.phone, email: r.email, birthday: r.birthday || '', notes: r.notes,
      active: r.active, createdAt: r.created_at, barberId: null, userId: r.user_id,
      passwordHash: r.user_id ? 'conta-online' : null, salt: null,
    }),
    members: (r) => ({ id: r.user_id, role: r.role, name: r.name, email: r.email, phone: r.phone, barberId: r.barber_id, active: r.active, createdAt: r.created_at, birthday: '', notes: '' }),
    appointments: (r) => ({
      id: r.id, clientId: r.client_id, barberId: r.barber_id, services: r.services || [], date: r.date, start: t5(r.start_time),
      duration: r.duration, total: Number(r.total), status: r.status, paymentMethod: r.payment_method, notes: r.notes || '',
      source: r.source, overbook: r.overbook, createdAt: r.created_at, updatedAt: r.updated_at,
    }),
    blocks: (r) => ({ id: r.id, barberId: r.barber_id, date: r.date, start: t5(r.start_time), end: t5(r.end_time), reason: r.reason, createdAt: r.created_at }),
    messages: (r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone, subject: r.subject, message: r.message, read: r.read, createdAt: r.created_at }),
    reviews: (r) => ({ id: r.id, clientId: r.client_id, appointmentId: r.appointment_id, barberId: r.barber_id, name: r.name, rating: r.rating, text: r.text, visible: r.visible, createdAt: r.created_at }),
  };

  /* ---------- Mensagens de erro em português ---------- */
  function friendly(err) {
    const msg = String((err && (err.message || err.error_description)) || err || '');
    const code = err && err.code;
    if (code === '23P01' || /no_overlap/.test(msg)) return 'Esse horário conflita com outro agendamento. Ative o encaixe ou escolha outro horário.';
    if (code === '42501' || /row-level security|permission denied/i.test(msg)) return 'Seu acesso não permite essa ação.';
    if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos. Confira e tente de novo.';
    if (/Email not confirmed/i.test(msg)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
    if (/already registered|already been registered/i.test(msg)) return 'Já existe uma conta com este e-mail. Entre ou recupere sua senha.';
    if (/Password should be/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.';
    if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.';
    if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Sem conexão com o servidor. Verifique a internet.';
    return msg || 'Algo deu errado. Tente de novo.';
  }

  /* ---------- Leitura ---------- */
  async function selectAll(table, build) {
    const out = [];
    const size = 1000;
    for (let from = 0; ; from += size) {
      const { data, error } = await build(sb.from(table).select('*')).range(from, from + size - 1);
      if (error) throw error;
      out.push(...data);
      if (data.length < size) break;
    }
    return out;
  }

  async function resolveMe() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      me = null;
      return;
    }
    const authUser = session.user;
    const { data: member } = await sb.from('shop_members').select('*').eq('shop_id', shop.id).eq('user_id', authUser.id).eq('active', true).maybeSingle();
    if (member) {
      me = { kind: 'staff', user: FROM.members(member), authUser };
      return;
    }
    const { data: cli } = await sb.from('clients').select('*').eq('shop_id', shop.id).eq('user_id', authUser.id).eq('active', true).maybeSingle();
    me = cli ? { kind: 'client', user: FROM.clients(cli), authUser } : { kind: 'pending', user: null, authUser };
  }

  /** Monta o mesmo formato de dados da versão local, conforme o papel */
  async function loadData() {
    const settings = { ...App.seed.DEFAULT_SETTINGS, ...(shop.settings || {}), name: shop.name, demoMode: false };
    const data = {
      version: 1, meta: { cloud: true }, settings,
      services: [], barbers: [], users: [], appointments: [], blocks: [], messages: [], reviews: [],
    };
    const t = App.utils.today();
    const [services, barbers, reviews] = await Promise.all([
      selectAll('services', (q) => q.eq('shop_id', shop.id).order('position').order('created_at')),
      selectAll('barbers', (q) => q.eq('shop_id', shop.id).order('created_at')),
      selectAll('reviews', (q) => q.eq('shop_id', shop.id).order('created_at', { ascending: false })),
    ]);
    data.services = services.map(FROM.services);
    data.barbers = barbers.map(FROM.barbers);
    data.reviews = reviews.map(FROM.reviews);

    if (me && me.kind === 'staff') {
      const isAdmin = me.user.role === 'admin';
      const [clients, appts, blocks, members, messages, invites] = await Promise.all([
        selectAll('clients', (q) => q.eq('shop_id', shop.id)),
        selectAll('appointments', (q) => q.eq('shop_id', shop.id).gte('date', App.utils.addDays(t, -400))),
        selectAll('blocks', (q) => q.eq('shop_id', shop.id).gte('date', App.utils.addDays(t, -30))),
        selectAll('shop_members', (q) => q.eq('shop_id', shop.id)),
        isAdmin ? selectAll('messages', (q) => q.eq('shop_id', shop.id)) : Promise.resolve([]),
        isAdmin ? selectAll('shop_invites', (q) => q.eq('shop_id', shop.id)) : Promise.resolve([]),
      ]);
      data.users = [...members.map(FROM.members), ...clients.map(FROM.clients)];
      data.appointments = appts.map(FROM.appointments);
      data.blocks = blocks.map(FROM.blocks);
      data.messages = messages.map(FROM.messages);
      data.invites = invites.map((i) => ({ email: i.email, barberId: i.barber_id, role: i.role, name: i.name }));
      return data;
    }

    // Público e clientes: horários ocupados sem dados de outras pessoas
    const span = Number(settings.bookingWindow) || 30;
    const { data: busy, error } = await sb.rpc('public_busy', { p_shop: shop.id, p_from: App.utils.addDays(t, -1), p_to: App.utils.addDays(t, span + 1) });
    if (error) throw error;
    busy.forEach((b) => {
      if (b.kind === 'block') {
        data.blocks.push({ id: b.id, barberId: b.barber_id, date: b.date, start: t5(b.start_time), end: App.utils.fromMin(App.utils.toMin(t5(b.start_time)) + b.duration), reason: 'Indisponível' });
      } else {
        data.appointments.push({ id: b.id, clientId: null, barberId: b.barber_id, services: [], date: b.date, start: t5(b.start_time), duration: b.duration, total: 0, status: 'confirmado', source: 'site', busyOnly: true });
      }
    });
    if (me && me.kind === 'client') {
      data.users = [me.user];
      const own = await selectAll('appointments', (q) => q.eq('client_id', me.user.id));
      own.map(FROM.appointments).forEach((a) => {
        const i = data.appointments.findIndex((x) => x.id === a.id);
        if (i >= 0) data.appointments[i] = a;
        else data.appointments.push(a);
      });
    }
    return data;
  }

  /* ---------- Início ---------- */
  async function boot() {
    await client();
    const { data: found, error } = await sb.from('shops').select('*').eq('slug', CFG.slug).maybeSingle();
    if (error) throw new Error(friendly(error));
    if (!found) {
      const e = new Error('Barbearia não encontrada.');
      e.code = 'shop_not_found';
      throw e;
    }
    shop = found;
    await resolveMe();
    const data = await loadData();
    if (me && me.kind === 'staff') subscribe();
    return data;
  }

  async function reload() {
    await resolveMe();
    const data = await loadData();
    App.db.replaceData(data);
    return data;
  }

  /* ---------- Tempo real (painel) ---------- */
  function subscribe() {
    if (channel) sb.removeChannel(channel);
    const filter = `shop_id=eq.${shop.id}`;
    const apply = (name, kind) => (payload) => {
      const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
      if (!row || !row.id) return;
      const obj = payload.eventType === 'DELETE' ? null : FROM[kind](row);
      App.db.applyRemote(name, payload.eventType, row.id, obj);
    };
    channel = sb.channel(`shop-${shop.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter }, apply('appointments', 'appointments'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter }, apply('messages', 'messages'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter }, apply('users', 'clients'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blocks', filter }, apply('blocks', 'blocks'))
      .subscribe();
  }

  /* ---------- Gravação (fila, para manter a ordem) ---------- */
  function enqueue(job) {
    const run = queue.then(job);
    queue = run.catch(() => {});
    return run;
  }

  async function onWriteError(err) {
    const ui = App.ui;
    if (ui) ui.toast(friendly(err), 'error');
    try { await reload(); } catch (e) { /* mantém o que tem */ }
  }

  /** Gravação genérica disparada pelo store.js (insert/update/remove) */
  function write(name, op, item, patch) {
    return enqueue(async () => {
      try {
        let table = TABLE[name];
        let kind = name;
        if (name === 'users') {
          if (item.role !== 'cliente') return writeMember(op, item, patch);
          table = 'clients';
          kind = 'clients';
        }
        if (!table) return;
        let q;
        if (op === 'insert') {
          const row = toRow(kind, item);
          q = sb.from(table).insert({ ...row, id: item.id, shop_id: shop.id });
        } else if (op === 'update') {
          const row = toRow(kind, patch);
          if (!Object.keys(row).length) return;
          q = sb.from(table).update(row).eq('id', item.id);
        } else {
          q = sb.from(table).delete().eq('id', item.id);
        }
        const { error } = await q;
        if (error) throw error;
      } catch (err) {
        await onWriteError(err);
        throw err;
      }
    }).catch(() => {});
  }

  async function writeMember(op, item, patch) {
    if (op !== 'update') return;
    const row = toRow('members', patch);
    if (!Object.keys(row).length) return;
    const { error } = await sb.from('shop_members').update(row).eq('shop_id', shop.id).eq('user_id', item.id);
    if (error) throw error;
  }

  /** Gravação que precisa da resposta do servidor antes de seguir (ex.: agendamento da equipe) */
  function insertNow(name, obj) {
    return enqueue(async () => {
      const kind = name === 'users' ? 'clients' : name;
      const { error } = await sb.from(TABLE[name] || 'clients').insert({ ...toRow(kind, obj), id: obj.id, shop_id: shop.id });
      if (error) throw new Error(friendly(error));
      return obj;
    });
  }

  function saveSettings(settings) {
    return enqueue(async () => {
      const clean = { ...settings };
      delete clean.demoMode;
      const { error } = await sb.from('shops').update({ settings: clean, name: clean.name }).eq('id', shop.id);
      if (error) {
        await onWriteError(error);
        return;
      }
      shop.settings = clean;
      shop.name = clean.name;
    });
  }

  async function rpc(fn, args) {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new Error(friendly(error));
    return data;
  }

  /* ---------- Ações de cliente (validadas no servidor) ---------- */
  async function book({ barberId, serviceIds, date, start, notes, reschedule, id }) {
    await ensureClient();
    const row = await rpc('book_appointment', {
      p_shop: shop.id, p_barber: barberId, p_service_ids: serviceIds, p_date: date, p_start: start,
      p_notes: notes || '', p_reschedule: reschedule || null, p_id: id || null,
    });
    await reload();
    return FROM.appointments(row);
  }
  async function cancelMine(id) {
    await rpc('cancel_my_appointment', { p_id: id });
    await reload();
  }
  async function review(appointmentId, rating, text) {
    await rpc('add_review', { p_appointment: appointmentId, p_rating: rating, p_text: text });
    await reload();
  }
  async function updateProfile({ name, phone, birthday }) {
    await rpc('update_my_profile', { p_shop: shop.id, p_name: name, p_phone: phone, p_birthday: birthday || null });
    await reload();
  }
  async function deleteAccount() {
    await rpc('delete_my_account', { p_shop: shop.id });
    await sb.auth.signOut();
  }

  /** Garante o cadastro do cliente nesta barbearia (uma conta serve para várias) */
  async function ensureClient(extra = {}) {
    if (me && (me.kind === 'client' || me.kind === 'staff')) return me.user;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error('Entre na sua conta para continuar.');
    const meta = session.user.user_metadata || {};
    await rpc('join_shop', {
      p_shop: shop.id,
      p_name: extra.name || meta.name || '',
      p_phone: extra.phone || meta.phone || '',
      p_birthday: extra.birthday || meta.birthday || null,
    });
    await reload();
    return me && me.user;
  }

  /* ---------- Autenticação ---------- */
  async function afterAuth() {
    await rpc('accept_invites', {}).catch(() => 0);
    await resolveMe();
    if (!me || me.kind === 'pending') await ensureClient();
    else await reload();
    if (me && me.kind === 'staff') subscribe();
    return me && me.user;
  }

  async function login(email, password) {
    await client();
    const { error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) return { ok: false, error: friendly(error) };
    try {
      const user = shop ? await afterAuth() : null;
      return { ok: true, user };
    } catch (e) {
      return { ok: false, error: friendly(e) };
    }
  }

  async function register({ name, email, phone, birthday, password, redirect }) {
    await client();
    const { data, error } = await sb.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { name, phone, birthday: birthday || null }, emailRedirectTo: redirect || `${CFG.appRoot}login.html?confirmado=1` },
    });
    if (error) return { ok: false, error: friendly(error) };
    if (!data.session) return { ok: true, needsConfirmation: true };
    try {
      const user = shop ? await afterAuth() : null;
      return { ok: true, user, claimed: false };
    } catch (e) {
      return { ok: false, error: friendly(e) };
    }
  }

  async function logout() {
    if (sb) await sb.auth.signOut().catch(() => {});
    me = null;
  }

  async function changePassword(currentPassword, newPassword) {
    const email = me && me.authUser && me.authUser.email;
    const check = await sb.auth.signInWithPassword({ email, password: currentPassword });
    if (check.error) return { ok: false, error: 'A senha atual não confere.' };
    const { error } = await sb.auth.updateUser({ password: newPassword });
    return error ? { ok: false, error: friendly(error) } : { ok: true };
  }

  async function sendReset(email, redirect) {
    await client();
    const { error } = await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: redirect || `${CFG.appRoot}senha.html` });
    return error ? { ok: false, error: friendly(error) } : { ok: true };
  }
  async function setNewPassword(password) {
    const { error } = await sb.auth.updateUser({ password });
    return error ? { ok: false, error: friendly(error) } : { ok: true };
  }
  async function hasRecoverySession() {
    await client();
    const isRecovery = /type=recovery/.test(location.hash) || /type=recovery/.test(location.search);
    const { data: { session } } = await sb.auth.getSession();
    return !!session && isRecovery;
  }

  /* ---------- Equipe: convite por e-mail ---------- */
  async function invite({ email, barberId, name, role = 'barbeiro' }) {
    const { error } = await sb.from('shop_invites').upsert({ shop_id: shop.id, email: email.trim().toLowerCase(), barber_id: barberId, name, role });
    if (error) throw new Error(friendly(error));
    await reload();
  }
  async function cancelInvite(email) {
    const { error } = await sb.from('shop_invites').delete().eq('shop_id', shop.id).eq('email', email);
    if (error) throw new Error(friendly(error));
    await reload();
  }

  /* ---------- Imagens (logo, capa) ---------- */
  async function uploadImage(kind, dataUrl) {
    const blob = await (await fetch(dataUrl)).blob();
    const ext = blob.type === 'image/png' ? 'png' : 'jpg';
    const path = `${shop.id}/${kind}-${Date.now()}.${ext}`;
    const { error } = await sb.storage.from('shop-assets').upload(path, blob, { contentType: blob.type, upsert: true });
    if (error) throw new Error(friendly(error));
    return sb.storage.from('shop-assets').getPublicUrl(path).data.publicUrl;
  }

  /* ---------- Produto (sem barbearia aberta): criar e listar barbearias ---------- */
  async function slugAvailable(slug) {
    await client();
    return rpc('slug_available', { p_slug: slug });
  }
  async function createShop({ name, slug, ownerName, phone }) {
    await client();
    return rpc('create_shop', { p_name: name, p_slug: slug, p_owner_name: ownerName, p_phone: phone || '' });
  }
  async function myShops() {
    await client();
    return rpc('my_shops', {});
  }
  async function session() {
    await client();
    const { data } = await sb.auth.getSession();
    return data.session;
  }

  App.cloud = {
    boot, reload, write, insertNow, saveSettings, rpc, friendly,
    book, cancelMine, review, updateProfile, deleteAccount, ensureClient,
    login, register, logout, changePassword, sendReset, setNewPassword, hasRecoverySession,
    invite, cancelInvite, uploadImage,
    slugAvailable, createShop, myShops, session, client,
    shop: () => shop,
    current: () => (me && me.kind !== 'pending' ? me.user : null),
    pendingEmail: () => (me && me.kind === 'pending' && me.authUser ? me.authUser.email : null),
    newId: () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : null),
  };
})();
