-- ============================================================================
-- ForBarber — esquema multi-barbearia (Supabase / Postgres 15+)
-- Cada barbearia (shop) só enxerga os próprios dados: todas as tabelas têm
-- shop_id e Row Level Security. O público (anon) só lê o que o site mostra.
-- Clientes agendam e cancelam por funções que validam as regras no servidor.
-- ============================================================================

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.digits(p text) returns text
language sql immutable as $$ select regexp_replace(coalesce(p, ''), '\D', '', 'g') $$;

create or replace function public.minutes(p time) returns int
language sql immutable as $$ select (extract(epoch from p) / 60)::int $$;

create or replace function public.plan_barber_limit(p_plan text) returns int
language sql immutable as $$
  select case p_plan when 'solo' then 1 when 'equipe' then 4 else 1000 end
$$;

create or replace function public.reserved_slug(p text) returns boolean
language sql immutable as $$
  select p = any (array['app','demo','admin','api','assets','criar','entrar','painel','www','forbarber',
                        'suporte','ajuda','planos','precos','blog','static','vendor','login','cadastro','conta'])
$$;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.shops (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null check (char_length(name) between 2 and 80),
  settings jsonb not null default '{}'::jsonb,
  plan text not null default 'trial' check (plan in ('trial', 'solo', 'equipe', 'premium')),
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'canceled')),
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  owner_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint shops_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' and not public.reserved_slug(slug))
);

create table public.barbers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  title text not null default 'Barbeiro',
  specialty text not null default '',
  bio text not null default '',
  color text not null default '#3987e5',
  photo text not null default '',
  work_days int[] not null default '{1,2,3,4,5,6}',
  commission numeric(5, 2) not null default 0 check (commission between 0 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index barbers_shop_idx on public.barbers (shop_id);

create table public.shop_members (
  shop_id uuid not null references public.shops (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'barbeiro')),
  barber_id uuid references public.barbers (id) on delete set null,
  name text not null default '',
  email text not null default '',
  phone text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);
create index shop_members_user_idx on public.shop_members (user_id);

