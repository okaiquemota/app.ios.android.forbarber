/* ==========================================================================
   AUTENTICAÇÃO (window.App.auth)
   Papéis: admin (dono), barbeiro (equipe) e cliente.
   Demonstração: a sessão fica no navegador. Em produção a validação de
   senha e as permissões precisam acontecer no servidor.
   ========================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const U = App.utils;
  const db = App.db;

  const CLOUD = !!(window.FORBARBER && window.FORBARBER.mode === 'cloud');
  const SESSION_KEY = 'barbearia:session';
  const ROLES = { admin: 'Administrador', barbeiro: 'Barbeiro', cliente: 'Cliente' };
  let memorySession = null;

  const session = {
    read() {
      try {
        const s = window.sessionStorage.getItem(SESSION_KEY) || window.localStorage.getItem(SESSION_KEY);
        return s ? JSON.parse(s) : memorySession;
      } catch (e) {
        return memorySession;
      }
    },
    write(value, remember) {
      memorySession = value;
      try {
        const keep = remember ? window.localStorage : window.sessionStorage;
        const drop = remember ? window.sessionStorage : window.localStorage;
        keep.setItem(SESSION_KEY, JSON.stringify(value));
        drop.removeItem(SESSION_KEY);
      } catch (e) { /* segue só em memória */ }
    },
    clear() {
      memorySession = null;
      try {
        window.localStorage.removeItem(SESSION_KEY);
        window.sessionStorage.removeItem(SESSION_KEY);
      } catch (e) { /* nada a fazer */ }
    },
  };

  const newSalt = () => {
    const bytes = new Uint8Array(12);
    (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(bytes) : bytes.forEach((_, i) => (bytes[i] = Math.random() * 256));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  };
  const hash = (password, salt) => App.seed.hashPassword(password, salt);
  const verify = (user, password) => !!(user && user.passwordHash && user.passwordHash === hash(password, user.salt));

  function current() {
    if (CLOUD) return App.cloud.current();
    const s = session.read();
    if (!s) return null;
    const user = db.user(s.userId);
    return user && user.active !== false ? user : null;
  }

  /** Todas as ações de conta devolvem Promise (na nuvem falam com o servidor) */
  async function login(email, password, remember = true) {
    if (CLOUD) return App.cloud.login(email, password);
    const user = db.userByEmail(email);
    if (!verify(user, password)) return { ok: false, error: 'E-mail ou senha incorretos. Confira e tente de novo.' };
    if (user.active === false) return { ok: false, error: 'Este acesso foi desativado. Fale com a barbearia.' };
    session.write({ userId: user.id, at: U.nowISO() }, remember);
    return { ok: true, user };
  }

  async function logout() {
    // No app, o celular da equipe para de receber avisos desta conta
    if (App.native && App.native.beforeLogout) await App.native.beforeLogout();
    session.clear();
    if (CLOUD) await App.cloud.logout();
  }

  /** Cadastro de cliente. Se a pessoa já era cliente do balcão (mesmo e-mail
      ou telefone, sem senha), a conta é "assumida" e o histórico aparece. */
  async function register({ name, email, phone, birthday, password }) {
    if (CLOUD) return App.cloud.register({ name, email, phone, birthday, password });
    const byEmail = db.userByEmail(email);
    if (byEmail && (byEmail.passwordHash || byEmail.role !== 'cliente')) {
      return { ok: false, error: 'Já existe uma conta com este e-mail. Entre ou recupere sua senha.' };
    }
    const byPhone = !byEmail && phone
      ? db.clients().find((c) => !c.passwordHash && U.digits(c.phone) && U.digits(c.phone) === U.digits(phone))
      : null;
    const existing = byEmail || byPhone;
    const salt = newSalt();
    let user;
    if (existing) {
      user = db.update('users', existing.id, {
        name, email, phone, birthday: birthday || existing.birthday || '', salt, passwordHash: hash(password, salt),
      });
    } else {
      user = db.insert('users', {
        role: 'cliente', name, email, phone, birthday: birthday || '', notes: '', barberId: null,
        salt, passwordHash: hash(password, salt), active: true,
      });
    }
    session.write({ userId: user.id, at: U.nowISO() }, true);
    return { ok: true, user, claimed: !!existing };
  }

  function setPassword(userId, password) {
    const salt = newSalt();
    return db.update('users', userId, { salt, passwordHash: hash(password, salt) });
  }

  async function changePassword(userId, currentPassword, newPassword) {
    if (CLOUD) return App.cloud.changePassword(currentPassword, newPassword);
    if (!verify(db.user(userId), currentPassword)) return { ok: false, error: 'A senha atual não confere.' };
    setPassword(userId, newPassword);
    return { ok: true };
  }

  const isCloud = () => CLOUD;
  const isStaff = (u) => !!u && (u.role === 'admin' || u.role === 'barbeiro');
  const homeFor = (u) => (isStaff(u) ? U.path('painel/index.html') : U.path('minha-conta.html'));

  /** Caminho atual relativo à raiz do site (para voltar depois do login) */
  function currentPath() {
    const file = location.pathname.split('/').pop() || 'index.html';
    const inPanel = (document.documentElement.dataset.base || '') !== '';
    return (inPanel ? 'painel/' : '') + file + location.search;
  }
  const loginUrl = (next) => U.path('login.html') + (next ? `?next=${encodeURIComponent(next)}` : '');

  /** Aceita só caminhos internos (evita redirecionamento para outro site) */
  function safeNext(next) {
    if (!next) return null;
    return /^(painel\/)?[a-z0-9-]+\.html(\?[\w=&%.-]*)?(#[\w-]*)?$/i.test(next) ? next : null;
  }

  /** Protege uma página: exige login e (opcionalmente) um dos papéis */
  function requireRole(roles) {
    const user = current();
    if (!user) {
      location.replace(loginUrl(currentPath()));
      return null;
    }
    if (roles && !roles.includes(user.role)) {
      location.replace(homeFor(user));
      return null;
    }
    return user;
  }

  App.auth = {
    ROLES, current, login, logout, register, setPassword, changePassword, verify,
    isStaff, homeFor, loginUrl, safeNext, requireRole, currentPath, isCloud,
  };
})();
