/* ==========================================================================
   DADOS DE DEMONSTRAÇÃO — gera uma barbearia "viva": serviços, equipe,
   ~60 clientes e 4 meses de agendamentos (passado e futuro) relativos à
   data de hoje. A semente fixa deixa os dados iguais a cada restauração.
   Edite as listas abaixo para adaptar o modelo a outra barbearia.
   ========================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const U = App.utils;

  const DEMO_PASSWORD = 'demo123';

  const DEFAULT_SETTINGS = {
    name: 'Grey Barber',
    slogan: 'Tradição e estilo em cada detalhe',
    about:
      'Desde 2019 a Grey Barber junta a tradição da barbearia clássica às técnicas mais atuais. Aqui o corte é feito sem pressa: navalha afiada, toalha quente, café passado na hora e aquela conversa boa.',
    foundedYear: 2019,
    phone: '(16) 98765-4321',
    whatsapp: '(16) 98765-4321',
    email: 'contato@greybarber.com.br',
    instagram: 'greybarber',
    address: {
      street: 'Rua das Flores, 123',
      district: 'Centro',
      city: 'Ribeirão Preto',
      state: 'SP',
      cep: '14010-000',
    },
    // Índice = dia da semana (0 = domingo)
    hours: [
      { closed: true, open: '09:00', close: '13:00' },
      { closed: false, open: '09:00', close: '19:00' },
      { closed: false, open: '09:00', close: '19:00' },
      { closed: false, open: '09:00', close: '19:00' },
      { closed: false, open: '09:00', close: '19:00' },
      { closed: false, open: '09:00', close: '19:00' },
      { closed: false, open: '09:00', close: '14:00' },
    ],
    slotInterval: 30, // minutos entre horários oferecidos
    minAdvance: 60, // antecedência mínima para agendar (min)
    bookingWindow: 30, // dias à frente liberados para agendamento
    cancelLimit: 2, // horas de antecedência para o cliente cancelar
    loyaltyTarget: 10, // atendimentos para ganhar um corte
    // Sinal por Pix no agendamento online
    depositEnabled: false,
    depositMode: 'percentual', // 'percentual' ou 'fixo'
    depositValue: 30,
    depositScope: 'todos', // 'todos' ou 'novos_e_faltosos'
    pixKey: '',
    pixName: '',
    pixCity: '',
    productCommission: 10, // % do barbeiro sobre os produtos que ele vende
    primaryColor: '#111827',
    fontStyle: 'classico',
    logo: '',
    heroImage: '',
    demoMode: true,
  };

  const CATEGORIES = ['Cabelo', 'Barba', 'Combos', 'Química', 'Tratamentos', 'Acabamentos'];

  const SERVICES = [
    { id: 's-corte', name: 'Corte', category: 'Cabelo', duration: 45, price: 40, featured: true, description: 'Tesoura ou máquina, acabamento na navalha e finalização com pomada.' },
    { id: 's-combo', name: 'Corte + Barba', category: 'Combos', duration: 75, price: 60, featured: true, description: 'O pacote completo com preço especial. O mais pedido da casa.' },
    { id: 's-barba', name: 'Barba', category: 'Barba', duration: 30, price: 30, featured: true, description: 'Modelagem completa com toalha quente, óleo e hidratação.' },
    { id: 's-completo', name: 'Combo completo', category: 'Combos', duration: 90, price: 75, featured: true, description: 'Corte, barba e sobrancelha numa sessão só.' },
    { id: 's-luzes', name: 'Luzes', category: 'Química', duration: 60, price: 80, featured: true, description: 'Mechas para um visual moderno, com estilo e personalidade.' },
    { id: 's-sobrancelha', name: 'Sobrancelha', category: 'Acabamentos', duration: 20, price: 20, featured: true, description: 'Design e alinhamento na navalha, com aspecto natural.' },
    { id: 's-infantil', name: 'Corte infantil', category: 'Cabelo', duration: 40, price: 35, featured: false, description: 'Para os pequenos até 12 anos, com toda a paciência do mundo.' },
    { id: 's-pigmentacao', name: 'Pigmentação de barba', category: 'Barba', duration: 30, price: 35, featured: false, description: 'Disfarça falhas e realça o desenho da barba.' },
    { id: 's-bigode', name: 'Bigode', category: 'Barba', duration: 15, price: 20, featured: false, description: 'Acabamento detalhado e alinhamento perfeito.' },
    { id: 's-platinado', name: 'Platinado', category: 'Química', duration: 120, price: 150, featured: false, description: 'Descoloração global com matização. Inclui avaliação dos fios.' },
    { id: 's-hidratacao', name: 'Hidratação capilar', category: 'Tratamentos', duration: 30, price: 30, featured: false, description: 'Reposição de nutrientes para fios mais fortes e com brilho.' },
    { id: 's-pezinho', name: 'Pezinho', category: 'Acabamentos', duration: 15, price: 15, featured: false, description: 'Acabamento do contorno para manter o corte em dia.' },
  ];

  // Cores de identidade da equipe (paleta categórica validada para fundo escuro)
  const TEAM_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9', '#e66767', '#008300'];

  const BARBERS = [
    { id: 'b-ze', name: 'Zé Carlos', title: 'Barbeiro fundador', specialty: 'Cortes clássicos e barba na toalha quente', bio: 'Começou aos 17 anos na cadeira do pai e hoje comanda a casa. Referência em navalha e barba tradicional.', color: TEAM_COLORS[0], workDays: [1, 2, 3, 4, 5, 6], commission: 0 },
    { id: 'b-rodrigo', name: 'Rodrigo Alves', title: 'Barbeiro', specialty: 'Degradê, freestyle e luzes', bio: 'Especialista em fade e desenhos. Se a referência veio do Instagram, ele resolve.', color: TEAM_COLORS[1], workDays: [1, 2, 3, 4, 5, 6], commission: 40 },
    { id: 'b-mateus', name: 'Mateus Lima', title: 'Barbeiro', specialty: 'Sobrancelha, acabamentos e pigmentação', bio: 'Detalhista ao extremo: alinhamento, contorno e pigmentação de barba.', color: TEAM_COLORS[2], workDays: [2, 3, 4, 5, 6], commission: 40 },
  ];

  const CLIENT_NAMES = [
    'Lucas Andrade', 'Carlos Silva', 'Pedro Costa', 'Marcos Oliveira', 'João Silva', 'Rafael Souza', 'Bruno Lima',
    'Gabriel Martins', 'Felipe Rocha', 'Gustavo Almeida', 'Thiago Ferreira', 'Leonardo Gomes', 'Matheus Ribeiro',
    'André Carvalho', 'Ricardo Barbosa', 'Diego Araújo', 'Vinícius Mendes', 'Eduardo Cardoso', 'Fernando Teixeira',
    'Daniel Moreira', 'Henrique Castro', 'Caio Nogueira', 'Igor Pinto', 'Renato Correia', 'Fábio Dias',
    'Leandro Monteiro', 'Paulo Ramos', 'Sérgio Freitas', 'Alexandre Batista', 'Murilo Campos', 'Samuel Vieira',
    'Otávio Duarte', 'Arthur Fernandes', 'Davi Rezende', 'Enzo Barros', 'Heitor Machado', 'Bernardo Moura',
    'Juliano Peixoto', 'Wagner Santana', 'Cristiano Melo', 'Rogério Farias', 'Anderson Lopes', 'Wellington Siqueira',
    'Márcio Brandão', 'Roberto Fonseca', 'Antônio Prado', 'Arnaldo Rocha', 'Lucas Santos', 'Kaique Moraes',
    'Breno Tavares', 'Hugo Pacheco', 'Nathan Guerra', 'Yuri Bastos', 'Cauã Rios', 'Ítalo Sales', 'Douglas Amaral',
    'Jefferson Lacerda', 'Miguel Azevedo', 'Lorenzo Cunha', 'Vitor Hugo Ramos',
  ];

  const CLIENT_NOTES = {
    'Carlos Silva': 'Máquina 2 nas laterais, tesoura em cima. Gosta de café sem açúcar.',
    'Ricardo Barbosa': 'Alérgico a pós-barba com álcool — usar loção sem álcool.',
    'Felipe Rocha': 'Sempre agenda com o Rodrigo. Degradê navalhado.',
    'Daniel Moreira': 'Traz o filho (Miguel) para corte infantil junto.',
    'Gustavo Almeida': 'Prefere horários no fim da tarde.',
  };

  const REVIEWS = [
    { name: 'João Silva', rating: 5, barberId: 'b-ze', text: 'Atendimento excelente e corte impecável. Saí de lá outra pessoa.' },
    { name: 'Felipe Rocha', rating: 5, barberId: 'b-rodrigo', text: 'Ambiente top, cerveja gelada e o degradê do Rodrigo é outro nível.' },
    { name: 'Marcos Oliveira', rating: 5, barberId: 'b-ze', text: 'Melhor barbearia da região. Barba na toalha quente que não tem igual.' },
    { name: 'Gustavo Almeida', rating: 5, barberId: 'b-mateus', text: 'Agendei pelo site em um minuto e fui atendido no horário certinho.' },
    { name: 'Arnaldo Rocha', rating: 5, barberId: 'b-rodrigo', text: 'O barbeiro entendeu exatamente o que eu queria e o corte ficou impecável.' },
    { name: 'Daniel Moreira', rating: 5, barberId: 'b-mateus', text: 'Levei meu filho para o primeiro corte e foram super pacientes com ele.' },
    { name: 'Thiago Ferreira', rating: 4, barberId: 'b-ze', text: 'Muito bom! Atrasou uns minutinhos para começar, mas o resultado compensou.' },
    { name: 'Bruno Lima', rating: 5, barberId: 'b-mateus', text: 'Sobrancelha alinhada na navalha pelo Mateus, ficou bem natural. Recomendo.' },
    { name: 'Gabriel Martins', rating: 5, barberId: 'b-rodrigo', text: 'Fiz luzes e ficou igualzinho à referência que levei.' },
    { name: 'Lucas Santos', rating: 5, barberId: 'b-ze', text: 'Serviço rápido e profissional. Preço justo pelo nível do atendimento.' },
    { name: 'Henrique Castro', rating: 4, barberId: 'b-rodrigo', text: 'Corte ótimo e lugar muito agradável. Só senti falta de estacionamento.' },
  ];

  const MESSAGES = [
    { name: 'Juliana Prado', email: 'juliana.prado@email.com', phone: '(16) 99123-4567', subject: 'Orçamento para casamento', message: 'Olá! Vou casar em novembro e gostaria de um orçamento para o dia do noivo: corte e barba para ele e 5 padrinhos, de preferência na manhã do sábado. Vocês fazem pacote?', daysAgo: 0.15, read: false },
    { name: 'Vitor Hugo Ramos', email: 'vitorhugo@email.com', phone: '(16) 99876-1122', subject: 'Abrem em dezembro aos domingos?', message: 'Boa tarde! Vocês vão abrir em algum domingo de dezembro por causa das festas? Queria deixar marcado.', daysAgo: 1.3, read: false },
    { name: 'Carlos Silva', email: 'carlos.silva@email.com', phone: '(16) 98888-2222', subject: 'Elogio ao atendimento', message: 'Passando para agradecer o Rodrigo pelo corte de ontem. Ficou perfeito, todo mundo no trabalho elogiou!', daysAgo: 3, read: true },
    { name: 'Mariana Lopes', email: 'mari.lopes@email.com', phone: '(16) 99654-7788', subject: 'Vale-presente', message: 'Vocês vendem vale-presente? Quero dar um combo de corte e barba de aniversário para meu namorado.', daysAgo: 6, read: true },
  ];

  const hashPassword = (password, salt) => U.sha256(`${salt}:${password}`);

  /* ------------------------------------------------------------------ */
  function create(now = new Date()) {
    const rnd = U.seededRandom(20261002);
    const randInt = (min, max) => min + Math.floor(rnd() * (max - min + 1));
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const weighted = (pairs) => {
      const total = pairs.reduce((a, p) => a + p[1], 0);
      let r = rnd() * total;
      for (const [value, w] of pairs) {
        if ((r -= w) <= 0) return value;
      }
      return pairs[pairs.length - 1][0];
    };
    const salt = () => Math.floor(rnd() * 1e12).toString(36) + Math.floor(rnd() * 1e12).toString(36);

    const todayIso = U.toISODate(now);
    const nowM = now.getHours() * 60 + now.getMinutes();
    const nowTs = now.getTime();
    const tsOf = (iso, min) => {
      const d = U.parseDate(iso);
      d.setHours(0, min, 0, 0);
      return d.getTime();
    };

    const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    // A demonstração mostra o sinal funcionando
    Object.assign(settings, { depositEnabled: true, pixKey: 'contato@greybarber.com.br', pixName: 'Grey Barber', pixCity: 'Ribeirao Preto' });
    const interval = settings.slotInterval;
    const hoursOf = (iso) => settings.hours[U.weekday(iso)];

    const services = SERVICES.map((s) => ({ ...s, active: true }));
    const serviceById = Object.fromEntries(services.map((s) => [s.id, s]));
    const barbers = BARBERS.map((b) => ({ ...b, active: true, photo: '' }));

    /* ---------- Usuários (equipe + clientes) ---------- */
    const users = [];
    const staff = (id, role, name, email, phone, barberId) => {
      const s = salt();
      users.push({
        id, role, name, email, phone, barberId, birthday: '', notes: '',
        salt: s, passwordHash: hashPassword(DEMO_PASSWORD, s),
        active: true, createdAt: new Date(2019, 2, 4).toISOString(),
      });
    };
    staff('u-admin', 'admin', 'Zé Carlos', 'admin@demo.com', '(16) 98765-4321', 'b-ze');
    staff('u-rodrigo', 'barbeiro', 'Rodrigo Alves', 'barbeiro@demo.com', '(16) 98111-2233', 'b-rodrigo');
    staff('u-mateus', 'barbeiro', 'Mateus Lima', 'mateus@demo.com', '(16) 98222-3344', 'b-mateus');

    const clients = CLIENT_NAMES.map((name, i) => {
      const [first, ...rest] = U.normalize(name).split(' ');
      const email = `${first}.${rest[rest.length - 1] || 'cliente'}@email.com`;
      const isKid = ['Miguel Azevedo', 'Lorenzo Cunha', 'Enzo Barros', 'Davi Rezende'].includes(name);
      const year = isKid ? randInt(2014, 2019) : randInt(1968, 2006);
      const birthday = `${year}-${U.pad(randInt(1, 12))}-${U.pad(randInt(1, 28))}`;
      const daysAgo = i < 6 ? randInt(2, 26) : randInt(40, 720); // alguns clientes novos no mês
      const hasAccount = i === 0 || rnd() < 0.45;
      const s = hasAccount ? salt() : null;
      const user = {
        id: `c-${i + 1}`,
        role: 'cliente',
        name,
        email,
        phone: `(16) 9${randInt(8100, 9999)}-${randInt(1000, 9999)}`,
        birthday,
        notes: CLIENT_NOTES[name] || '',
        salt: s,
        passwordHash: hasAccount ? hashPassword(i === 0 ? DEMO_PASSWORD : salt(), s) : null,
        active: true,
        createdAt: new Date(nowTs - daysAgo * 86400000 - randInt(0, 600) * 60000).toISOString(),
        weight: isKid ? 0.4 : 0.25 + 2.6 * Math.pow(rnd(), 3),
        isKid,
      };
      return user;
    });
    // Cliente de demonstração
    const demo = clients[0];
    demo.email = 'cliente@demo.com';
    demo.phone = '(16) 98888-1111';
    demo.birthday = '1994-' + todayIso.slice(5, 7) + '-21';
    demo.createdAt = new Date(nowTs - 400 * 86400000).toISOString();
    demo.weight = 0; // agendamentos dele são fixos (abaixo)
    clients.forEach((c) => users.push(c));

    const clientPairs = clients.filter((c) => c.weight > 0).map((c) => [c, c.weight]);

    /* ---------- Controle de ocupação ---------- */
    const busy = {};
    const keyOf = (barberId, date) => `${barberId}|${date}`;
    const isFree = (barberId, date, start, end) =>
      !(busy[keyOf(barberId, date)] || []).some(([s, e]) => start < e && end > s);
    const occupy = (barberId, date, start, end) => {
      (busy[keyOf(barberId, date)] = busy[keyOf(barberId, date)] || []).push([start, end]);
    };
    const works = (barber, iso) => {
      const h = hoursOf(iso);
      return !h.closed && barber.workDays.includes(U.weekday(iso));
    };
    /** Volta (ou avança) até achar um dia em que o barbeiro trabalha */
    const workingDay = (barber, offset, step = -1) => {
      let d = offset;
      for (let i = 0; i < 14; i++, d += step) {
        if (works(barber, U.addDays(todayIso, d))) return d;
      }
      return offset;
    };

    const appointments = [];
    let seq = 0;
    const svcList = (ids) => ids.map((id) => {
      const s = serviceById[id];
      return { id: s.id, name: s.name, price: s.price, duration: s.duration };
    });
    const payment = () => weighted([['pix', 46], ['credito', 24], ['debito', 18], ['dinheiro', 12]]);

    function addAppointment({ client, barberId, date, start, serviceIds, status, source }) {
      const items = svcList(serviceIds);
      const duration = U.sum(items, (s) => s.duration);
      const startTs = tsOf(date, start);
      const createdTs = Math.min(startTs, nowTs) - Math.floor(rnd() * 9 * 86400000) - 3600000;
      const appt = {
        id: `a-${++seq}`,
        clientId: client.id,
        barberId,
        services: items,
        date,
        start: U.fromMin(start),
        duration,
        total: U.sum(items, (s) => s.price),
        status,
        paymentMethod: status === 'concluido' ? payment() : null,
        notes: '',
        source: source || weighted([['site', 58], ['painel', 30], ['whatsapp', 12]]),
        createdAt: new Date(createdTs).toISOString(),
        updatedAt: new Date(Math.min(nowTs, startTs + duration * 60000)).toISOString(),
      };
      appointments.push(appt);
      if (status !== 'cancelado') occupy(barberId, date, start, start + duration);
      return appt;
    }

    /* ---------- 1) Histórico fixo do cliente de demonstração ---------- */
    const rodrigo = barbers[1];
    const ze = barbers[0];
    /** Garante que o horário desejado caiba no expediente daquele dia */
    const fitStart = (date, desired, serviceIds) => {
      const h = hoursOf(date);
      const dur = U.sum(serviceIds, (id) => serviceById[id].duration);
      return Math.max(U.toMin(h.open), Math.min(desired, U.toMin(h.close) - dur));
    };
    const demoAppt = (barber, off, desired, serviceIds, status) => {
      const date = U.addDays(todayIso, off);
      return addAppointment({
        client: demo, barberId: barber.id, date, start: fitStart(date, desired, serviceIds),
        serviceIds, status, source: 'site',
      });
    };
    const demoVisits = [-84, -70, -56, -42, -28, -14, -7];
    let demoReviewAppt = null;
    demoVisits.forEach((off, i) => {
      const barber = i % 3 === 2 ? ze : rodrigo;
      const appt = demoAppt(barber, workingDay(barber, off), i % 2 ? 17 * 60 : 10 * 60, i % 2 ? ['s-corte'] : ['s-combo'], 'concluido');
      if (off === -28) demoReviewAppt = appt;
    });
    demoAppt(rodrigo, workingDay(rodrigo, -35), 16 * 60, ['s-corte'], 'cancelado');
    const nextDay = workingDay(rodrigo, 1, 1);
    demoAppt(rodrigo, nextDay, 10 * 60, ['s-combo'], 'confirmado');
    demoAppt(ze, workingDay(ze, nextDay + 8, 1), 17 * 60, ['s-barba'], 'confirmado');

    /* ---------- 2) Bloqueios de agenda ---------- */
    const blocks = [];
    const mateus = barbers[2];
    const satOffset = (() => {
      for (let d = 1; d <= 7; d++) if (U.weekday(U.addDays(todayIso, d)) === 6) return d;
      return 6;
    })();
    const blockDefs = [
      { barber: mateus, off: satOffset, start: '09:00', end: '11:00', reason: 'Curso de visagismo' },
      { barber: ze, off: workingDay(ze, 3, 1), start: '12:00', end: '13:00', reason: 'Reunião com fornecedor' },
    ];
    blockDefs.forEach((b, i) => {
      const date = U.addDays(todayIso, b.off);
      blocks.push({ id: `bl-${i + 1}`, barberId: b.barber.id, date, start: b.start, end: b.end, reason: b.reason, createdAt: now.toISOString() });
      occupy(b.barber.id, date, U.toMin(b.start), U.toMin(b.end));
    });

    /* ---------- 3) Agenda gerada (90 dias para trás, 30 para frente) ---------- */
    const MAIN_SERVICES = [
      ['s-corte', 34], ['s-combo', 22], ['s-barba', 13], ['s-completo', 6], ['s-sobrancelha', 5],
      ['s-luzes', 4], ['s-pigmentacao', 3], ['s-bigode', 2], ['s-hidratacao', 3], ['s-pezinho', 3], ['s-platinado', 1],
    ];
    for (let d = -90; d <= settings.bookingWindow; d++) {
      const date = U.addDays(todayIso, d);
      const h = hoursOf(date);
      if (h.closed) continue;
      const open = U.toMin(h.open);
      const close = U.toMin(h.close);
      const saturday = U.weekday(date) === 6;
      barbers.forEach((barber) => {
        if (!barber.workDays.includes(U.weekday(date))) return;
        let occ;
        if (d < 0) occ = 0.52 + rnd() * 0.3;
        else if (d === 0) occ = 0.6;
        else occ = Math.max(0.08, 0.42 - d * 0.017);
        if (saturday) occ = Math.min(0.95, occ + 0.12);

        let t = open;
        while (t < close) {
          if (rnd() >= occ) { t += interval; continue; }
          const client = weighted(clientPairs);
          let ids = [client.isKid ? 's-infantil' : weighted(MAIN_SERVICES)];
          if ((ids[0] === 's-corte' || ids[0] === 's-barba') && rnd() < 0.14) ids.push(pick(['s-sobrancelha', 's-hidratacao', 's-bigode']));
          if (ids.includes('s-bigode') && ids.includes('s-barba')) ids = ['s-barba'];
          const dur = U.sum(ids, (id) => serviceById[id].duration);
          if (t + dur > close || !isFree(barber.id, date, t, t + dur)) { t += interval; continue; }

          let status = 'confirmado';
          const end = t + dur;
          if (d < 0 || (d === 0 && end <= nowM)) {
            const r = rnd();
            status = r < 0.87 ? 'concluido' : r < 0.91 ? 'faltou' : 'cancelado';
          } else if (d > 0 && rnd() < 0.05) {
            status = 'cancelado';
          }
          addAppointment({ client, barberId: barber.id, date, start: t, serviceIds: ids, status });
          t += Math.ceil(dur / interval) * interval;
        }
      });
    }

    /* ---------- 3b) Clube de assinatura ---------- */
    const plusMonth = (iso) => {
      const d = U.parseDate(iso);
      const day = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + 1);
      d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
      return U.toISODate(d);
    };
    const plans = [
      { id: 'pl-corte', name: 'Clube Corte', description: 'Até 4 cortes por mês e 10% nos outros serviços.', price: 99.9, usesPerPeriod: 4, serviceIds: ['s-corte', 's-pezinho'], discountOthers: 10, active: true, position: 1 },
      { id: 'pl-completo', name: 'Clube Corte + Barba', description: 'Até 4 visitas por mês com corte e barba inclusos e 15% no resto.', price: 159.9, usesPerPeriod: 4, serviceIds: ['s-corte', 's-barba', 's-combo', 's-pezinho'], discountOthers: 15, active: true, position: 2 },
      { id: 'pl-barba', name: 'Clube Barba', description: 'Barba feita toda semana: até 4 por mês.', price: 69.9, usesPerPeriod: 4, serviceIds: ['s-barba', 's-bigode'], discountOthers: 0, active: true, position: 3 },
    ].map((x) => ({ ...x, createdAt: new Date(nowTs - 200 * 86400000).toISOString() }));
    const planById = Object.fromEntries(plans.map((x) => [x.id, x]));
    const subscriptions = [];
    const subPayments = [];
    const subDefs = [
      [demo, 'pl-completo', 'ativa', 6, 9], [clients[1], 'pl-corte', 'ativa', 12, 5], [clients[2], 'pl-completo', 'ativa', 20, 3],
      [clients[3], 'pl-barba', 'ativa', 3, 2], [clients[4], 'pl-corte', 'ativa', 25, 7], [clients[5], 'pl-corte', 'ativa', 9, 1],
      [clients[6], 'pl-completo', 'ativa', 16, 4], [clients[7], 'pl-corte', 'vencida', 0, 3], [clients[8], 'pl-barba', 'cancelada', 0, 2],
    ];
    subDefs.forEach(([client, planId, kind, daysIn, months], i) => {
      let periodStart = U.addDays(todayIso, -daysIn);
      let periodEnd = U.addDays(plusMonth(periodStart), -1);
      if (kind === 'vencida') {
        // Venceu há 3 dias e ainda não renovou
        periodEnd = U.addDays(todayIso, -3);
        const d = U.parseDate(periodEnd);
        d.setMonth(d.getMonth() - 1);
        periodStart = U.addDays(U.toISODate(d), 1);
      }
      const sub = {
        id: `sb-${i + 1}`, clientId: client.id, planId, status: kind === 'cancelada' ? 'cancelada' : 'ativa',
        startedAt: periodStart, periodStart, periodEnd, notes: '', createdAt: new Date(tsOf(periodStart, 10 * 60)).toISOString(),
      };
      // Mensalidades pagas nos meses anteriores e no atual
      let ps = periodStart;
      for (let m = 0; m < months; m++) {
        const pe = U.addDays(plusMonth(ps), -1);
        subPayments.push({
          id: `sp-${subPayments.length + 1}`, subscriptionId: sub.id, clientId: client.id, amount: planById[planId].price,
          method: weighted([['pix', 70], ['credito', 30]]), paidAt: new Date(tsOf(ps, 9 * 60 + randInt(0, 600))).toISOString(),
          periodStart: ps, periodEnd: pe, createdAt: new Date(tsOf(ps, 9 * 60)).toISOString(),
        });
        // mês anterior
        const prev = U.parseDate(ps);
        prev.setMonth(prev.getMonth() - 1);
        ps = U.toISODate(prev);
      }
      sub.startedAt = ps;
      subscriptions.push(sub);
      if (kind !== 'ativa') return;
      // Agendamentos do período usam o plano
      const plan = planById[planId];
      let used = 0;
      appointments
        .filter((a) => a.clientId === client.id && a.date >= periodStart && a.date <= periodEnd && (a.status === 'confirmado' || a.status === 'concluido'))
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .forEach((a) => {
          const covered = a.services.filter((x) => plan.serviceIds.includes(x.id)).map((x) => x.id);
          if (!covered.length || used >= plan.usesPerPeriod) return;
          used++;
          a.subscriptionId = sub.id;
          a.coveredIds = covered;
          a.clubValue = U.sum(a.services.filter((x) => covered.includes(x.id)), (x) => x.price);
          a.total = Math.round(U.sum(a.services.filter((x) => !covered.includes(x.id)), (x) => x.price * (1 - plan.discountOthers / 100)) * 100) / 100;
        });
    });

    /* ---------- 3c) Sinal por Pix em agendamentos do site ---------- */
    appointments
      .filter((a) => a.source === 'site' && a.status === 'confirmado' && a.date >= todayIso && a.date <= U.addDays(todayIso, 7) && a.total > 0 && !a.subscriptionId)
      .forEach((a, i) => {
        if (rnd() > 0.55) return;
        a.depositAmount = Math.round(a.total * 0.3 * 100) / 100;
        a.depositStatus = i % 4 === 1 ? 'pendente' : 'pago';
        if (a.depositStatus === 'pago') a.depositPaidAt = a.createdAt;
      });

    /* ---------- 3d) Lista de espera ---------- */
    const waitDay = U.addDays(todayIso, satOffset);
    const tomorrow = U.addDays(todayIso, 1);
    const waitlist = [
      { client: clients[9], date: waitDay, period: 'manha', serviceIds: ['s-corte'], barberId: 'b-rodrigo', status: 'aguardando', notes: 'Pode ser qualquer horário até meio-dia.' },
      { client: clients[10], date: waitDay, period: 'qualquer', serviceIds: ['s-combo'], barberId: null, status: 'aguardando', notes: '' },
      { client: clients[11], date: tomorrow, period: 'tarde', serviceIds: ['s-barba'], barberId: null, status: 'aguardando', notes: 'Sai do trabalho às 17h.' },
      { client: clients[12], date: tomorrow, period: 'manha', serviceIds: ['s-corte'], barberId: 'b-ze', status: 'avisado', notes: '' },
    ].map((w, i) => ({
      id: `w-${i + 1}`, clientId: w.client.id, date: w.date, period: w.period, serviceIds: w.serviceIds, barberId: w.barberId,
      status: w.status, notes: w.notes, createdAt: new Date(nowTs - (i + 1) * 5 * 3600000).toISOString(),
    }));

    /* ---------- 4) Avaliações ---------- */
    const reviews = REVIEWS.map((r, i) => {
      const client = clients.find((c) => c.name === r.name);
      return {
        id: `r-${i + 1}`,
        clientId: client ? client.id : null,
        name: r.name,
        rating: r.rating,
        text: r.text,
        barberId: r.barberId,
        appointmentId: null,
        visible: true,
        createdAt: new Date(nowTs - (3 + i * 7 + randInt(0, 4)) * 86400000).toISOString(),
      };
    });
    if (demoReviewAppt) {
      reviews.push({
        id: 'r-demo',
        clientId: demo.id,
        name: demo.name,
        rating: 5,
        text: 'Sou cliente há mais de um ano e nunca saí insatisfeito. O Rodrigo é fera no degradê!',
        barberId: demoReviewAppt.barberId,
        appointmentId: demoReviewAppt.id,
        visible: true,
        createdAt: new Date(tsOf(demoReviewAppt.date, 20 * 60)).toISOString(),
      });
    }

    /* ---------- 5) Mensagens do formulário de contato ---------- */
    const messages = MESSAGES.map((m, i) => ({
      id: `m-${i + 1}`,
      name: m.name,
      email: m.email,
      phone: m.phone,
      subject: m.subject,
      message: m.message,
      read: m.read,
      createdAt: new Date(nowTs - m.daysAgo * 86400000).toISOString(),
    }));

    // Campos auxiliares usados só na geração
    clients.forEach((c) => {
      delete c.weight;
      delete c.isKid;
    });

    return addProducts({
      version: 1,
      meta: { seedBase: todayIso, lastNormalized: todayIso, createdAt: now.toISOString() },
      settings,
      services,
      barbers,
      users,
      appointments,
      blocks,
      messages,
      reviews,
      plans,
      subscriptions,
      subPayments,
      waitlist,
    }, now);
  }

  /* ---------- Produtos e vendas (comanda e balcão) ----------
     Estoques já "atuais" (alguns baixos, um esgotado) e 60 dias de vendas:
     parte junto dos atendimentos concluídos, parte avulsa no balcão. */
  const PRODUCTS = [
    { id: 'p-pomada', name: 'Pomada modeladora', category: 'Cabelo', price: 45, cost: 22, stock: 14, minStock: 4 },
    { id: 'p-pomada-seca', name: 'Pomada efeito seco', category: 'Cabelo', price: 48, cost: 24, stock: 3, minStock: 4 },
    { id: 'p-cera', name: 'Cera capilar', category: 'Cabelo', price: 35, cost: 15, stock: 11, minStock: 3 },
    { id: 'p-shampoo', name: 'Shampoo antiqueda', category: 'Cabelo', price: 55, cost: 28, stock: 2, minStock: 3 },
    { id: 'p-oleo', name: 'Óleo para barba', category: 'Barba', price: 39, cost: 17, stock: 9, minStock: 3 },
    { id: 'p-balm', name: 'Balm para barba', category: 'Barba', price: 42, cost: 19, stock: 6, minStock: 3 },
    { id: 'p-minoxidil', name: 'Minoxidil 5%', category: 'Barba', price: 89, cost: 52, stock: 0, minStock: 2 },
    { id: 'p-pente', name: 'Pente de madeira', category: 'Acessórios', price: 25, cost: 8, stock: 20, minStock: 5 },
  ];
  function addProducts(data, now = new Date()) {
    const rnd = U.seededRandom(20261005);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const todayIso = U.toISODate(now);
    const from = U.addDays(todayIso, -60);
    const createdAt = new Date(now.getTime() - 120 * 86400000).toISOString();
    data.products = PRODUCTS.map((p) => ({ ...p, active: true, createdAt }));
    // Mais vendidos aparecem mais (pomada e óleo saem muito)
    const weighted = ['p-pomada', 'p-pomada', 'p-pomada', 'p-oleo', 'p-oleo', 'p-cera', 'p-balm', 'p-pomada-seca', 'p-shampoo', 'p-pente', 'p-minoxidil'];
    const byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
    const line = () => {
      const p = byId[pick(weighted)];
      return { productId: p.id, name: p.name, price: p.price, qty: rnd() < 0.12 ? 2 : 1 };
    };
    const sales = [];
    let seq = 0;
    const add = (v) => {
      const items = [line()];
      if (rnd() < 0.18) {
        const extra = line();
        if (extra.productId !== items[0].productId) items.push(extra);
      }
      sales.push({ id: `v-${++seq}`, items, total: U.sum(items, (i) => i.price * i.qty), status: 'ok', createdBy: null, ...v });
    };
    // Comanda: cerca de 1 em cada 9 atendimentos concluídos leva um produto
    data.appointments
      .filter((a) => a.status === 'concluido' && a.date >= from && a.date <= todayIso)
      .forEach((a) => {
        if (rnd() >= 0.11) return;
        const end = U.parseDate(a.date);
        end.setHours(0, U.toMin(a.start) + a.duration, 0, 0);
        add({ date: a.date, clientId: a.clientId, barberId: a.barberId, appointmentId: a.id, paymentMethod: a.paymentMethod || 'pix', createdAt: end.toISOString() });
      });
    // Balcão: venda avulsa, sem horário marcado
    const barberIds = data.barbers.map((b) => b.id);
    for (let d = from; d < todayIso; d = U.addDays(d, 1)) {
      const h = data.settings.hours[U.weekday(d)];
      if (h.closed || rnd() > 0.2) continue;
      const at = U.parseDate(d);
      at.setHours(10 + Math.floor(rnd() * 7), Math.floor(rnd() * 60), 0, 0);
      add({ date: d, clientId: null, barberId: pick(barberIds), appointmentId: null, paymentMethod: pick(['pix', 'pix', 'credito', 'debito', 'dinheiro']), createdAt: at.toISOString() });
    }
    data.sales = sales.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    data.settings.productCommission = data.settings.productCommission ?? 10;
    data.meta = { ...(data.meta || {}), produtos: true };
    return data;
  }

  App.seed = { create, addProducts, DEFAULT_SETTINGS, CATEGORIES, TEAM_COLORS, DEMO_PASSWORD, hashPassword };
})();
