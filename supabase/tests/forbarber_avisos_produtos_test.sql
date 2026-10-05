-- ============================================================================
-- Testes: avisos no celular da equipe e comanda/estoque de produtos
-- Roda depois de forbarber_test.sql (usa as funções t_ok, t_err e t_as).
-- ============================================================================
\set ON_ERROR_STOP on
\set QUIET on

-- O envio de verdade (pg_net) não existe aqui: guardamos o que seria enviado
create table public.t_push_log (id serial primary key, payload jsonb not null, at timestamptz default clock_timestamp());
create or replace function public.push_dispatch(p_payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.t_push_log (payload) values (p_payload);
end $$;
grant select on public.t_push_log to anon, authenticated;

insert into auth.users (id, email) values
  ('66666666-6666-6666-6666-666666666666', 'dona@nova.com'),
  ('77777777-7777-7777-7777-777777777777', 'barbeira@nova.com'),
  ('88888888-8888-8888-8888-888888888888', 'cliente@nova.com'),
  ('99999999-9999-9999-9999-999999999999', 'curioso@nova.com');

select (d)::date as dia from (
  select (now() at time zone 'America/Sao_Paulo')::date + i as d from generate_series(2, 9) i
) x where extract(dow from d) between 1 and 5 limit 1 \gset

\echo '--- Nova barbearia com dona, barbeira e cliente'
select public.t_as('authenticated', '66666666-6666-6666-6666-666666666666', 'dona@nova.com');
set role authenticated;
select id as shop from public.create_shop('Navalha Nova', 'navalha-nova', 'Ana Dona', '(11) 90000-0000') \gset
select id as barber_ana from public.barbers where shop_id = :'shop' limit 1 \gset
insert into public.barbers (shop_id, name) values (:'shop', 'Bia Barbeira') returning id as barber_bia \gset
select id as svc from public.services where shop_id = :'shop' order by position limit 1 \gset
insert into public.shop_invites (shop_id, email, barber_id, name) values (:'shop', 'barbeira@nova.com', :'barber_bia', 'Bia');
reset role;
select public.t_as('authenticated', '77777777-7777-7777-7777-777777777777', 'barbeira@nova.com');
set role authenticated;
select public.accept_invites() as ignore \gset
reset role;
select public.t_as('authenticated', '88888888-8888-8888-8888-888888888888', 'cliente@nova.com');
set role authenticated;
select 1 as ignore from public.join_shop(:'shop', 'Caio Cliente', '(11) 91111-1111') \gset
reset role;

\echo '--- Celular da equipe'
select public.t_as('authenticated', '66666666-6666-6666-6666-666666666666', 'dona@nova.com');
set role authenticated;
select public.register_push_device('token-da-dona-android-0001', 'android');
select public.t_ok((select count(*) = 1 from public.push_devices), 'dona registra o celular e vê só o dela');
reset role;
select public.t_as('authenticated', '77777777-7777-7777-7777-777777777777', 'barbeira@nova.com');
set role authenticated;
select public.register_push_device('token-da-bia-iphone-000001', 'ios');
select public.t_ok((select count(*) = 1 and min(token) = 'token-da-bia-iphone-000001' from public.push_devices), 'barbeira NÃO vê o celular da dona');
select public.t_err($$insert into public.push_devices (token, user_id, platform) values ('token-forjado-0000000001', '66666666-6666-6666-6666-666666666666', 'ios')$$, 'row-level security', 'ninguém grava aparelho direto na tabela');
select public.t_err($$select public.register_push_device('curto', 'ios')$$, 'Aparelho inválido', 'token inválido recusado');
reset role;
select public.t_as('authenticated', '99999999-9999-9999-9999-999999999999', 'curioso@nova.com');
set role authenticated;
select public.t_err($$select public.register_push_device('token-de-quem-nao-e-equipe', 'android')$$, 'Só a equipe', 'quem não é da equipe não registra celular');
select public.t_err($$select * from public.push_recipients('00000000-0000-0000-0000-000000000000', 'novo', null, null, null)$$, 'permission denied', 'lista de destinatários é só do servidor');
reset role;

\echo '--- Quem recebe o aviso'
select public.t_ok((select count(*) = 2 from public.push_recipients(:'shop', 'novo', :'barber_bia', null, null)), 'horário da Bia: avisa Bia e a dona');
select public.t_ok((select array_agg(user_id) = array['77777777-7777-7777-7777-777777777777'::uuid] from public.push_recipients(:'shop', 'novo', :'barber_bia', null, '66666666-6666-6666-6666-666666666666')), 'quem fez a ação não recebe o próprio aviso');
select public.t_ok((select array_agg(user_id) = array['66666666-6666-6666-6666-666666666666'::uuid] from public.push_recipients(:'shop', 'novo', :'barber_ana', null, null)), 'horário da Ana: a Bia não recebe (só os dela)');
select public.t_as('authenticated', '77777777-7777-7777-7777-777777777777', 'barbeira@nova.com');
set role authenticated;
select 1 as ignore from public.set_my_push_prefs(:'shop', true, false, true) \gset
reset role;
select public.t_ok((select count(*) = 2 from public.push_recipients(:'shop', 'novo', :'barber_ana', null, null)), 'Bia pediu toda a barbearia: recebe o horário da Ana');
select public.t_ok((select count(*) = 1 from public.push_recipients(:'shop', 'cancelado', :'barber_bia', null, null)), 'Bia desligou cancelamentos: só a dona recebe');
select public.t_ok((select count(*) = 0 from public.push_recipients(:'shop', 'novo', :'barber_bia', null, null) r where r.token like 'token-de-quem%'), 'aparelho de fora nunca entra');

\echo '--- Agenda dispara os avisos'
select public.t_as('authenticated', '88888888-8888-8888-8888-888888888888', 'cliente@nova.com');
set role authenticated;
select id as appt from public.book_appointment(:'shop', :'barber_bia', array[:'svc']::uuid[], :'dia', '10:00') \gset
reset role;
select public.t_ok((select payload ->> 'event' = 'novo' and payload ->> 'appointment_id' = :'appt' and payload ->> 'actor' = '88888888-8888-8888-8888-888888888888'
  from public.t_push_log order by id desc limit 1), 'agendamento pelo site avisa "novo"');
select count(*) as n0 from public.t_push_log \gset
select public.t_as('authenticated', '88888888-8888-8888-8888-888888888888', 'cliente@nova.com');
set role authenticated;
select id as appt2 from public.book_appointment(:'shop', :'barber_bia', array[:'svc']::uuid[], :'dia', '15:00', '', :'appt') \gset
reset role;
select public.t_ok((select count(*) = :n0 + 1 from public.t_push_log), 'remarcação vira UM aviso só');
select public.t_ok((select payload ->> 'event' = 'remarcado' and payload -> 'previous' ->> 'start' = '10:00' and payload ->> 'appointment_id' = :'appt2'
  from public.t_push_log order by id desc limit 1), 'aviso de remarcação traz o horário antigo');
select public.t_as('authenticated', '66666666-6666-6666-6666-666666666666', 'dona@nova.com');
set role authenticated;
update public.appointments set barber_id = :'barber_ana', start_time = '16:00' where id = :'appt2';
reset role;
select public.t_ok((select payload ->> 'event' = 'alterado' and payload ->> 'old_barber_id' = :'barber_bia' and payload ->> 'actor' = '66666666-6666-6666-6666-666666666666'
  from public.t_push_log order by id desc limit 1), 'dona troca barbeiro e hora: "alterado" avisa também quem perdeu o horário');
select count(*) as n1 from public.t_push_log \gset
select public.t_as('authenticated', '66666666-6666-6666-6666-666666666666', 'dona@nova.com');
set role authenticated;
update public.appointments set notes = 'Trazer referência' where id = :'appt2';
reset role;
select public.t_ok((select count(*) = :n1 from public.t_push_log), 'mudar só a observação não avisa ninguém');
select public.t_as('authenticated', '88888888-8888-8888-8888-888888888888', 'cliente@nova.com');
set role authenticated;
select 1 as ignore from public.cancel_my_appointment(:'appt2') \gset
reset role;
select public.t_ok((select payload ->> 'event' = 'cancelado' from public.t_push_log order by id desc limit 1), 'cancelamento do cliente avisa "cancelado"');

\echo '--- Sair do celular'
select public.t_as('authenticated', '66666666-6666-6666-6666-666666666666', 'dona@nova.com');
set role authenticated;
select public.unregister_push_device('token-da-bia-iphone-000001');
select public.unregister_push_device('token-da-dona-android-0001');
select public.t_ok((select count(*) = 0 from public.push_devices), 'dona tira o próprio celular');
reset role;
select public.t_ok((select count(*) = 1 from public.push_devices), 'mas não consegue tirar o celular da Bia');

\echo '--- Produtos e estoque'
select public.t_as('authenticated', '66666666-6666-6666-6666-666666666666', 'dona@nova.com');
set role authenticated;
insert into public.products (shop_id, name, category, price, cost, stock, min_stock)
values (:'shop', 'Pomada modeladora', 'Cabelo', 45, 22, 10, 3) returning id as pomada \gset
insert into public.products (shop_id, name, category, price, stock) values (:'shop', 'Óleo para barba', 'Barba', 39, 1) returning id as oleo \gset
reset role;
select public.t_as('authenticated', '77777777-7777-7777-7777-777777777777', 'barbeira@nova.com');
set role authenticated;
select public.t_ok((select count(*) = 2 from public.products), 'barbeira vê os produtos para vender');
update public.products set price = 1 where id = :'pomada';
select public.t_ok((select price = 45 from public.products where id = :'pomada'), 'barbeira NÃO muda preço do produto');
select public.t_err(format($$insert into public.sales (shop_id, items, total, payment_method, date) values (%L, '[]', 0, 'pix', current_date)$$, :'shop'), 'row-level security', 'venda não é gravada direto na tabela');
select id as venda1 from public.register_sale(:'shop', format('[{"product_id":"%s","qty":2},{"product_id":"%s","qty":1,"price":35}]', :'pomada', :'oleo')::jsonb,
  'pix', null, :'barber_bia') \gset
select public.t_ok((select total = 125 and jsonb_array_length(items) = 2 and created_by = auth.uid() from public.sales where id = :'venda1'), 'venda soma itens e aceita desconto no item (2x45 + 35)');
select public.t_ok((select stock = 8 from public.products where id = :'pomada') and (select stock = 0 from public.products where id = :'oleo'), 'venda baixa o estoque');
select id as venda2 from public.register_sale(:'shop', format('[{"product_id":"%s","qty":1}]', :'oleo')::jsonb, 'dinheiro') \gset
select public.t_ok((select stock = -1 from public.products where id = :'oleo'), 'sem estoque ainda vende (contagem errada não trava o balcão)');
select public.t_err(format($$select public.register_sale(%L, '[{"product_id":"%s","qty":0}]', 'pix')$$, :'shop', :'pomada'), 'Quantidade inválida', 'quantidade zero recusada');
select public.t_err(format($$select public.register_sale(%L, '[{"product_id":"%s","qty":1}]', 'cheque')$$, :'shop', :'pomada'), 'forma de pagamento', 'forma de pagamento inválida recusada');
select public.t_err(format($$select public.cancel_sale(%L)$$, :'venda1'), 'não encontrada', 'barbeira NÃO cancela venda');
select public.t_err(format($$select public.add_stock(%L, 5)$$, :'pomada'), 'não encontrado', 'barbeira NÃO lança entrada de estoque');
reset role;

select public.t_as('authenticated', '66666666-6666-6666-6666-666666666666', 'dona@nova.com');
set role authenticated;
select 1 as ignore from public.cancel_sale(:'venda1') \gset
select public.t_ok((select status = 'cancelada' from public.sales where id = :'venda1'), 'dona cancela a venda');
select public.t_ok((select stock = 10 from public.products where id = :'pomada') and (select stock = 0 from public.products where id = :'oleo'), 'cancelar devolve ao estoque');
select 1 as ignore from public.cancel_sale(:'venda1') \gset
select public.t_ok((select stock = 10 from public.products where id = :'pomada'), 'cancelar de novo não devolve em dobro');
select 1 as ignore from public.add_stock(:'oleo', 12) \gset
select public.t_ok((select stock = 12 from public.products where id = :'oleo'), 'entrada de mercadoria soma ao estoque');
reset role;

select public.t_as('authenticated', '88888888-8888-8888-8888-888888888888', 'cliente@nova.com');
set role authenticated;
select public.t_ok((select count(*) = 0 from public.products), 'cliente NÃO vê estoque nem custo');
select public.t_ok((select count(*) = 0 from public.sales), 'cliente NÃO vê vendas');
select public.t_err(format($$select public.register_sale(%L, '[{"product_id":"%s","qty":1}]', 'pix')$$, :'shop', :'pomada'), 'Só a equipe', 'cliente NÃO registra venda');
reset role;
select public.t_as('authenticated', '55555555-5555-5555-5555-555555555555', 'rival@teste.com');
set role authenticated;
select public.t_ok((select count(*) = 0 from public.products where shop_id = :'shop'), 'barbearia rival NÃO vê os produtos');
select public.t_err(format($$select public.register_sale(%L, '[{"product_id":"%s","qty":1}]', 'pix')$$, :'shop', :'pomada'), 'Só a equipe', 'rival NÃO vende no estoque dos outros');
reset role;

\echo '=== TODOS OS TESTES PASSARAM ==='
