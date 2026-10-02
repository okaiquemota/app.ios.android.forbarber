/* ==========================================================================
   UTILITÁRIOS — funções puras usadas em todo o projeto (window.App.utils)
   Scripts "clássicos" (sem módulos ES) para o site funcionar até abrindo o
   arquivo direto no navegador (file://).
   ========================================================================== */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  /* ---------- DOM ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- HTML seguro ----------
     html`<p>${nome}</p>` escapa tudo que é interpolado (evita XSS).
     Use raw() só para trechos já confiáveis (ex.: outro html``). */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  class SafeHTML {
    constructor(s) { this.s = s; }
    toString() { return this.s; }
  }
  const raw = (s) => new SafeHTML(String(s ?? ''));
  const renderValue = (v) => {
    if (v == null || v === false) return '';
    if (v instanceof SafeHTML) return v.s;
    if (Array.isArray(v)) return v.map(renderValue).join('');
    return esc(v);
  };
  function html(strings, ...values) {
    let out = strings[0];
    for (let i = 0; i < values.length; i++) out += renderValue(values[i]) + strings[i + 1];
    return new SafeHTML(out);
  }

  /* ---------- Números e dinheiro ---------- */
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const money = (n) => BRL.format(Number(n) || 0);
  const number = (n, digits = 0) =>
    Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const compactMoney = (n) => {
    const v = Number(n) || 0;
    if (Math.abs(v) >= 1000) return 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
    return 'R$ ' + v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  };
  const percent = (n, digits = 0) => number(n * 100, digits) + '%';
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const sum = (arr, fn = (x) => x) => arr.reduce((acc, x) => acc + (Number(fn(x)) || 0), 0);
  const groupBy = (arr, fn) =>
    arr.reduce((acc, x) => {
      const k = fn(x);
      (acc[k] = acc[k] || []).push(x);
      return acc;
    }, {});
  const sortBy = (arr, fn, dir = 1) =>
    [...arr].sort((a, b) => {
      const x = fn(a), y = fn(b);
      if (x < y) return -1 * dir;
      if (x > y) return 1 * dir;
      return 0;
    });

  /* ---------- Datas (sempre no fuso local; datas como 'AAAA-MM-DD') ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDate = (iso) => {
    const [y, m, d] = String(iso).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  };
  const today = () => toISODate(new Date());
  const addDays = (iso, n) => {
    const d = parseDate(iso);
    d.setDate(d.getDate() + n);
    return toISODate(d);
  };
  const diffDays = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
  const weekday = (iso) => parseDate(iso).getDay();
  const startOfMonth = (iso) => iso.slice(0, 8) + '01';
  const endOfMonth = (iso) => {
    const d = parseDate(startOfMonth(iso));
    d.setMonth(d.getMonth() + 1, 0);
    return toISODate(d);
  };
  const addMonths = (iso, n) => {
    const d = parseDate(startOfMonth(iso));
    d.setMonth(d.getMonth() + n);
    return toISODate(d);
  };
  const startOfWeek = (iso) => addDays(iso, -weekday(iso)); // domingo

  const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  const fmtDate = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  };
  const fmtDateShort = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
  const fmtDateLong = (iso, withYear = false) => {
    const d = parseDate(iso);
    const base = `${WEEKDAYS[d.getDay()].toLowerCase()}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
    return withYear ? `${base} de ${d.getFullYear()}` : base;
  };
  const fmtDateMedium = (iso) => {
    const d = parseDate(iso);
    return `${WEEKDAYS_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  };
  /** 'Hoje', 'Amanhã', 'Ontem' ou 'sex, 02/10' */
  const fmtDateHuman = (iso) => {
    const diff = diffDays(today(), iso);
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Amanhã';
    if (diff === -1) return 'Ontem';
    return `${WEEKDAYS_SHORT[weekday(iso)].toLowerCase()}, ${fmtDateShort(iso)}`;
  };
  const monthLabel = (iso) => {
    const d = parseDate(iso);
    return `${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
  };
  const toMin = (hhmm) => {
    const [h, m] = String(hhmm || '0:0').split(':').map(Number);
    return h * 60 + (m || 0);
  };
  const fromMin = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
  const nowMin = () => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  };
  const fmtDuration = (min) => {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h}h${pad(m)}` : `${h}h`;
  };
  const nowISO = () => new Date().toISOString();
  const fmtDateTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const relTime = (ts) => {
    const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return 'agora mesmo';
    const m = Math.round(s / 60);
    if (m < 60) return `há ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.round(h / 24);
    if (d < 30) return d === 1 ? 'ontem' : `há ${d} dias`;
    return fmtDate(toISODate(new Date(ts)));
  };
  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  /* ---------- Texto ---------- */
  const normalize = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  const initials = (name) => {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const first = parts[0][0];
    const last = parts.length > 1 ? parts[parts.length - 1][0] : parts[0][1] || '';
    return (first + last).toUpperCase();
  };
  const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';
  const plural = (n, one, many) => `${number(n)} ${n === 1 ? one : many}`;

  /* ---------- Telefone e WhatsApp ---------- */
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const fmtPhone = (s) => {
    const d = digits(s).slice(0, 11);
    if (d.length <= 2) return d ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };
  const validPhone = (s) => [10, 11].includes(digits(s).length);
  const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());
  const waNumber = (phone) => {
    const d = digits(phone);
    return d.length === 10 || d.length === 11 ? '55' + d : d;
  };
  const waLink = (phone, text = '') =>
    `https://wa.me/${waNumber(phone)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

  /* ---------- IDs e aleatoriedade ---------- */
  const uid = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  /** Gerador pseudoaleatório com semente (mulberry32) — dados de demo reproduzíveis */
  const seededRandom = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const hashCode = (s) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return h >>> 0;
  };

  /* ---------- SHA-256 (senhas nunca ficam em texto puro) ---------- */
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  function sha256(message) {
    const bytes = new TextEncoder().encode(String(message));
    const len = bytes.length;
    const total = ((len + 9 + 63) >> 6) << 6;
    const buf = new Uint8Array(total);
    buf.set(bytes);
    buf[len] = 0x80;
    const view = new DataView(buf.buffer);
    const bits = len * 8;
    view.setUint32(total - 8, Math.floor(bits / 0x100000000));
    view.setUint32(total - 4, bits >>> 0);
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const W = new Uint32Array(64);
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
        const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
        const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    return H.map((x) => x.toString(16).padStart(8, '0')).join('');
  }

  /* ---------- Navegador ---------- */
  const qs = (name) => new URLSearchParams(location.search).get(name);
  const debounce = (fn, ms = 200) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };
  /** Caminho relativo à raiz do site (páginas do painel ficam em /painel) */
  const path = (p = '') => (document.documentElement.dataset.base || '') + p;

  function download(filename, content, mime = 'text/plain;charset=utf-8') {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** CSV com ";" (padrão do Excel em pt-BR) e BOM para acentuação correta */
  function toCSV(rows, columns) {
    const cell = (v) => {
      const s = String(v ?? '');
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = columns.map((c) => cell(c.label)).join(';');
    const body = rows.map((r) => columns.map((c) => cell(c.value(r))).join(';')).join('\n');
    return '﻿' + head + '\n' + body;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  /** Lê uma imagem enviada, redimensiona no canvas e devolve um data URL leve */
  function readImage(file, maxSize = 512, type = 'image/png', quality = 0.85) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Envie um arquivo de imagem (PNG, JPG ou WEBP).'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Imagem inválida.'));
        img.onload = () => {
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL(type, quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /** Arquivo .ics para adicionar o horário à agenda do celular */
  function icsEvent({ title, description, location, date, start, duration }) {
    const dt = (iso, hhmm) => iso.replace(/-/g, '') + 'T' + hhmm.replace(':', '') + '00';
    const end = fromMin(toMin(start) + duration);
    const clean = (s) => String(s || '').replace(/[,;]/g, ' ').replace(/\n/g, '\\n');
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Barbearia//Agendamento//PT-BR',
      'BEGIN:VEVENT',
      `UID:${uid('evt')}@barbearia`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `DTSTART:${dt(date, start)}`,
      `DTEND:${dt(date, end)}`,
      `SUMMARY:${clean(title)}`,
      `DESCRIPTION:${clean(description)}`,
      `LOCATION:${clean(location)}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      'DESCRIPTION:Lembrete do seu horário',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  }

  /** Luminância relativa (WCAG) para escolher texto claro/escuro sobre uma cor */
  function luminance(hex) {
    const h = String(hex).replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  App.utils = {
    $, $$, esc, html, raw, SafeHTML,
    money, number, compactMoney, percent, clamp, sum, groupBy, sortBy,
    pad, toISODate, parseDate, today, addDays, diffDays, weekday, startOfMonth, endOfMonth, addMonths, startOfWeek,
    WEEKDAYS, WEEKDAYS_SHORT, MONTHS, MONTHS_SHORT,
    fmtDate, fmtDateShort, fmtDateLong, fmtDateMedium, fmtDateHuman, monthLabel,
    toMin, fromMin, nowMin, fmtDuration, nowISO, fmtDateTime, relTime, greeting,
    normalize, initials, firstName, plural,
    digits, fmtPhone, validPhone, validEmail, waNumber, waLink,
    uid, seededRandom, hashCode, sha256,
    qs, debounce, path, download, toCSV, copyText, readImage, icsEvent, luminance,
  };
})();
