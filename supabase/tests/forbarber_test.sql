-- ============================================================================
-- Testes do esquema ForBarber (rode com supabase/tests/run.sh)
-- Cada bloco troca de "usuário" como o Supabase faz (role + JWT) e confere
-- o que ele consegue ou não ver/fazer.
-- ============================================================================
\set ON_ERROR_STOP on
\set QUIET on

-- Auxiliares de asserção (executam com as permissões de quem chama)
create function public.t_ok(p_ok boolean, p_msg text) returns text language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FALHOU: %', p_msg; end if;
  return 'ok  ' || p_msg;
end $$;
create function public.t_err(p_sql text, p_fragment text, p_msg text) returns text language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_fragment in sqlerrm) > 0 then return 'ok  ' || p_msg; end if;
    raise exception 'FALHOU: % (erro inesperado: %)', p_msg, sqlerrm;
  end;
  raise exception 'FALHOU: % (nenhum erro)', p_msg;
end $$;
grant execute on function public.t_ok(boolean, text), public.t_err(text, text, text) to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;

create function public.t_as(p_role text, p_uid uuid, p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), false);
  perform set_config('request.jwt.claim.email', coalesce(p_email, ''), false);
end $$;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'dono@teste.com'),
  ('22222222-2222-2222-2222-222222222222', 'cliente@teste.com'),
  ('33333333-3333-3333-3333-333333333333', 'outro@teste.com'),
  ('44444444-4444-4444-4444-444444444444', 'barbeiro@teste.com'),
  ('55555555-5555-5555-5555-555555555555', 'rival@teste.com');

-- Próximo dia útil (seg a sex) no fuso de São Paulo
select (d)::date as dia from (
  select (now() at time zone 'America/Sao_Paulo')::date + i as d from generate_series(1, 8) i
) x where extract(dow from d) between 1 and 5 limit 1 \gset
select (d)::date as domingo from (
  select (now() at time zone 'America/Sao_Paulo')::date + i as d from generate_series(1, 8) i
) x where extract(dow from d) = 0 limit 1 \gset

\echo '--- Dono cria a barbearia'
select public.t_as('authenticated', '11111111-1111-1111-1111-111111111111', 'dono@teste.com');
set role authenticated;
select public.t_ok(public.slug_available('greybarber'), 'endereço livre antes de criar');
select public.t_ok(not public.slug_available('demo'), 'endereço reservado bloqueado');
select public.t_ok(not public.slug_available('Ab'), 'endereço curto/maiúsculo inválido');
select id as shop from public.create_shop('Grey Barber', 'GreyBarber', 'Zé Carlos', '(16) 98765-4321') \gset
select public.t_ok(not public.slug_available('greybarber'), 'endereço ocupado depois de criar');
select public.t_err($$select public.create_shop('Outra', 'greybarber', 'X')$$, 'não está disponível', 'não cria com endereço repetido');
select public.t_ok((select count(*) = 5 from public.services where shop_id = :'shop'), 'serviços iniciais criados');
select public.t_ok((select role = 'admin' from public.shop_members where shop_id = :'shop' and user_id = auth.uid()), 'dono é admin');
select id as barber from public.barbers where shop_id = :'shop' limit 1 \gset
select public.t_ok((select count(*) = 1 from public.my_shops()), 'my_shops lista a barbearia');
select public.t_err($$update public.shops set plan = 'premium' where slug = 'greybarber'$$, 'só podem ser alterados pelo suporte', 'dono não muda o próprio plano');
update public.shops set settings = settings || '{"slogan":"Novo slogan"}' where id = :'shop';
select public.t_ok((select settings->>'slogan' = 'Novo slogan' from public.shops where id = :'shop'), 'dono altera configurações');
insert into public.clients (shop_id, name, phone) values (:'shop', 'Walk-in Lucas', '(16) 98888-1111');
reset role;

\echo '--- Visitante anônimo'
select public.t_as('anon', null, null);
set role anon;
select public.t_ok((select count(*) = 1 from public.shops where slug = 'greybarber'), 'anon vê a barbearia');
select public.t_ok((select count(*) = 5 from public.services where shop_id = :'shop'), 'anon vê serviços');
select public.t_ok((select count(*) = 0 from public.clients), 'anon NÃO vê clientes');
select public.t_ok((select count(*) = 0 from public.shop_members), 'anon NÃO vê equipe interna');
insert into public.messages (shop_id, name, email, message) values (:'shop', 'Visitante', 'v@x.com', 'Vocês abrem domingo?');
select public.t_ok((select count(*) = 0 from public.messages), 'anon envia mas NÃO lê mensagens');
select public.t_err($$insert into public.services (shop_id, name, duration, price) values ('$$ || :'shop' || $$', 'Hack', 30, 1)$$, 'row-level security', 'anon não cria serviço');
select public.t_err($$select public.book_appointment('$$ || :'shop' || $$', '$$ || :'barber' || $$', array[(select id from public.services limit 1)], current_date + 1, '10:00')$$, 'Entre na sua conta', 'anon não agenda');
reset role;

