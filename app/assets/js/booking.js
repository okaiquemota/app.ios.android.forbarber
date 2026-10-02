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

  /** Cria um agendamento validando serviços e conflitos.
      Na nuvem, o cliente agenda por uma função do servidor (que revalida tudo);
      a equipe grava direto e o banco recusa sobreposição (exceto encaixe). */
  async function create({ clientId, barberId, serviceIds, date, start, status = 'confirmado', source = 'site', notes = '', paymentMethod = null, total = null, allowConflict = false, reschedule = null }) {
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
    if (old) db.update('appointments', old.id, { status: 'cancelado', notes: [old.notes, 'Remarcado pelo cliente.'].filter(Boolean).join(' ') });
    try {
      return await db.insertConfirmed('appointments', {
        clientId,
        barberId,
        services: items,
        date,
        start,
        duration,
        total: total == null ? U.sum(items, (s) => s.price) : Number(total),
        status,
        paymentMethod: status === 'concluido' ? paymentMethod || 'pix' : null,
        notes,
        source,
        overbook: !!allowConflict,
        updatedAt: U.nowISO(),
      });
    } catch (err) {
      if (old) db.update('appointments', old.id, { status: 'confirmado', notes: old.notes });
      throw err;
    }
  }

  App.booking = {
    STATUS, PAYMENTS, SOURCES,
    dayHours, barberWorks, busy, conflict, earliestStart, slots, slotsAny, pickBarber, nextAvailable,
    openStatus, canClientCancel, create,
  };
})();
