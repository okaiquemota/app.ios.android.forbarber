/* ==========================================================================
   MOTOR DE AGENDAMENTO (window.App.booking)
   Calcula horários livres a partir do expediente, dos dias de trabalho de
   cada profissional, dos agendamentos existentes e dos bloqueios de agenda.
   Usado tanto pelo agendamento online quanto pelo painel.
   ========================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const U = App.utils;
  const db = App.db;

  const STATUS = {
    confirmado: { label: 'Confirmado', icon: 'bi-calendar-check' },
    concluido: { label: 'Concluído', icon: 'bi-check2-circle' },
    cancelado: { label: 'Cancelado', icon: 'bi-x-circle' },
    faltou: { label: 'Não compareceu', icon: 'bi-person-x' },
  };
  const PAYMENTS = {
    pix: { label: 'Pix', icon: 'bi-qr-code' },
    credito: { label: 'Crédito', icon: 'bi-credit-card' },
    debito: { label: 'Débito', icon: 'bi-credit-card-2-front' },
    dinheiro: { label: 'Dinheiro', icon: 'bi-cash-stack' },
  };
  const SOURCES = { site: 'Site', painel: 'Painel', whatsapp: 'WhatsApp' };

  /** Expediente do dia em minutos, ou null se fechado */
  function dayHours(date) {
    const h = db.settings().hours[U.weekday(date)];
    if (!h || h.closed) return null;
    return { open: U.toMin(h.open), close: U.toMin(h.close) };
  }

  function barberWorks(barber, date) {
    return !!barber && barber.active !== false && barber.workDays.includes(U.weekday(date)) && !!dayHours(date);
  }

  /** Intervalos ocupados [início, fim, item] de um profissional num dia */
  function busy(barberId, date, ignoreId) {
    const list = [];
    db.appointments({ date, barberId }).forEach((a) => {
      if (a.id === ignoreId || a.status === 'cancelado' || a.status === 'faltou') return;
      const s = U.toMin(a.start);
      list.push([s, s + a.duration, a]);
    });
    db.blocks({ date, barberId }).forEach((b) => list.push([U.toMin(b.start), U.toMin(b.end), b]));
    return list;
  }

  /** Retorna o agendamento/bloqueio que conflita com o intervalo, ou null */
  function conflict({ barberId, date, start, duration, ignoreId }) {
    const s = U.toMin(start);
    const e = s + duration;
    const hit = busy(barberId, date, ignoreId).find(([bs, be]) => s < be && e > bs);
    return hit ? hit[2] : null;
  }

  /** Primeiro minuto em que um cliente ainda pode marcar naquele dia */
  function earliestStart(date) {
    const t = U.today();
    if (date < t) return Infinity;
    if (date > t) return 0;
    return U.nowMin() + (Number(db.settings().minAdvance) || 0);
  }

  /** Grade de horários de um profissional: [{ time, available }] */
  function slots({ date, barberId, duration, ignoreId, forStaff = false }) {
    const barber = db.barber(barberId);
    const hours = dayHours(date);
    if (!hours || !barberWorks(barber, date)) return [];
    const step = Number(db.settings().slotInterval) || 30;
    const min = forStaff ? -Infinity : earliestStart(date);
    const taken = busy(barberId, date, ignoreId);
    const out = [];
    for (let t = hours.open; t + duration <= hours.close; t += step) {
      const free = t >= min && !taken.some(([s, e]) => t < e && t + duration > s);
      out.push({ time: U.fromMin(t), available: free, barberIds: free ? [barberId] : [] });
    }
    return out;
  }

  /** "Sem preferência": horário livre se ao menos um profissional estiver livre */
  function slotsAny({ date, duration, ignoreId }) {
    const map = new Map();
    db.barbers({ active: true }).forEach((b) => {
      slots({ date, barberId: b.id, duration, ignoreId }).forEach((s) => {
        const cur = map.get(s.time) || { time: s.time, available: false, barberIds: [] };
        if (s.available) {
          cur.available = true;
          cur.barberIds.push(b.id);
        }
        map.set(s.time, cur);
      });
    });
    return [...map.values()].sort((a, b) => U.toMin(a.time) - U.toMin(b.time));
  }

  /** Escolhe o profissional livre com menos atendimentos no dia (equilibra a agenda) */
  function pickBarber({ date, time, duration, barberIds }) {
    const ids = barberIds || db.barbers({ active: true }).map((b) => b.id);
    const free = ids.filter((id) => barberWorks(db.barber(id), date) && !conflict({ barberId: id, date, start: time, duration }));
    const load = (id) => db.appointments({ date, barberId: id, active: true }).length;
    free.sort((a, b) => load(a) - load(b));
    return free[0] || null;
  }

  /** Próximo horário livre a partir de hoje */
  function nextAvailable({ duration, barberId = null, maxDays } = {}) {
    const limit = maxDays ?? (Number(db.settings().bookingWindow) || 30);
    const t = U.today();
    for (let i = 0; i <= limit; i++) {
      const date = U.addDays(t, i);
      const list = barberId ? slots({ date, barberId, duration }) : slotsAny({ date, duration });
      const first = list.find((s) => s.available);
      if (first) {
        return {
          date,
          time: first.time,
          barberId: barberId || pickBarber({ date, time: first.time, duration, barberIds: first.barberIds }),
        };
      }
    }
    return null;
  }

  /** Situação da barbearia agora: aberta (fecha às...) ou fechada (abre em...) */
  function openStatus(now = new Date()) {
    const date = U.toISODate(now);
    const m = now.getHours() * 60 + now.getMinutes();
    const h = dayHours(date);
    if (h && m >= h.open && m < h.close) return { open: true, closesAt: U.fromMin(h.close) };
    for (let i = 0; i < 8; i++) {
      const d = U.addDays(date, i);
      const hh = dayHours(d);
      if (!hh || (i === 0 && m >= hh.open)) continue;
      return { open: false, date: d, opensAt: U.fromMin(hh.open) };
    }
    return { open: false };
  }

  /** O cliente pode cancelar sozinho até X horas antes */
  function canClientCancel(appt) {
    if (appt.status !== 'confirmado') return false;
    const start = U.parseDate(appt.date);
    start.setHours(0, U.toMin(appt.start), 0, 0);
    const limitH = Number(db.settings().cancelLimit) || 0;
    return start.getTime() - Date.now() >= limitH * 3600000;
  }

  /* ==========================================================================
     CLUBE DE ASSINATURA — planos mensais com usos por período.
     Um agendamento "usa o plano" quando tem serviços incluídos e ainda há
     usos no período: esses serviços saem de graça e o resto ganha desconto.
     ========================================================================== */
  const ACTIVE_APPT = ['confirmado', 'concluido'];
  /** Mesmo dia do mês seguinte (31/01 -> 28/02) */
  const plusMonth = (iso) => {
    const d = U.parseDate(iso);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    return U.toISODate(d);
  };
  const club = {
    plans: ({ active } = {}) => db.list('plans').filter((p) => (active ? p.active !== false : true))
      .sort((a, b) => (a.position || 0) - (b.position || 0) || a.price - b.price),
    plan: (id) => db.get('plans', id),
    /** Assinatura mais recente que não foi cancelada */
    subscriptionOf(clientId) {
      return db.list('subscriptions')
        .filter((x) => x.clientId === clientId && x.status !== 'cancelada')
        .sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1))[0] || null;
    },
    /** ativa | vencida | pausada | cancelada */
    state(sub) {
      if (!sub) return null;
      if (sub.status === 'cancelada' || sub.status === 'pausada') return sub.status;
      return sub.periodEnd >= U.today() ? 'ativa' : 'vencida';
    },
    usage(sub, ignoreId) {
      return db.appointments({ clientId: sub.clientId, from: sub.periodStart, to: sub.periodEnd })
        .filter((a) => a.subscriptionId === sub.id && a.id !== ignoreId && ACTIVE_APPT.includes(a.status)).length;
    },
    usesLeft(sub, ignoreId) {
      const plan = club.plan(sub.planId);
      if (!plan) return 0;
      return plan.usesPerPeriod ? Math.max(0, plan.usesPerPeriod - club.usage(sub, ignoreId)) : Infinity;
    },
    /** O que o plano cobre neste agendamento */
    coverage({ clientId, serviceIds, date, ignoreId }) {
      const none = { applies: false, coveredIds: [], discountPct: 0, sub: null, plan: null, usesLeft: 0 };
      const sub = clientId ? club.subscriptionOf(clientId) : null;
      if (!sub || club.state(sub) !== 'ativa' || date < sub.periodStart || date > sub.periodEnd) return { ...none, sub };
      const plan = club.plan(sub.planId);
      if (!plan) return none;
      const left = club.usesLeft(sub, ignoreId);
      const coveredIds = left > 0 ? serviceIds.filter((id) => (plan.serviceIds || []).includes(id)) : [];
      const discountPct = Number(plan.discountOthers) || 0;
      return { applies: coveredIds.length > 0 || discountPct > 0, coveredIds, discountPct, sub, plan, usesLeft: left };
    },
    /** Preço final dos itens com a cobertura do plano; clubValue é a referência para comissão */
    price(items, cov) {
      let total = 0;
      let clubValue = 0;
      items.forEach((s) => {
        if (cov && cov.coveredIds.includes(s.id)) clubValue += s.price;
        else total += s.price * (1 - ((cov && cov.discountPct) || 0) / 100);
      });
      return { total: Math.round(total * 100) / 100, clubValue };
    },
    mrr: () => U.sum(db.list('subscriptions').filter((x) => club.state(x) === 'ativa'), (x) => (club.plan(x.planId) || { price: 0 }).price),
    /** Próximo período: continua do fim do atual, ou começa hoje se já venceu */
    nextPeriod(sub) {
      const t = U.today();
      const start = sub && sub.periodEnd >= t ? U.addDays(sub.periodEnd, 1) : t;
      return { start, end: U.addDays(plusMonth(start), -1) };
    },
    subscribe(clientId, planId, { paid = true, method = 'pix' } = {}) {
      const plan = club.plan(planId);
      const t = U.today();
      const end = U.addDays(plusMonth(t), -1);
      const old = club.subscriptionOf(clientId);
      if (old) db.update('subscriptions', old.id, { status: 'cancelada' });
      const sub = db.insert('subscriptions', { clientId, planId, status: 'ativa', startedAt: t, periodStart: t, periodEnd: end, notes: '' });
      if (paid) db.insert('subPayments', { subscriptionId: sub.id, clientId, amount: plan.price, method, paidAt: U.nowISO(), periodStart: t, periodEnd: end });
      return sub;
    },
    /** Registra a mensalidade paga e renova o período */
    registerPayment(subId, { amount, method = 'pix' } = {}) {
      const sub = db.get('subscriptions', subId);
      const plan = club.plan(sub.planId);
      const { start, end } = club.nextPeriod(sub);
      db.insert('subPayments', { subscriptionId: sub.id, clientId: sub.clientId, amount: amount == null ? plan.price : Number(amount), method, paidAt: U.nowISO(), periodStart: start, periodEnd: end });
      return db.update('subscriptions', sub.id, { status: 'ativa', periodStart: start, periodEnd: end });
    },
    /** Linhas de "o que inclui" para mostrar o plano */
    features(plan) {
      const names = (plan.serviceIds || []).map((id) => db.service(id)).filter(Boolean).map((x) => x.name);
      return [
        plan.usesPerPeriod ? `Até ${plan.usesPerPeriod} ${plan.usesPerPeriod === 1 ? 'visita' : 'visitas'} por mês` : 'Visitas ilimitadas no mês',
        names.length ? `Incluso: ${names.join(', ')}` : '',
        Number(plan.discountOthers) ? `${Number(plan.discountOthers)}% de desconto nos outros serviços` : '',
      ].filter(Boolean);
    },
    payments: (subId) => db.list('subPayments').filter((x) => !subId || x.subscriptionId === subId).sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1)),
  };

  /* ==========================================================================
     SINAL (pagamento antecipado por Pix) — segura o horário e reduz faltas.
     ========================================================================== */
  const deposit = {
    /** Valor do sinal para este cliente e total (0 = não cobra) */
    amountFor({ clientId, total }) {
      const s = db.settings();
      if (!s.depositEnabled || !s.pixKey || !(total > 0)) return 0;
      if (s.depositScope === 'novos_e_faltosos' && clientId) {
        const st = db.clientStats(clientId);
        if (st.visits > 0 && st.noShows === 0) return 0;
      }
      const v = Number(s.depositValue) || 0;
      const amount = s.depositMode === 'fixo' ? Math.min(v, total) : (total * v) / 100;
      return Math.round(amount * 100) / 100;
    },
    /** Quanto falta pagar na hora do atendimento */
    remaining: (a) => Math.max(0, Math.round(((a.total || 0) - (a.depositStatus === 'pago' ? a.depositAmount || 0 : 0)) * 100) / 100),
  };

  /** Código Pix "copia e cola" (BR Code estático com valor), padrão do Banco Central */
  function pixPayload({ key, name, city, amount, txid = '***' }) {
    const clean = (v, max) => U.normalize(String(v || '')).toUpperCase().replace(/[^A-Z0-9 .-]/g, '').slice(0, max) || 'NA';
    const f = (id, v) => `${id}${String(v.length).padStart(2, '0')}${v}`;
    const acc = f('00', 'br.gov.bcb.pix') + f('01', String(key).trim());
    let p = f('00', '01') + f('26', acc) + f('52', '0000') + f('53', '986');
    if (amount > 0) p += f('54', Number(amount).toFixed(2));
    p += f('58', 'BR') + f('59', clean(name, 25)) + f('60', clean(city, 15));
    p += f('62', f('05', String(txid).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***'));
    p += '6304';
    let crc = 0xffff;
    for (let i = 0; i < p.length; i++) {
      crc ^= p.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return p + crc.toString(16).toUpperCase().padStart(4, '0');
  }

  /* ==========================================================================
     LISTA DE ESPERA — quem não achou horário entra na fila daquele dia.
     ========================================================================== */
  const PERIODS = {
    qualquer: { label: 'Qualquer horário', from: 0, to: 24 * 60 },
    manha: { label: 'Manhã', from: 0, to: 12 * 60 },
    tarde: { label: 'Tarde', from: 12 * 60, to: 18 * 60 },
    noite: { label: 'Noite', from: 18 * 60, to: 24 * 60 },
  };
  const waitlist = {
    PERIODS,
    entries: ({ status, date, from } = {}) => db.list('waitlist')
      .filter((w) => (!status || [].concat(status).includes(w.status)) && (!date || w.date === date) && (!from || w.date >= from))
      .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? -1 : 1) : a.date < b.date ? -1 : 1)),
    open: () => waitlist.entries({ status: ['aguardando', 'avisado'], from: U.today() }),
    duration: (w) => U.sum((w.serviceIds || []).map((id) => db.service(id)).filter(Boolean), (x) => x.duration) || 30,
    /** Cliente entra na lista (na nuvem passa por uma função do servidor) */
    async join({ clientId, date, period, serviceIds, barberId, notes }) {
      const staff = App.auth.isStaff(App.auth.current());
      if (db.isCloud() && !staff) {
        await App.cloud.rpc('join_waitlist', { p_shop: App.cloud.shop().id, p_date: date, p_period: period, p_service_ids: serviceIds, p_barber: barberId || null, p_notes: notes || '' });
        return App.cloud.reload();
      }
      return db.insert('waitlist', { clientId, date, period, serviceIds, barberId: barberId || null, notes: notes || '', status: 'aguardando' });
    },
    async leave(id) {
      const staff = App.auth.isStaff(App.auth.current());
      if (db.isCloud() && !staff) {
        await App.cloud.rpc('leave_waitlist', { p_id: id });
        return App.cloud.reload();
      }
      return db.update('waitlist', id, { status: 'cancelado' });
    },
    /** Horários livres hoje que servem para a pessoa da fila */
    freeSlots(w) {
      const p = PERIODS[w.period] || PERIODS.qualquer;
      const dur = waitlist.duration(w);
      const list = w.barberId ? slots({ date: w.date, barberId: w.barberId, duration: dur }) : slotsAny({ date: w.date, duration: dur });
      return list.filter((x) => x.available && U.toMin(x.time) >= p.from && U.toMin(x.time) < p.to);
    },
  };

  /** Cria um agendamento validando serviços e conflitos.
      Na nuvem, o cliente agenda por uma função do servidor (que revalida tudo);
      a equipe grava direto e o banco recusa sobreposição (exceto encaixe). */
  async function create({ clientId, barberId, serviceIds, date, start, status = 'confirmado', source = 'site', notes = '', paymentMethod = null, total = null, allowConflict = false, reschedule = null, useClub = true, withDeposit = null }) {
    const items = serviceIds
      .map((id) => db.service(id))
      .filter(Boolean)
      .map((s) => ({ id: s.id, name: s.name, price: s.price, duration: s.duration }));
    if (!items.length) throw new Error('Escolha pelo menos um serviço.');
    if (!barberId) throw new Error('Escolha o profissional.');
    const duration = U.sum(items, (s) => s.duration);
    const staff = App.auth.isStaff(App.auth.current());

    if (db.isCloud() && !staff) {
      return App.cloud.book({ barberId, serviceIds, date, start, notes, reschedule });
    }
    if (!clientId) throw new Error('Informe o cliente.');
    if (!allowConflict && conflict({ barberId, date, start, duration, ignoreId: reschedule })) {
      throw new Error('Esse horário acabou de ser ocupado. Escolha outro, por favor.');
    }
    const old = reschedule ? db.get('appointments', reschedule) : null;
    // Clube: serviços incluídos saem de graça; sinal só no agendamento do próprio cliente
    const cov = useClub ? club.coverage({ clientId, serviceIds: items.map((x) => x.id), date, ignoreId: reschedule }) : null;
    const priced = club.price(items, cov && cov.applies ? cov : null);
    const finalTotal = total == null ? priced.total : Number(total);
    let dep = (withDeposit ?? (source === 'site' && !staff)) ? deposit.amountFor({ clientId, total: finalTotal }) : 0;
    let depStatus = dep > 0 ? 'pendente' : null;
    // Remarcação: o sinal já pago vai junto para o novo horário
    const prev = reschedule ? db.get('appointments', reschedule) : null;
    if (prev && prev.depositStatus === 'pago') {
      dep = prev.depositAmount;
      depStatus = 'pago';
    }
    if (old) db.update('appointments', old.id, { status: 'cancelado', notes: [old.notes, 'Remarcado pelo cliente.'].filter(Boolean).join(' ') });
    try {
      return await db.insertConfirmed('appointments', {
        clientId,
        barberId,
        services: items,
        date,
        start,
        duration,
        total: finalTotal,
        status,
        paymentMethod: status === 'concluido' ? paymentMethod || 'pix' : null,
        notes,
        source,
        overbook: !!allowConflict,
        subscriptionId: cov && cov.coveredIds.length ? cov.sub.id : null,
        coveredIds: cov && cov.coveredIds.length ? cov.coveredIds : [],
        clubValue: cov && cov.coveredIds.length ? priced.clubValue : 0,
        depositAmount: dep,
        depositStatus: depStatus,
        updatedAt: U.nowISO(),
      }).then((appt) => {
        // Quem estava na lista de espera daquele dia conseguiu horário
        waitlist.entries({ status: ['aguardando', 'avisado'], date }).filter((w) => w.clientId === clientId)
          .forEach((w) => db.update('waitlist', w.id, { status: 'agendado' }));
        return appt;
      });
    } catch (err) {
      if (old) db.update('appointments', old.id, { status: 'confirmado', notes: old.notes });
      throw err;
    }
  }

  App.booking = {
    STATUS, PAYMENTS, SOURCES,
    dayHours, barberWorks, busy, conflict, earliestStart, slots, slotsAny, pickBarber, nextAvailable,
    openStatus, canClientCancel, create, pixPayload,
  };
  club.plusMonth = plusMonth;
  App.club = club;
  App.deposit = deposit;
  App.waitlist = waitlist;
})();
