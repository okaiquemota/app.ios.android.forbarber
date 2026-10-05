-- ============================================================================
-- ForBarber — avisos no celular da equipe (push)
-- Roda depois de 20261003000000_forbarber_clube_espera_sinal.sql.
--
-- Como funciona: o app do barbeiro registra o celular (push_devices). Quando
-- um agendamento é criado, remarcado, alterado ou cancelado, um gatilho chama
-- a função de borda notify-booking (supabase/functions), que manda o aviso
-- pelo Firebase (Android) e pela Apple (iPhone) para quem deve saber.
-- Sem o pg_net e os segredos no Vault (ver README), nada é enviado e o resto
-- do sistema segue igual.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Celulares que recebem avisos
-- ---------------------------------------------------------------------------
create table public.push_devices (
  token text primary key check (char_length(token) between 20 and 4096),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index push_devices_user_idx on public.push_devices (user_id);
alter table public.push_devices enable row level security;
-- Cada um vê só os próprios aparelhos; gravação só pelas funções abaixo
create policy push_devices_own_read on public.push_devices for select using (user_id = auth.uid());

-- O que cada pessoa da equipe quer receber
alter table public.shop_members
  add column push_new boolean not null default true,     -- novos, remarcados e alterados
  add column push_cancel boolean not null default true,  -- cancelamentos
  add column push_all boolean;                           -- toda a barbearia? (vazio = só o dono)

/** Registra (ou passa para quem entrou agora) o celular da equipe */
create or replace function public.register_push_device(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  if not exists (select 1 from public.shop_members where user_id = auth.uid() and active) then
    raise exception 'Só a equipe da barbearia recebe avisos de agendamento.';
  end if;
  if p_platform is null or p_platform not in ('android', 'ios')
     or char_length(coalesce(p_token, '')) not between 20 and 4096 then
    raise exception 'Aparelho inválido.';
  end if;
  insert into public.push_devices (token, user_id, platform) values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
  -- No máximo 10 aparelhos por pessoa (os mais antigos saem)
  delete from public.push_devices where token in (
    select token from public.push_devices where user_id = auth.uid()
    order by coalesce(updated_at, created_at) desc offset 10);
end $$;

/** Ao sair da conta no celular, ele para de receber avisos */
create or replace function public.unregister_push_device(p_token text) returns void
language sql security definer set search_path = public as $$
  delete from public.push_devices where token = p_token and user_id = auth.uid()
$$;

/** Preferências de aviso de quem está logado (barbeiro não edita a equipe) */
create or replace function public.set_my_push_prefs(p_shop uuid, p_new boolean, p_cancel boolean, p_all boolean)
returns public.shop_members
language plpgsql security definer set search_path = public as $$
declare
  v_row public.shop_members;
begin
  update public.shop_members
  set push_new = coalesce(p_new, true), push_cancel = coalesce(p_cancel, true), push_all = p_all
  where shop_id = p_shop and user_id = auth.uid() and active
  returning * into v_row;
  if not found then raise exception 'Você não faz parte da equipe desta barbearia.'; end if;
  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- Quem recebe cada aviso
-- ---------------------------------------------------------------------------
/** Aparelhos que devem receber um aviso: o barbeiro do horário (e o anterior,
    se trocou), o dono e quem pediu "toda a barbearia". Nunca quem fez a ação. */
create or replace function public.push_recipients(p_shop uuid, p_event text, p_barber uuid, p_old_barber uuid, p_actor uuid)
returns table (user_id uuid, token text, platform text)
language sql stable security definer set search_path = public as $$
  select d.user_id, d.token, d.platform
  from public.shop_members m
  join public.push_devices d on d.user_id = m.user_id
  where m.shop_id = p_shop and m.active
    and m.user_id is distinct from p_actor
    and case when p_event = 'cancelado' then m.push_cancel else m.push_new end
    and (m.barber_id = p_barber or m.barber_id = p_old_barber or coalesce(m.push_all, m.role = 'admin'))
$$;

/** Entrega o aviso para a função de borda (pg_net + segredos no Vault).
    Qualquer falha aqui vira só um alerta no log: agendar nunca quebra por causa do aviso. */
create or replace function public.push_dispatch(p_payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null
     or to_regclass('vault.decrypted_secrets') is null then
    return;
  end if;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'forbarber_functions_url'$q$ into v_url;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'forbarber_push_secret'$q$ into v_secret;
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then return; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 8000)'
  using rtrim(v_url, '/') || '/notify-booking', p_payload,
        jsonb_build_object('Content-Type', 'application/json', 'x-forbarber-secret', v_secret);
exception when others then
  raise warning 'ForBarber: aviso de agendamento não enviado (%)', sqlerrm;
end $$;

/** Decide o aviso de cada mudança na agenda. Roda no fim da transação
    (gatilho adiado), quando já dá para ver se um cancelamento era, na verdade,
    a primeira metade de uma remarcação feita pelo cliente. */
create or replace function public.appointment_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_event text;
  v_prev public.appointments;
  v_previous jsonb;
begin
  if new.date < current_date - 1 then return null; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'confirmado' then return null; end if;
    -- Remarcação pelo site: o horário antigo foi cancelado nesta mesma transação
    select * into v_prev from public.appointments p
    where p.client_id = new.client_id and p.id <> new.id and p.status = 'cancelado' and p.updated_at = now()
    limit 1;
    if v_prev.id is not null then
      v_event := 'remarcado';
      v_previous := jsonb_build_object('date', v_prev.date, 'start', to_char(v_prev.start_time, 'HH24:MI'), 'barber_id', v_prev.barber_id);
    else
      v_event := 'novo';
    end if;
  elsif old.status = 'confirmado' and new.status = 'cancelado' then
    if exists (select 1 from public.appointments n
               where n.client_id = new.client_id and n.id <> new.id and n.status = 'confirmado' and n.created_at = now()) then
      return null; -- vira um aviso só: "remarcado"
    end if;
    v_event := 'cancelado';
  elsif old.status = 'confirmado' and new.status = 'confirmado'
        and (new.date, new.start_time, new.barber_id) is distinct from (old.date, old.start_time, old.barber_id) then
    v_event := 'alterado';
    v_previous := jsonb_build_object('date', old.date, 'start', to_char(old.start_time, 'HH24:MI'), 'barber_id', old.barber_id);
  else
    return null;
  end if;
  perform public.push_dispatch(jsonb_build_object(
    'event', v_event,
    'appointment_id', new.id,
    'shop_id', new.shop_id,
    'barber_id', new.barber_id,
    'old_barber_id', nullif(v_previous ->> 'barber_id', new.barber_id::text),
    'actor', auth.uid(),
    'previous', v_previous
  ));
  return null;
end $$;

create constraint trigger appointments_push
after insert or update on public.appointments
deferrable initially deferred
for each row execute function public.appointment_push();

-- Só a função de borda (service role) consulta destinatários; o resto é interno
revoke execute on function public.push_recipients(uuid, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.push_recipients(uuid, text, uuid, uuid, uuid) to service_role;
revoke execute on function public.push_dispatch(jsonb) from public, anon, authenticated;
revoke execute on function public.appointment_push() from public, anon, authenticated;
