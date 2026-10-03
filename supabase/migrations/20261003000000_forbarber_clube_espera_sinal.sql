-- ============================================================================
-- ForBarber — clube de assinatura, lista de espera e sinal por Pix
-- Roda depois de 20261002000000_forbarber_schema.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Clube de assinatura
-- ---------------------------------------------------------------------------
create table public.club_plans (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  price numeric(10, 2) not null check (price > 0),
  uses_per_period int check (uses_per_period is null or uses_per_period between 1 and 100), -- null = ilimitado
  service_ids uuid[] not null default '{}',
  discount_others numeric(5, 2) not null default 0 check (discount_others between 0 and 100),
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (id, shop_id)
);
create index club_plans_shop_idx on public.club_plans (shop_id);

create table public.club_subscriptions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  client_id uuid not null,
  plan_id uuid not null,
  -- "vencida" não é gravado: é ativa com period_end no passado
  status text not null default 'ativa' check (status in ('ativa', 'pausada', 'cancelada')),
  started_at date not null default current_date,
  period_start date not null,
  period_end date not null,
  notes text not null default '' check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  check (period_end >= period_start),
  unique (id, shop_id),
  foreign key (client_id, shop_id) references public.clients (id, shop_id) on delete cascade,
  foreign key (plan_id, shop_id) references public.club_plans (id, shop_id) on delete restrict
);
create index club_subscriptions_shop_idx on public.club_subscriptions (shop_id);
create index club_subscriptions_client_idx on public.club_subscriptions (client_id);

create table public.club_payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  subscription_id uuid not null,
  client_id uuid not null,
  amount numeric(10, 2) not null check (amount >= 0),
  method text not null default 'pix' check (method in ('pix', 'credito', 'debito', 'dinheiro')),
  paid_at timestamptz not null default now(),
  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default now(),
  foreign key (subscription_id, shop_id) references public.club_subscriptions (id, shop_id) on delete cascade,
  foreign key (client_id, shop_id) references public.clients (id, shop_id) on delete cascade
);
create index club_payments_shop_idx on public.club_payments (shop_id, paid_at);