\echo '--- Cliente entra e agenda'
select public.t_as('authenticated', '22222222-2222-2222-2222-222222222222', 'cliente@teste.com');
set role authenticated;
select id as client from public.join_shop(:'shop', 'Lucas Andrade', '16 98888-1111') \gset
select public.t_ok((select count(*) = 1 from public.clients), 'cliente vê só o próprio cadastro');
select public.t_ok((select name = 'Lucas Andrade' and user_id = auth.uid() from public.clients where id = :'client'), 'assumiu o cadastro do balcão pelo telefone');
select id as svc_corte from public.services where shop_id = :'shop' and name = 'Corte' \gset
select id as svc_barba from public.services where shop_id = :'shop' and name = 'Barba' \gset
select id as appt from public.book_appointment(:'shop', :'barber', array[:'svc_corte', :'svc_barba']::uuid[], :'dia', '10:00') \gset
select public.t_ok((select duration = 75 and total = 70 and source = 'site' from public.appointments where id = :'appt'), 'preço e duração calculados no servidor');
select public.t_err(format($$select public.book_appointment(%L, %L, array[%L]::uuid[], %L, '10:30')$$, :'shop', :'barber', :'svc_corte', :'dia'), 'acabou de ser ocupado', 'não sobrepõe o próprio horário');
select public.t_err(format($$select public.book_appointment(%L, %L, array[%L]::uuid[], %L, '10:00')$$, :'shop', :'barber', :'svc_corte', :'domingo'), 'não atende neste dia', 'domingo fechado / sem expediente');
select public.t_err(format($$select public.book_appointment(%L, %L, array[%L]::uuid[], %L, '18:45')$$, :'shop', :'barber', :'svc_corte', :'dia'), 'fora do expediente', 'não passa do fechamento');
select public.t_err(format($$select public.book_appointment(%L, %L, array[%L]::uuid[], (%L::date - 7), '10:00')$$, :'shop', :'barber', :'svc_corte', :'dia'), 'Esse horário', 'não agenda no passado');
select public.t_err(format($$select public.book_appointment(%L, %L, array[%L]::uuid[], (%L::date + 63), '10:00')$$, :'shop', :'barber', :'svc_corte', :'dia'), 'ainda não está aberta', 'respeita janela de agendamento');
update public.appointments set total = 1 where id = :'appt';
select public.t_ok((select total = 70 from public.appointments where id = :'appt'), 'cliente não consegue alterar valor (RLS)');
reset role;

\echo '--- Outro cliente'
select public.t_as('authenticated', '33333333-3333-3333-3333-333333333333', 'outro@teste.com');
set role authenticated;
select id as client2 from public.join_shop(:'shop', 'Pedro Costa', '(16) 97777-0000') \gset
select public.t_ok((select count(*) = 0 from public.appointments), 'NÃO vê agendamentos de outros');
select public.t_ok((select count(*) = 1 from public.public_busy(:'shop', :'dia', :'dia')), 'vê o horário ocupado (sem dados do cliente)');
select public.t_err(format($$select public.book_appointment(%L, %L, array[%L]::uuid[], %L, '11:00')$$, :'shop', :'barber', :'svc_corte', :'dia'), 'acabou de ser ocupado', 'dupla marcação bloqueada pelo banco');
select id as appt2 from public.book_appointment(:'shop', :'barber', array[:'svc_corte']::uuid[], :'dia', '11:15') \gset
select public.t_err(format($$select public.cancel_my_appointment(%L)$$, :'appt'), 'não encontrado', 'não cancela horário de outro cliente');
select public.t_ok((select status = 'cancelado' from public.cancel_my_appointment(:'appt2')), 'função de cancelamento responde');
select public.t_ok((select status = 'cancelado' from public.appointments where id = :'appt2'), 'cancela o próprio horário');
select public.t_ok((select count(*) = 0 from public.messages), 'cliente não lê mensagens');
reset role;

\echo '--- Dono: equipe, bloqueios, convite e conclusão'
select public.t_as('authenticated', '11111111-1111-1111-1111-111111111111', 'dono@teste.com');
set role authenticated;
select public.t_ok((select count(*) = 2 from public.clients where shop_id = :'shop'), 'dono vê todos os clientes');
select public.t_ok((select count(*) = 2 from public.appointments where shop_id = :'shop'), 'dono vê todos os agendamentos');
select public.t_ok((select count(*) = 1 from public.messages where shop_id = :'shop'), 'dono lê mensagens');
insert into public.blocks (shop_id, barber_id, date, start_time, end_time, reason) values (:'shop', :'barber', :'dia', '14:00', '15:00', 'Consulta médica');
insert into public.barbers (shop_id, name) values (:'shop', 'Rodrigo') returning id as barber2 \gset
insert into public.shop_invites (shop_id, email, barber_id, name) values (:'shop', 'barbeiro@teste.com', :'barber2', 'Rodrigo');
update public.appointments set status = 'concluido', payment_method = 'pix' where id = :'appt';
insert into public.appointments (shop_id, client_id, barber_id, date, start_time, duration, total, status, overbook)
  values (:'shop', :'client', :'barber', :'dia', '10:00', 30, 30, 'confirmado', true);