create table public.shop_invites (
  shop_id uuid not null references public.shops (id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null default 'barbeiro' check (role in ('admin', 'barbeiro')),
  barber_id uuid references public.barbers (id) on delete cascade,
  name text not null default '',
  created_at timestamptz not null default now(),
  primary key (shop_id, email)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  category text not null default 'Cabelo',
  description text not null default '',
  duration int not null check (duration between 5 and 600),
  price numeric(10, 2) not null check (price >= 0),
  featured boolean not null default false,
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index services_shop_idx on public.services (shop_id);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  phone text not null default '',
  email text not null default '',
  birthday date,
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (shop_id, user_id)
);
create index clients_shop_idx on public.clients (shop_id);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete restrict,
  barber_id uuid not null references public.barbers (id) on delete restrict,
  services jsonb not null default '[]'::jsonb,
  date date not null,
  start_time time not null,
  duration int not null check (duration between 5 and 720),
  total numeric(10, 2) not null default 0 check (total >= 0),
  status text not null default 'confirmado' check (status in ('confirmado', 'concluido', 'cancelado', 'faltou')),
  payment_method text check (payment_method in ('pix', 'credito', 'debito', 'dinheiro')),
  notes text not null default '',
  source text not null default 'painel' check (source in ('site', 'painel', 'whatsapp')),
  overbook boolean not null default false,
  slot tsrange generated always as (
    tsrange(date + start_time, date + start_time + make_interval(mins => duration), '[)')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  -- Nunca dois atendimentos ativos do mesmo barbeiro no mesmo horário (encaixe = overbook)
  constraint appointments_no_overlap exclude using gist (barber_id with =, slot with &&)
    where (status in ('confirmado', 'concluido') and not overbook)
);
create index appointments_shop_date_idx on public.appointments (shop_id, date);
create index appointments_client_idx on public.appointments (client_id);

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  barber_id uuid references public.barbers (id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  reason text not null default 'Bloqueio',
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index blocks_shop_date_idx on public.blocks (shop_id, date);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  email text not null default '' check (char_length(email) <= 200),
  phone text not null default '' check (char_length(phone) <= 40),
  subject text not null default '' check (char_length(subject) <= 120),
  message text not null check (char_length(message) between 1 and 4000),
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index messages_shop_idx on public.messages (shop_id);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  appointment_id uuid unique references public.appointments (id) on delete set null,
  barber_id uuid references public.barbers (id) on delete set null,
  name text not null,
  rating int not null check (rating between 1 and 5),
  text text not null check (char_length(text) between 1 and 600),
  visible boolean not null default true,
  created_at timestamptz not null default now()
);
create index reviews_shop_idx on public.reviews (shop_id);

create trigger shops_updated before update on public.shops for each row execute function public.set_updated_at();
create trigger barbers_updated before update on public.barbers for each row execute function public.set_updated_at();
create trigger services_updated before update on public.services for each row execute function public.set_updated_at();
create trigger clients_updated before update on public.clients for each row execute function public.set_updated_at();
create trigger appointments_updated before update on public.appointments for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Papéis e regras de negócio
-- ---------------------------------------------------------------------------
create or replace function public.shop_role(p_shop uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.shop_members where shop_id = p_shop and user_id = auth.uid() and active limit 1
$$;

create or replace function public.is_staff(p_shop uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.shop_role(p_shop) is not null
$$;

create or replace function public.is_admin(p_shop uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.shop_role(p_shop) = 'admin', false)
$$;

create or replace function public.my_client_id(p_shop uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.clients where shop_id = p_shop and user_id = auth.uid() and active limit 1
$$;

/** Barbearia aceitando agendamentos: assinatura ativa ou teste dentro do prazo */
create or replace function public.shop_is_live(p_shop public.shops) returns boolean
language sql stable as $$
  select p_shop.status in ('active', 'past_due') or (p_shop.status = 'trialing' and p_shop.trial_ends_at > now())
$$;

/** Plano, status e dono só mudam pelo service role (cobrança), nunca pelo navegador */
create or replace function public.protect_shop_billing() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and (
    new.plan is distinct from old.plan or new.status is distinct from old.status or
    new.trial_ends_at is distinct from old.trial_ends_at or new.owner_id is distinct from old.owner_id or
    new.slug is distinct from old.slug
  ) then
    raise exception 'Plano e endereço da barbearia só podem ser alterados pelo suporte.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger shops_protect_billing before update on public.shops for each row execute function public.protect_shop_billing();

/** Limite de profissionais ativos por plano */
create or replace function public.enforce_barber_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  v_limit int;
  v_count int;
begin
  if not new.active then return new; end if;
  if tg_op = 'UPDATE' and old.active then return new; end if;
  select plan into v_plan from public.shops where id = new.shop_id;
  v_limit := public.plan_barber_limit(v_plan);
  select count(*) into v_count from public.barbers where shop_id = new.shop_id and active and id <> new.id;
  if v_count >= v_limit then
    raise exception 'Seu plano permite até % profissional(is) ativo(s). Mude de plano em Assinatura.', v_limit using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger barbers_limit before insert or update of active on public.barbers for each row execute function public.enforce_barber_limit();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.shops enable row level security;
alter table public.barbers enable row level security;
alter table public.shop_members enable row level security;
alter table public.shop_invites enable row level security;
alter table public.services enable row level security;
alter table public.clients enable row level security;
alter table public.appointments enable row level security;
alter table public.blocks enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;

-- Vitrine pública: dados que o próprio site exibe
create policy shops_read on public.shops for select using (true);
create policy shops_admin_update on public.shops for update using (public.is_admin(id)) with check (public.is_admin(id));

create policy barbers_read on public.barbers for select using (true);
create policy barbers_admin_write on public.barbers for all using (public.is_admin(shop_id)) with check (public.is_admin(shop_id));

create policy services_read on public.services for select using (true);
create policy services_admin_write on public.services for all using (public.is_admin(shop_id)) with check (public.is_admin(shop_id));

create policy reviews_read on public.reviews for select using (visible or public.is_staff(shop_id));
create policy reviews_admin_write on public.reviews for update using (public.is_admin(shop_id)) with check (public.is_admin(shop_id));
create policy reviews_admin_delete on public.reviews for delete using (public.is_admin(shop_id));

-- Equipe
create policy members_read on public.shop_members for select using (user_id = auth.uid() or public.is_staff(shop_id));
create policy members_admin_write on public.shop_members for all using (public.is_admin(shop_id)) with check (public.is_admin(shop_id));
create policy invites_admin on public.shop_invites for all using (public.is_admin(shop_id)) with check (public.is_admin(shop_id));

-- Clientes: a equipe vê todos da barbearia; o cliente vê só o próprio cadastro
create policy clients_read on public.clients for select using (public.is_staff(shop_id) or user_id = auth.uid());
create policy clients_staff_insert on public.clients for insert with check (public.is_staff(shop_id));
create policy clients_staff_update on public.clients for update using (public.is_staff(shop_id)) with check (public.is_staff(shop_id));
create policy clients_admin_delete on public.clients for delete using (public.is_admin(shop_id));

-- Agendamentos: cliente só lê os próprios; criar/cancelar pelo site é via funções
create policy appointments_read on public.appointments for select
  using (public.is_staff(shop_id) or client_id = public.my_client_id(shop_id));
create policy appointments_staff_insert on public.appointments for insert with check (public.is_staff(shop_id));
create policy appointments_staff_update on public.appointments for update using (public.is_staff(shop_id)) with check (public.is_staff(shop_id));
create policy appointments_admin_delete on public.appointments for delete using (public.is_admin(shop_id));

create policy blocks_staff on public.blocks for all using (public.is_staff(shop_id)) with check (public.is_staff(shop_id));

-- Mensagens do formulário de contato: qualquer um envia, só o admin lê
create policy messages_public_insert on public.messages for insert with check (not read);
create policy messages_admin_read on public.messages for select using (public.is_admin(shop_id));
create policy messages_admin_update on public.messages for update using (public.is_admin(shop_id)) with check (public.is_admin(shop_id));
create policy messages_admin_delete on public.messages for delete using (public.is_admin(shop_id));

-- ---------------------------------------------------------------------------
-- Funções públicas (RPC)
-- ---------------------------------------------------------------------------

/** Configurações iniciais de uma barbearia nova */
create or replace function public.default_shop_settings(p_name text, p_phone text, p_email text) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'name', p_name,
    'slogan', 'Corte, barba e acabamento com hora marcada',
    'about', '',
    'foundedYear', null,
    'phone', p_phone,
    'whatsapp', p_phone,
    'email', p_email,
    'instagram', '',
    'address', jsonb_build_object('street', '', 'district', '', 'city', '', 'state', '', 'cep', ''),
    'hours', jsonb_build_array(
      jsonb_build_object('closed', true, 'open', '09:00', 'close', '13:00'),
      jsonb_build_object('closed', false, 'open', '09:00', 'close', '19:00'),
      jsonb_build_object('closed', false, 'open', '09:00', 'close', '19:00'),
      jsonb_build_object('closed', false, 'open', '09:00', 'close', '19:00'),
      jsonb_build_object('closed', false, 'open', '09:00', 'close', '19:00'),
      jsonb_build_object('closed', false, 'open', '09:00', 'close', '19:00'),
      jsonb_build_object('closed', false, 'open', '09:00', 'close', '17:00')
    ),
    'slotInterval', 30,
    'minAdvance', 60,
    'bookingWindow', 30,
    'cancelLimit', 2,
    'loyaltyTarget', 10,
    'primaryColor', '#f39c12',
    'fontStyle', 'classico',
    'logo', '',
    'heroImage', '',
    'demoMode', false,
    'timezone', 'America/Sao_Paulo'
  )
$$;

create or replace function public.slug_available(p_slug text) returns boolean
language sql stable security definer set search_path = public as $$
  select lower(p_slug) ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
     and not public.reserved_slug(lower(p_slug))
     and not exists (select 1 from public.shops where slug = lower(p_slug))
$$;

/** Cadastro self-service: cria a barbearia, o dono (admin + barbeiro) e serviços iniciais */
create or replace function public.create_shop(p_name text, p_slug text, p_owner_name text, p_phone text default '')
returns public.shops
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.email(), ''));
  v_slug text := lower(trim(p_slug));
  v_shop public.shops;
  v_barber uuid;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta para criar a barbearia.' using errcode = '28000';
  end if;
  if (select count(*) from public.shops where owner_id = v_uid) >= 5 then
    raise exception 'Limite de barbearias por conta atingido. Fale com o suporte.';
  end if;
  if not public.slug_available(v_slug) then
    raise exception 'O endereço "%" não está disponível. Escolha outro.', v_slug;
  end if;

  insert into public.shops (slug, name, settings, owner_id)
  values (v_slug, trim(p_name), public.default_shop_settings(trim(p_name), coalesce(p_phone, ''), v_email), v_uid)
  returning * into v_shop;

  insert into public.barbers (shop_id, name, title, commission)
  values (v_shop.id, trim(p_owner_name), 'Barbeiro · dono', 0)
  returning id into v_barber;

  insert into public.shop_members (shop_id, user_id, role, barber_id, name, email, phone)
  values (v_shop.id, v_uid, 'admin', v_barber, trim(p_owner_name), v_email, coalesce(p_phone, ''));

  insert into public.services (shop_id, name, category, description, duration, price, featured, position) values
    (v_shop.id, 'Corte', 'Cabelo', 'Tesoura ou máquina, com acabamento na navalha.', 45, 40, true, 1),
    (v_shop.id, 'Barba', 'Barba', 'Modelagem com toalha quente e hidratação.', 30, 30, true, 2),
    (v_shop.id, 'Corte + Barba', 'Combos', 'O pacote completo com preço especial.', 75, 60, true, 3),
    (v_shop.id, 'Sobrancelha', 'Acabamentos', 'Alinhamento na navalha.', 20, 20, false, 4),
    (v_shop.id, 'Pezinho', 'Acabamentos', 'Acabamento do contorno entre um corte e outro.', 15, 15, false, 5);

  return v_shop;
end $$;

create or replace function public.my_shops()
returns table (id uuid, slug text, name text, role text, status text, plan text, trial_ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.slug, s.name, m.role, s.status, s.plan, s.trial_ends_at
  from public.shop_members m join public.shops s on s.id = m.shop_id
  where m.user_id = auth.uid() and m.active
  order by s.created_at
$$;

/** Barbeiro convidado entra na equipe ao fazer login com o e-mail convidado */
create or replace function public.accept_invites() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(coalesce(auth.email(), ''));
  v_count int;
begin
  if auth.uid() is null or v_email = '' then return 0; end if;
  insert into public.shop_members (shop_id, user_id, role, barber_id, name, email)
  select i.shop_id, auth.uid(), i.role, i.barber_id, i.name, i.email
  from public.shop_invites i where i.email = v_email
  on conflict (shop_id, user_id) do update set active = true, role = excluded.role, barber_id = excluded.barber_id;
  get diagnostics v_count = row_count;
  delete from public.shop_invites where email = v_email;
  return v_count;
end $$;

/** Cliente entra numa barbearia: assume o cadastro do balcão (mesmo e-mail ou telefone) ou cria um novo */
create or replace function public.join_shop(p_shop uuid, p_name text, p_phone text, p_birthday date default null)
returns public.clients
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.email(), ''));
  v_row public.clients;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  select * into v_row from public.clients where shop_id = p_shop and user_id = v_uid;
  if found then
    if not v_row.active then
      update public.clients set active = true where id = v_row.id returning * into v_row;
    end if;
    return v_row;
  end if;

  select * into v_row from public.clients
  where shop_id = p_shop and user_id is null and active
    and ((v_email <> '' and lower(email) = v_email) or (public.digits(p_phone) <> '' and public.digits(phone) = public.digits(p_phone)))
  order by created_at
  limit 1
  for update;

  if found then
    update public.clients set
      user_id = v_uid,
      name = coalesce(nullif(trim(p_name), ''), name),
      email = coalesce(nullif(v_email, ''), email),
      phone = coalesce(nullif(trim(p_phone), ''), phone),
      birthday = coalesce(p_birthday, birthday)
    where id = v_row.id
    returning * into v_row;
    return v_row;
  end if;

  insert into public.clients (shop_id, user_id, name, phone, email, birthday)
  values (p_shop, v_uid, coalesce(nullif(trim(p_name), ''), split_part(v_email, '@', 1)), coalesce(trim(p_phone), ''), v_email, p_birthday)
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.update_my_profile(p_shop uuid, p_name text, p_phone text, p_birthday date)
returns public.clients
language plpgsql security definer set search_path = public as $$
declare
  v_row public.clients;