-- ---------------------------------------------------------------------------
-- Lista de espera
-- ---------------------------------------------------------------------------
create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  client_id uuid not null,
  date date not null,
  period text not null default 'qualquer' check (period in ('qualquer', 'manha', 'tarde', 'noite')),
  service_ids uuid[] not null default '{}',
  barber_id uuid references public.barbers (id) on delete set null,
  notes text not null default '' check (char_length(notes) <= 200),
  status text not null default 'aguardando' check (status in ('aguardando', 'avisado', 'agendado', 'cancelado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  foreign key (client_id, shop_id) references public.clients (id, shop_id) on delete cascade
);
create index waitlist_shop_date_idx on public.waitlist (shop_id, date);
create index waitlist_client_idx on public.waitlist (client_id);

-- ---------------------------------------------------------------------------
-- Agendamento: cobertura do clube e sinal
-- ---------------------------------------------------------------------------
alter table public.appointments
  add column subscription_id uuid references public.club_subscriptions (id) on delete set null,
  add column covered_ids uuid[] not null default '{}',
  add column club_value numeric(10, 2) not null default 0 check (club_value >= 0),
  add column deposit_amount numeric(10, 2) not null default 0 check (deposit_amount >= 0),
  add column deposit_status text check (deposit_status in ('pendente', 'pago')),
  add column deposit_paid_at timestamptz;
create index appointments_subscription_idx on public.appointments (subscription_id) where subscription_id is not null;

create trigger club_plans_updated before update on public.club_plans for each row execute function public.set_updated_at();
create trigger club_subscriptions_updated before update on public.club_subscriptions for each row execute function public.set_updated_at();
create trigger waitlist_updated before update on public.waitlist for each row execute function public.set_updated_at();

/** Cliente desligado (conta excluída) sai da lista de espera */
create or replace function public.waitlist_on_client_off() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.active and not new.active then
    update public.waitlist set status = 'cancelado' where client_id = new.id and status in ('aguardando', 'avisado');
  end if;
  return new;
end $$;
create trigger clients_waitlist_off after update of active on public.clients for each row execute function public.waitlist_on_client_off();
revoke execute on function public.waitlist_on_client_off() from public;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.club_plans enable row level security;
alter table public.club_subscriptions enable row level security;
alter table public.club_payments enable row level security;
alter table public.waitlist enable row level security;

-- Planos aparecem no site da barbearia
create policy club_plans_read on public.club_plans for select using (true);
create policy club_plans_admin_write on public.club_plans for all using (public.is_admin(shop_id)) with check (public.is_admin(shop_id));

-- Assinaturas e mensalidades: a equipe gerencia; o cliente só vê as próprias
create policy club_subs_read on public.club_subscriptions for select
  using (public.is_staff(shop_id) or client_id = public.my_client_id(shop_id));
create policy club_subs_staff_insert on public.club_subscriptions for insert with check (public.is_staff(shop_id));
create policy club_subs_staff_update on public.club_subscriptions for update using (public.is_staff(shop_id)) with check (public.is_staff(shop_id));
create policy club_subs_admin_delete on public.club_subscriptions for delete using (public.is_admin(shop_id));

create policy club_payments_read on public.club_payments for select
  using (public.is_staff(shop_id) or client_id = public.my_client_id(shop_id));
create policy club_payments_staff_insert on public.club_payments for insert with check (public.is_staff(shop_id));
create policy club_payments_admin_update on public.club_payments for update using (public.is_admin(shop_id)) with check (public.is_admin(shop_id));
create policy club_payments_admin_delete on public.club_payments for delete using (public.is_admin(shop_id));

-- Lista de espera: cliente lê a própria e entra/sai pelas funções abaixo
create policy waitlist_read on public.waitlist for select
  using (public.is_staff(shop_id) or client_id = public.my_client_id(shop_id));
create policy waitlist_staff_write on public.waitlist for all using (public.is_staff(shop_id)) with check (public.is_staff(shop_id));

-- ---------------------------------------------------------------------------
-- Regras no servidor
-- ---------------------------------------------------------------------------

/** O que o clube cobre num agendamento do cliente (mesma regra do app) */
create or replace function public.club_coverage(p_client uuid, p_service_ids uuid[], p_date date, p_ignore uuid default null)
returns table (subscription_id uuid, covered_ids uuid[], discount numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  v_sub public.club_subscriptions;
  v_plan public.club_plans;
  v_used int;
  v_today date;
  v_k int;
  v_ws date;
  v_we date;
begin
  select * into v_sub from public.club_subscriptions s
  where s.client_id = p_client and s.status <> 'cancelada'
  order by s.period_end desc limit 1;
  select (now() at time zone coalesce(sh.settings ->> 'timezone', 'America/Sao_Paulo'))::date into v_today
  from public.shops sh where sh.id = v_sub.shop_id;
  if v_sub.id is null or v_sub.status <> 'ativa' or v_sub.period_end < v_today
     or p_date < v_sub.period_start or p_date > v_sub.period_end then
    return query select null::uuid, '{}'::uuid[], 0::numeric;
    return;
  end if;
  select * into v_plan from public.club_plans where id = v_sub.plan_id;
  -- Mês do plano que contém a data (conta a partir do dia de início; pago adiantado estende o fim)
  v_k := (extract(year from age(p_date, v_sub.period_start)) * 12 + extract(month from age(p_date, v_sub.period_start)))::int;
  while v_k > 0 and (v_sub.period_start + make_interval(months => v_k))::date > p_date loop v_k := v_k - 1; end loop;
  while (v_sub.period_start + make_interval(months => v_k + 1))::date <= p_date loop v_k := v_k + 1; end loop;
  v_ws := (v_sub.period_start + make_interval(months => v_k))::date;
  v_we := least((v_sub.period_start + make_interval(months => v_k + 1))::date - 1, v_sub.period_end);
  select count(*) into v_used from public.appointments a
  where a.subscription_id = v_sub.id and a.status in ('confirmado', 'concluido')
    and a.date between v_ws and v_we
    and a.id is distinct from p_ignore;
  return query select
    v_sub.id,
    case when v_plan.uses_per_period is null or v_used < v_plan.uses_per_period
      then coalesce((select array_agg(x) from unnest(p_service_ids) x where x = any (v_plan.service_ids)), '{}'::uuid[])
      else '{}'::uuid[] end,
    v_plan.discount_others;
end $$;
revoke execute on function public.club_coverage(uuid, uuid[], date, uuid) from public, anon, authenticated;

/** Sinal cobrado no agendamento pelo site, conforme as configurações da barbearia */
create or replace function public.deposit_for(p_settings jsonb, p_client uuid, p_total numeric) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  v_value numeric := coalesce(nullif(p_settings ->> 'depositValue', '')::numeric, 0);
  v_visits int;
  v_noshows int;
begin
  if not coalesce((p_settings ->> 'depositEnabled')::boolean, false)
     or coalesce(trim(p_settings ->> 'pixKey'), '') = '' or p_total <= 0 or v_value <= 0 then
    return 0;
  end if;
  if p_settings ->> 'depositScope' = 'novos_e_faltosos' then
    select count(*) filter (where status = 'concluido'), count(*) filter (where status = 'faltou')
    into v_visits, v_noshows from public.appointments where client_id = p_client;
    if v_visits > 0 and v_noshows = 0 then return 0; end if;
  end if;
  if p_settings ->> 'depositMode' = 'fixo' then
    return round(least(v_value, p_total), 2);
  end if;
  return round(p_total * least(v_value, 100) / 100, 2);
end $$;
revoke execute on function public.deposit_for(jsonb, uuid, numeric) from public, anon, authenticated;

/** Agendamento pelo site, com todas as regras validadas no servidor
    (agora com o desconto do clube, o sinal e a baixa na lista de espera) */
create or replace function public.book_appointment(
  p_shop uuid, p_barber uuid, p_service_ids uuid[], p_date date, p_start time,
  p_notes text default '', p_reschedule uuid default null, p_id uuid default null
) returns public.appointments
language plpgsql security definer set search_path = public as $$
declare
  v_shop public.shops;
  v_settings jsonb;
  v_client uuid;
  v_now timestamp;
  v_hours jsonb;
  v_services jsonb;
  v_duration int;
  v_count int;
  v_start int := public.minutes(p_start);
  v_old public.appointments;
  v_row public.appointments;
  v_cov record;
  v_total numeric;
  v_club numeric;
  v_dep numeric;
  v_dep_status text;
  v_dep_paid timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta para agendar.' using errcode = '28000';
  end if;
  select * into v_shop from public.shops where id = p_shop;
  if not found then raise exception 'Barbearia não encontrada.'; end if;
  if not public.shop_is_live(v_shop) then
    raise exception 'O agendamento online desta barbearia está pausado. Fale com ela pelo WhatsApp.';
  end if;
  v_settings := v_shop.settings;
  v_client := public.my_client_id(p_shop);
  if v_client is null then raise exception 'Complete seu cadastro nesta barbearia para agendar.'; end if;

  perform 1 from public.barbers
  where id = p_barber and shop_id = p_shop and active and extract(dow from p_date)::int = any (work_days);
  if not found then raise exception 'Este profissional não atende neste dia.'; end if;

  select
    jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'price', s.price, 'duration', s.duration)
              order by array_position(p_service_ids, s.id)),
    coalesce(sum(s.duration), 0), count(*)
  into v_services, v_duration, v_count
  from public.services s
  where s.shop_id = p_shop and s.active and s.id = any (p_service_ids);
  if v_count = 0 or v_count <> (select count(distinct x) from unnest(p_service_ids) x) then
    raise exception 'Algum serviço escolhido não está mais disponível. Atualize a página.';
  end if;

  v_hours := v_settings -> 'hours' -> extract(dow from p_date)::int;
  if v_hours is null or coalesce((v_hours ->> 'closed')::boolean, false) then
    raise exception 'A barbearia não abre neste dia.';
  end if;
  if v_start < public.minutes((v_hours ->> 'open')::time)
     or v_start + v_duration > public.minutes((v_hours ->> 'close')::time) then
    raise exception 'Esse horário está fora do expediente.';
  end if;

  v_now := now() at time zone coalesce(v_settings ->> 'timezone', 'America/Sao_Paulo');
  if p_date + p_start < v_now + make_interval(mins => coalesce((v_settings ->> 'minAdvance')::int, 0)) then
    raise exception 'Esse horário já passou ou está muito em cima. Escolha outro.';
  end if;
  if p_date > v_now::date + coalesce((v_settings ->> 'bookingWindow')::int, 30) then
    raise exception 'A agenda ainda não está aberta para essa data.';
  end if;

  perform 1 from public.blocks b
  where b.shop_id = p_shop and b.date = p_date and (b.barber_id is null or b.barber_id = p_barber)
    and public.minutes(b.start_time) < v_start + v_duration and public.minutes(b.end_time) > v_start;
  if found then raise exception 'Esse horário está bloqueado na agenda.'; end if;

  if p_reschedule is not null then
    select * into v_old from public.appointments
    where id = p_reschedule and shop_id = p_shop and client_id = v_client
    for update;
    if not found or v_old.status <> 'confirmado' then
      raise exception 'Não foi possível remarcar esse horário.';
    end if;
    if (v_old.date + v_old.start_time) - v_now < make_interval(hours => coalesce((v_settings ->> 'cancelLimit')::int, 0)) then
      raise exception 'O prazo para remarcar pelo site já passou. Fale com a barbearia.';
    end if;
    update public.appointments set status = 'cancelado', notes = trim(notes || ' Remarcado pelo cliente.')
    where id = v_old.id;
  end if;

  -- Clube: serviços do plano saem de graça (enquanto houver visitas no mês); desconto nos demais
  select * into v_cov from public.club_coverage(v_client, p_service_ids, p_date, p_reschedule);
  select
    coalesce(round(sum(case when s.id = any (v_cov.covered_ids) then 0 else s.price * (1 - coalesce(v_cov.discount, 0) / 100) end), 2), 0),
    coalesce(sum(case when s.id = any (v_cov.covered_ids) then s.price else 0 end), 0)
  into v_total, v_club
  from public.services s
  where s.shop_id = p_shop and s.id = any (p_service_ids);

  -- Sinal por Pix; na remarcação, o sinal já pago acompanha o novo horário
  if v_old.id is not null and v_old.deposit_status = 'pago' then
    v_dep := v_old.deposit_amount;
    v_dep_status := 'pago';
    v_dep_paid := v_old.deposit_paid_at;
  else
    v_dep := public.deposit_for(v_settings, v_client, v_total);
    v_dep_status := case when v_dep > 0 then 'pendente' end;
  end if;

  begin
    insert into public.appointments (id, shop_id, client_id, barber_id, services, date, start_time, duration, total, status, notes, source,
                                     subscription_id, covered_ids, club_value, deposit_amount, deposit_status, deposit_paid_at)
    values (coalesce(p_id, gen_random_uuid()), p_shop, v_client, p_barber, v_services, p_date, p_start, v_duration, v_total,
            'confirmado', left(coalesce(p_notes, ''), 300), 'site',
            case when cardinality(v_cov.covered_ids) > 0 then v_cov.subscription_id end,
            coalesce(v_cov.covered_ids, '{}'), v_club, v_dep, v_dep_status, v_dep_paid)
    returning * into v_row;
  exception when exclusion_violation then
    raise exception 'Esse horário acabou de ser ocupado. Escolha outro, por favor.';
  end;

  -- Quem estava na lista de espera daquele dia conseguiu horário
  update public.waitlist set status = 'agendado'
  where client_id = v_client and date = p_date and status in ('aguardando', 'avisado');
  return v_row;