select public.t_ok(true, 'encaixe (overbook) permitido para a equipe');
select public.t_err(format($$insert into public.appointments (shop_id, client_id, barber_id, date, start_time, duration) values (%L, %L, %L, %L, '10:30', 30)$$, :'shop', :'client', :'barber', :'dia'), 'appointments_no_overlap', 'equipe sem encaixe não sobrepõe');
reset role;

\echo '--- Barbeiro convidado'
select public.t_as('authenticated', '44444444-4444-4444-4444-444444444444', 'barbeiro@teste.com');
set role authenticated;
select public.t_ok(public.accept_invites() = 1, 'convite aceito no login');
select public.t_ok(public.shop_role(:'shop') = 'barbeiro', 'entrou como barbeiro');
select public.t_ok((select count(*) = 2 from public.clients where shop_id = :'shop'), 'barbeiro vê clientes');
select public.t_ok((select count(*) = 0 from public.messages), 'barbeiro NÃO lê mensagens (só admin)');
update public.services set price = 1 where shop_id = :'shop';
select public.t_ok((select bool_and(price > 1) from public.services where shop_id = :'shop'), 'barbeiro não altera preços');
reset role;

\echo '--- Cliente: bloqueio, avaliação, perfil'
select public.t_as('authenticated', '22222222-2222-2222-2222-222222222222', 'cliente@teste.com');
set role authenticated;
select public.t_err(format($$select public.book_appointment(%L, %L, array[%L]::uuid[], %L, '14:30')$$, :'shop', :'barber', :'svc_corte', :'dia'), 'bloqueado', 'respeita bloqueio de agenda');
select public.t_ok((select count(*) = 1 from public.add_review(:'appt', 5, 'Corte perfeito')), 'avalia atendimento concluído');
select public.t_err(format($$select public.add_review(%L, 4, 'De novo')$$, :'appt'), 'já avaliou', 'não avalia duas vezes');
select public.t_ok((select name = 'Lucas A.' from public.update_my_profile(:'shop', 'Lucas A.', '(16) 98888-1111', null)), 'atualiza o próprio perfil');
reset role;

\echo '--- Barbearia rival não enxerga nada'
select public.t_as('authenticated', '55555555-5555-5555-5555-555555555555', 'rival@teste.com');
set role authenticated;
select id as rival from public.create_shop('Rival Cortes', 'rival-cortes', 'Rival') \gset
select public.t_ok((select count(*) = 0 from public.clients where shop_id = :'shop'), 'rival NÃO vê clientes de outra barbearia');
select public.t_ok((select count(*) = 0 from public.appointments where shop_id = :'shop'), 'rival NÃO vê agenda de outra barbearia');
update public.shops set name = 'Hackeada' where id = :'shop';
select public.t_ok((select name = 'Grey Barber' from public.shops where id = :'shop'), 'rival NÃO altera outra barbearia');
select public.t_err(format($$insert into public.blocks (shop_id, date, start_time, end_time) values (%L, current_date, '09:00', '10:00')$$, :'shop'), 'row-level security', 'rival não bloqueia agenda alheia');
reset role;

\echo '--- Plano e teste grátis (como service role / cobrança)'
select public.t_as('service_role', null, null);
update public.shops set plan = 'solo' where id = :'shop';
select public.t_as('authenticated', '11111111-1111-1111-1111-111111111111', 'dono@teste.com');
set role authenticated;
select public.t_err(format($$insert into public.barbers (shop_id, name) values (%L, 'Terceiro')$$, :'shop'), 'Seu plano permite', 'limite de profissionais do plano');
reset role;
select public.t_as('service_role', null, null);
update public.shops set status = 'trialing', trial_ends_at = now() - interval '1 day' where id = :'shop';
select public.t_as('authenticated', '22222222-2222-2222-2222-222222222222', 'cliente@teste.com');
set role authenticated;
select public.t_err(format($$select public.book_appointment(%L, %L, array[%L]::uuid[], %L, '16:00')$$, :'shop', :'barber', :'svc_corte', :'dia'), 'pausado', 'teste vencido pausa agendamento online');
reset role;

\echo '=== TODOS OS TESTES PASSARAM ==='