begin
  update public.clients set
    name = coalesce(nullif(trim(p_name), ''), name),
    phone = coalesce(trim(p_phone), phone),
    birthday = p_birthday,
    email = lower(coalesce(auth.email(), email))
  where shop_id = p_shop and user_id = auth.uid() and active
  returning * into v_row;
  if not found then raise exception 'Cadastro não encontrado.'; end if;
  return v_row;
end $$;

create or replace function public.delete_my_account(p_shop uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_client uuid := public.my_client_id(p_shop);
begin
  if v_client is null then return; end if;
  update public.appointments set status = 'cancelado', notes = trim(notes || ' Conta excluída pelo cliente.')
  where client_id = v_client and status = 'confirmado' and date >= current_date;
  update public.clients set active = false, user_id = null where id = v_client;
end $$;

/** Horários ocupados para o agendamento online, sem dados de clientes */
create or replace function public.public_busy(p_shop uuid, p_from date, p_to date)
returns table (kind text, id uuid, barber_id uuid, date date, start_time time, duration int)
language sql stable security definer set search_path = public as $$
  select 'appt', a.id, a.barber_id, a.date, a.start_time, a.duration
  from public.appointments a
  where a.shop_id = p_shop and a.date between p_from and p_to and a.status in ('confirmado', 'concluido')
  union all
  select 'block', b.id, b.barber_id, b.date, b.start_time, public.minutes(b.end_time) - public.minutes(b.start_time)
  from public.blocks b
  where b.shop_id = p_shop and b.date between p_from and p_to
$$;

/** Agendamento pelo site, com todas as regras validadas no servidor */
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
  v_total numeric;
  v_count int;
  v_start int := public.minutes(p_start);
  v_old public.appointments;
  v_row public.appointments;
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
    coalesce(sum(s.duration), 0), coalesce(sum(s.price), 0), count(*)
  into v_services, v_duration, v_total, v_count
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

  begin
    insert into public.appointments (id, shop_id, client_id, barber_id, services, date, start_time, duration, total, status, notes, source)
    values (coalesce(p_id, gen_random_uuid()), p_shop, v_client, p_barber, v_services, p_date, p_start, v_duration, v_total,
            'confirmado', left(coalesce(p_notes, ''), 300), 'site')
    returning * into v_row;
  exception when exclusion_violation then
    raise exception 'Esse horário acabou de ser ocupado. Escolha outro, por favor.';
  end;
  return v_row;
end $$;

create or replace function public.cancel_my_appointment(p_id uuid) returns public.appointments
language plpgsql security definer set search_path = public as $$
declare
  v_row public.appointments;
  v_settings jsonb;
  v_now timestamp;
begin
  select a.* into v_row from public.appointments a where a.id = p_id for update;
  if not found or v_row.client_id is distinct from public.my_client_id(v_row.shop_id) then
    raise exception 'Agendamento não encontrado.';
  end if;
  if v_row.status <> 'confirmado' then raise exception 'Esse horário não pode mais ser cancelado.'; end if;
  select settings into v_settings from public.shops where id = v_row.shop_id;
  v_now := now() at time zone coalesce(v_settings ->> 'timezone', 'America/Sao_Paulo');
  if (v_row.date + v_row.start_time) - v_now < make_interval(hours => coalesce((v_settings ->> 'cancelLimit')::int, 0)) then
    raise exception 'O prazo para cancelar pelo site já passou. Fale com a barbearia.';
  end if;
  update public.appointments set status = 'cancelado', notes = trim(notes || ' Cancelado pelo cliente.')
  where id = p_id returning * into v_row;
  return v_row;
end $$;

create or replace function public.add_review(p_appointment uuid, p_rating int, p_text text) returns public.reviews
language plpgsql security definer set search_path = public as $$
declare
  v_appt public.appointments;
  v_client public.clients;
  v_row public.reviews;
begin
  select * into v_appt from public.appointments where id = p_appointment;
  if not found or v_appt.client_id is distinct from public.my_client_id(v_appt.shop_id) then
    raise exception 'Atendimento não encontrado.';
  end if;
  if v_appt.status <> 'concluido' then raise exception 'Só dá para avaliar atendimentos concluídos.'; end if;
  select * into v_client from public.clients where id = v_appt.client_id;
  begin
    insert into public.reviews (shop_id, client_id, appointment_id, barber_id, name, rating, text)
    values (v_appt.shop_id, v_appt.client_id, v_appt.id, v_appt.barber_id, v_client.name, p_rating, left(trim(p_text), 600))
    returning * into v_row;
  exception when unique_violation then
    raise exception 'Você já avaliou esse atendimento.';
  end;
  return v_row;
end $$;

-- Funções internas não ficam expostas como RPC
revoke execute on function public.set_updated_at() from public;
revoke execute on function public.protect_shop_billing() from public;
revoke execute on function public.enforce_barber_limit() from public;

-- ---------------------------------------------------------------------------
-- Tempo real: o painel atualiza sozinho quando chega agendamento ou mensagem
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.appointments, public.messages, public.clients, public.blocks;
  end if;
end $$;