end $$;

/** Cliente entra na lista de espera de um dia (uma entrada aberta por dia) */
create or replace function public.join_waitlist(
  p_shop uuid, p_date date, p_period text, p_service_ids uuid[], p_barber uuid default null, p_notes text default ''
) returns public.waitlist
language plpgsql security definer set search_path = public as $$
declare
  v_shop public.shops;
  v_client uuid;
  v_today date;
  v_row public.waitlist;
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta para entrar na lista de espera.' using errcode = '28000';
  end if;
  select * into v_shop from public.shops where id = p_shop;
  if not found then raise exception 'Barbearia não encontrada.'; end if;
  if not public.shop_is_live(v_shop) then
    raise exception 'O agendamento online desta barbearia está pausado. Fale com ela pelo WhatsApp.';
  end if;
  v_client := public.my_client_id(p_shop);
  if v_client is null then raise exception 'Complete seu cadastro nesta barbearia.'; end if;
  v_today := (now() at time zone coalesce(v_shop.settings ->> 'timezone', 'America/Sao_Paulo'))::date;
  if p_date < v_today or p_date > v_today + coalesce((v_shop.settings ->> 'bookingWindow')::int, 30) then
    raise exception 'Escolha um dia dentro da agenda aberta.';
  end if;
  if coalesce(p_period, '') not in ('qualquer', 'manha', 'tarde', 'noite') then
    raise exception 'Período inválido.';
  end if;
  if cardinality(coalesce(p_service_ids, '{}')) = 0 or (
    select count(*) from public.services where shop_id = p_shop and active and id = any (p_service_ids)
  ) <> (select count(distinct x) from unnest(p_service_ids) x) then
    raise exception 'Algum serviço escolhido não está mais disponível. Atualize a página.';
  end if;
  if p_barber is not null and not exists (select 1 from public.barbers where id = p_barber and shop_id = p_shop and active) then
    raise exception 'Profissional não encontrado.';
  end if;
  if (select count(*) from public.waitlist where client_id = v_client and status in ('aguardando', 'avisado') and date >= v_today) >= 5 then
    raise exception 'Você já está na lista de espera de vários dias. Saia de algum para entrar em outro.';
  end if;

  update public.waitlist set
    period = p_period, service_ids = p_service_ids, barber_id = p_barber, notes = left(coalesce(p_notes, ''), 200), status = 'aguardando'
  where client_id = v_client and date = p_date and status in ('aguardando', 'avisado')
  returning * into v_row;
  if found then return v_row; end if;

  insert into public.waitlist (shop_id, client_id, date, period, service_ids, barber_id, notes)
  values (p_shop, v_client, p_date, p_period, p_service_ids, p_barber, left(coalesce(p_notes, ''), 200))
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.leave_waitlist(p_id uuid) returns public.waitlist
language plpgsql security definer set search_path = public as $$
declare
  v_row public.waitlist;
begin
  select * into v_row from public.waitlist where id = p_id for update;
  if not found or v_row.client_id is distinct from public.my_client_id(v_row.shop_id) then
    raise exception 'Entrada não encontrada.';
  end if;
  update public.waitlist set status = 'cancelado' where id = p_id returning * into v_row;
  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- Tempo real: painel vê na hora quem entrou na lista de espera e o clube
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.waitlist, public.club_subscriptions, public.club_payments, public.club_plans;
  end if;
end $$;
