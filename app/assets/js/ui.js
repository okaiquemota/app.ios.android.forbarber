/* ==========================================================================
   COMPONENTES DE INTERFACE (window.App.ui)
   Toasts, modais (<dialog>), confirmação, menus, abas, formulários e a
   aplicação da identidade visual (nome, cor, logo) em qualquer página.
   ========================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const U = App.utils;
  const { html, raw, $, $$ } = U;

  /* ---------- Toast ---------- */
  let toastRoot = null;
  const TOAST_ICONS = { success: 'bi-check-circle-fill', error: 'bi-exclamation-octagon-fill', info: 'bi-info-circle-fill' };
  function toast(message, type = 'success', timeout = 4200) {
    if (!toastRoot) {
      toastRoot = document.createElement('div');
      toastRoot.className = 'toasts';
      toastRoot.setAttribute('role', 'status');
      toastRoot.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastRoot);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = html`<i class="bi ${TOAST_ICONS[type] || TOAST_ICONS.info}" aria-hidden="true"></i><div>${message}</div>`;
    toastRoot.appendChild(el);
    const close = () => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 220);
    };
    const t = setTimeout(close, timeout);
    el.addEventListener('click', () => {
      clearTimeout(t);
      close();
    });
  }

  /* ---------- Modal ---------- */
  function setContent(el, content) {
    if (content == null) return;
    if (content instanceof Node) {
      el.innerHTML = '';
      el.appendChild(content);
    } else {
      el.innerHTML = String(content);
    }
  }

  /**
   * Abre um modal. Retorna { el, body, foot, close }.
   * body/footer aceitam html`` ou um Node.
   */
  function modal({ title, body, footer, size = 'md', onClose, dismissible = true, className = '' }) {
    const dlg = document.createElement('dialog');
    dlg.className = `modal ${size !== 'md' ? `modal-${size}` : ''} ${className}`;
    dlg.innerHTML = html`
      <div class="modal-head">
        <h2>${title}</h2>
        <button type="button" class="btn btn-ghost btn-icon btn-sm" data-close aria-label="Fechar"><i class="bi bi-x-lg"></i></button>
      </div>
      <div class="modal-body"></div>
      ${footer ? raw('<div class="modal-foot"></div>') : ''}`;
    const bodyEl = dlg.querySelector('.modal-body');
    const footEl = dlg.querySelector('.modal-foot');
    setContent(bodyEl, body);
    if (footEl) setContent(footEl, footer);
    document.body.appendChild(dlg);

    let downOnBackdrop = false;
    const close = () => {
      if (dlg.open) dlg.close();
    };
    dlg.addEventListener('mousedown', (e) => (downOnBackdrop = e.target === dlg));
    dlg.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) close();
      else if (dismissible && downOnBackdrop && e.target === dlg) close();
    });
    dlg.addEventListener('cancel', (e) => {
      if (!dismissible) e.preventDefault();
    });
    dlg.addEventListener('close', () => {
      dlg.remove();
      if (onClose) onClose();
    });
    dlg.showModal();
    const firstField = bodyEl.querySelector('input:not([type=hidden]):not([readonly]), select, textarea');
    if (firstField && size !== 'sm') firstField.focus();
    return { el: dlg, body: bodyEl, foot: footEl, close };
  }

  /** Confirmação própria (alert/confirm nativos são bloqueados em alguns ambientes) */
  function confirm({ title = 'Confirmar', message = '', confirmText = 'Confirmar', cancelText = 'Voltar', danger = false } = {}) {
    return new Promise((resolve) => {
      let result = false;
      const m = modal({
        title,
        size: 'sm',
        body: html`<p class="muted">${message}</p>`,
        footer: html`<button type="button" class="btn btn-ghost" data-close>${cancelText}</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${confirmText}</button>`,
        onClose: () => resolve(result),
      });
      const ok = m.el.querySelector('[data-ok]');
      ok.addEventListener('click', () => {
        result = true;
        m.close();
      });
      ok.focus();
    });
  }

  /* ---------- Menus suspensos (delegação global) ---------- */
  function closeDropdowns(except) {
    $$('.dropdown.open').forEach((d) => {
      if (d !== except) {
        d.classList.remove('open');
        const t = d.querySelector('[data-dropdown]');
        if (t) t.setAttribute('aria-expanded', 'false');
      }
    });
  }
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-dropdown]');
    if (trigger) {
      const dd = trigger.closest('.dropdown');
      const open = !dd.classList.contains('open');
      closeDropdowns(dd);
      dd.classList.toggle('open', open);
      trigger.setAttribute('aria-expanded', String(open));
      return;
    }
    if (!e.target.closest('.dropdown-menu')) closeDropdowns();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDropdowns();
  });

  /* ---------- Abas ---------- */
  function tabs(root, onChange) {
    const buttons = $$('[role="tab"]', root);
    const select = (btn, focus = false) => {
      buttons.forEach((b) => {
        const on = b === btn;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(b.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (focus) btn.focus();
      if (onChange) onChange(btn.dataset.tab || btn.id);
    };
    buttons.forEach((b, i) => {
      b.addEventListener('click', () => select(b));
      b.addEventListener('keydown', (e) => {
        const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (dir) select(buttons[(i + dir + buttons.length) % buttons.length], true);
      });
    });
    const initial = buttons.find((b) => location.hash && b.dataset.tab === location.hash.slice(1)) ||
      buttons.find((b) => b.getAttribute('aria-selected') === 'true') || buttons[0];
    if (initial) select(initial);
    return { select: (name) => select(buttons.find((b) => b.dataset.tab === name) || buttons[0]) };
  }

  /* ---------- Formulários ---------- */
  function formData(form) {
    const out = {};
    new FormData(form).forEach((v, k) => {
      const val = typeof v === 'string' ? v.trim() : v;
      if (k in out) out[k] = [].concat(out[k], val);
      else out[k] = val;
    });
    return out;
  }
  function setError(input, message) {
    const field = input.closest('.field');
    if (!field) return;
    field.classList.add('invalid');
    let e = field.querySelector('.error-text');
    if (!e) {
      e = document.createElement('div');
      e.className = 'error-text';
      field.appendChild(e);
    }
    e.textContent = message;
    input.setAttribute('aria-invalid', 'true');
  }
  function clearErrors(form) {
    $$('.field.invalid', form).forEach((f) => f.classList.remove('invalid'));
    $$('[aria-invalid]', form).forEach((i) => i.removeAttribute('aria-invalid'));
  }
  /**
   * Valida campos: rules = { nomeDoCampo: (valor, dados) => 'mensagem de erro' | null }
   * Retorna os dados se estiver tudo certo, ou null (e foca o primeiro erro).
   */
  function validate(form, rules = {}) {
    clearErrors(form);
    const data = formData(form);
    let first = null;
    Object.entries(rules).forEach(([name, rule]) => {
      const msg = rule(data[name] ?? '', data);
      if (msg) {
        const input = form.elements[name];
        const el = input && (input instanceof RadioNodeList ? input[0] : input);
        if (el) {
          setError(el, msg);
          first = first || el;
        }
      }
    });
    if (first) {
      first.focus();
      return null;
    }
    return data;
  }
  const rules = {
    required: (label) => (v) => (String(v).trim() ? null : `Informe ${label}.`),
    email: (v) => (U.validEmail(v) ? null : 'Digite um e-mail válido, como nome@email.com.'),
    phone: (v) => (U.validPhone(v) ? null : 'Digite o telefone com DDD, como (16) 98765-4321.'),
    password: (v) => (String(v).length >= 6 ? null : 'A senha precisa ter pelo menos 6 caracteres.'),
  };

  function maskPhone(input) {
    if (!input) return;
    input.addEventListener('input', () => {
      input.value = U.fmtPhone(input.value);
    });
  }

  /** Mostrar/ocultar senha: <button data-toggle-password> ao lado do input */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-toggle-password]');
    if (!btn) return;
    const input = btn.parentElement.querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.innerHTML = `<i class="bi ${show ? 'bi-eye-slash' : 'bi-eye'}"></i>`;
    btn.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
  });

  function busy(button, on) {
    if (!button) return;
    button.classList.toggle('is-loading', on);
    button.disabled = on;
  }

  /* ---------- Pequenos componentes de marcação ---------- */
  const statusBadge = (status) => {
    const s = App.booking.STATUS[status] || { label: status, icon: 'bi-circle' };
    return html`<span class="badge badge-${status}"><i class="bi ${s.icon}" aria-hidden="true"></i>${s.label}</span>`;
  };
  const avatar = (name, { color, size = '', photo } = {}) =>
    html`<span class="avatar ${size ? `avatar-${size}` : ''}" style="${color ? `--av-bg:${color};--av-fg:#fff` : ''}" aria-hidden="true">${
      photo ? html`<img src="${photo}" alt="">` : U.initials(name)
    }</span>`;
  const stars = (rating) =>
    html`<span class="stars" role="img" aria-label="${rating} de 5 estrelas">${[1, 2, 3, 4, 5].map(
      (i) => html`<i class="bi ${i <= Math.round(rating) ? 'bi-star-fill' : 'bi-star'}"></i>`
    )}</span>`;
  const empty = (icon, title, text = '', action = '') =>
    html`<div class="empty"><i class="bi ${icon}" aria-hidden="true"></i><strong>${title}</strong>${text ? html`<p>${text}</p>` : ''}${action}</div>`;

  /* ---------- Identidade visual (nome, cor, fonte, logo, contatos) ---------- */
  function bindings(s) {
    const a = s.address || {};
    return {
      name: s.name,
      slogan: s.slogan,
      about: s.about,
      phone: s.phone,
      whatsapp: s.whatsapp,
      email: s.email,
      instagram: s.instagram ? `@${String(s.instagram).replace(/^@/, '')}` : '',
      street: a.street,
      district: a.district,
      city: [a.city, a.state].filter(Boolean).join(' - '),
      cep: a.cep ? `CEP ${a.cep}` : '',
      address: [a.street, a.district].filter(Boolean).join(' · '),
      fullAddress: [a.street, a.district, [a.city, a.state].filter(Boolean).join(' - ')].filter(Boolean).join(', '),
      year: String(new Date().getFullYear()),
      loyalty: String(s.loyaltyTarget || 10),
      cancelLimit: String(s.cancelLimit ?? 2),
      founded: String(s.foundedYear || ''),
      years: s.foundedYear ? String(Math.max(1, new Date().getFullYear() - s.foundedYear)) : '',
    };
  }
  function links(s) {
    const b = bindings(s);
    return {
      whatsapp: (el) => U.waLink(s.whatsapp, el.dataset.waText || `Olá! Vim pelo site da ${s.name} e gostaria de agendar um horário.`),
      tel: () => `tel:+${U.waNumber(s.phone)}`,
      mail: () => `mailto:${s.email}`,
      instagram: () => `https://instagram.com/${String(s.instagram || '').replace(/^@/, '')}`,
      maps: () => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.fullAddress)}`,
    };
  }

  function applyBranding() {
    const s = App.db.settings();
    const root = document.documentElement;
    const color = /^#[0-9a-f]{6}$/i.test(s.primaryColor || '') ? s.primaryColor : '#111827';
    root.style.setProperty('--primary', color);
    root.style.setProperty('--primary-ink', U.luminance(color) > 0.5 ? '#111827' : '#ffffff');
    root.dataset.font = s.fontStyle || 'classico';

    const b = bindings(s);
    $$('[data-bind]').forEach((el) => {
      const v = b[el.dataset.bind];
      if (v != null) el.textContent = v;
    });
    const l = links(s);
    $$('[data-link]').forEach((el) => {
      const fn = l[el.dataset.link];
      if (fn) el.setAttribute('href', fn(el));
    });
    const logo = s.logo || U.path('assets/img/logo.png');
    $$('img[data-logo]').forEach((img) => {
      if (img.getAttribute('src') !== logo) img.src = logo;
    });
    const icon = $('link[rel="icon"]');
    if (icon && s.logo) icon.href = s.logo;
    $$('[data-hero-image]').forEach((el) => {
      el.style.backgroundImage = s.heroImage ? `url("${s.heroImage}")` : '';
    });
    const page = document.body.dataset.title;
    document.title = page ? `${page} · ${s.name}` : s.name;
  }

  /* ---------- Mensagem para a próxima página (ex.: depois de um redirecionamento) ---------- */
  const FLASH_KEY = 'barbearia:flash';
  function flash(message, type = 'success') {
    try { window.sessionStorage.setItem(FLASH_KEY, JSON.stringify({ message, type })); } catch (e) { /* ignora */ }
  }
  function showFlash() {
    try {
      const f = JSON.parse(window.sessionStorage.getItem(FLASH_KEY) || 'null');
      if (f) {
        window.sessionStorage.removeItem(FLASH_KEY);
        toast(f.message, f.type);
      }
    } catch (e) { /* ignora */ }
  }
  setTimeout(showFlash, 50);

  /* ---------- Pix do sinal (QR + copia e cola) ---------- */
  let qrLib = null;
  function loadQR() {
    if (window.qrcode) return Promise.resolve();
    if (!qrLib) {
      qrLib = new Promise((resolve, reject) => {
        const sc = document.createElement('script');
        sc.src = `${(window.FORBARBER && window.FORBARBER.appRoot) || ''}assets/vendor/qrcode/qrcode.js`;
        sc.onload = resolve;
        sc.onerror = reject;
        document.head.appendChild(sc);
      });
    }
    return qrLib;
  }
  /** Desenha os QR Codes pendentes da página ([data-qr]) */
  function renderQRs(root = document) {
    const els = $$('[data-qr]:not([data-qr-done])', root);
    if (!els.length) return;
    loadQR().then(() => {
      els.forEach((el) => {
        const q = window.qrcode(0, 'M');
        q.addData(el.dataset.qr);
        q.make();
        el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
        el.dataset.qrDone = '1';
      });
    }).catch(() => { $$('[data-qr]', root).forEach((el) => { el.hidden = true; }); });
  }
  function pixPayloadFor(a) {
    const s = App.db.settings();
    return App.booking.pixPayload({
      key: s.pixKey,
      name: s.pixName || s.name,
      city: s.pixCity || (s.address && s.address.city) || 'Brasil',
      amount: a.depositAmount,
      txid: `FB${String(a.id).replace(/[^A-Za-z0-9]/g, '').slice(-20)}`,
    });
  }
  /** Caixa com QR e código copia e cola do sinal de um agendamento */
  function pixBox(a) {
    const s = App.db.settings();
    const payload = pixPayloadFor(a);
    const msg = `Olá! Paguei o sinal de ${U.money(a.depositAmount)} do meu horário de ${U.fmtDateLong(a.date)} às ${a.start}. Segue o comprovante.`;
    return html`
      <div class="pix-box">
        <div class="pix-qr" data-qr="${payload}" role="img" aria-label="QR Code do Pix"></div>
        <div class="pix-body">
          <strong>Sinal de ${U.money(a.depositAmount)} por Pix</strong>
          <p class="text-sm muted">Abra o app do seu banco em Pix, leia o QR Code ou use o copia e cola. O valor é descontado no dia do atendimento.</p>
          <div class="pix-code">
            <input class="input input-sm" readonly value="${payload}" aria-label="Código Pix copia e cola">
            <button type="button" class="btn btn-outline btn-sm" data-copy-pix><i class="bi bi-copy"></i>Copiar</button>
          </div>
          ${s.whatsapp ? html`<a class="btn btn-whatsapp btn-sm" href="${U.waLink(s.whatsapp, msg)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i>Enviar comprovante</a>` : ''}
        </div>
      </div>`;
  }
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy-pix]');
    if (!btn) return;
    const input = btn.parentElement.querySelector('input');
    toast((await U.copyText(input.value)) ? 'Código Pix copiado.' : 'Selecione o código e copie.', 'info');
  });

  App.ui = {
    pixBox, renderQRs,
    toast, modal, confirm, tabs, closeDropdowns, flash,
    formData, validate, rules, setError, clearErrors, maskPhone, busy,
    statusBadge, avatar, stars, empty,
    applyBranding, bindings, links,
  };
})();
