-- ============================================================================
-- ForBarber — produtos, estoque e vendas (comanda do atendimento e balcão)
-- Roda depois de 20261005000000_forbarber_avisos_equipe.sql.
-- Venda e cancelamento passam por funções que travam o produto e mexem no
-- estoque na mesma transação: dois celulares vendendo ao mesmo tempo não
-- deixam o estoque errado.
-- ============================================================================

create table public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  category text not null default '' check (char_length(category) <= 40),
  price numeric(10, 2) not null check (price >= 0),
  cost numeric(10, 2) check (cost is null or cost >= 0),
  -- Pode ficar negativo: a venda no balcão não trava por contagem errada (o painel avisa)
  stock int not null default 0 check (stock between -9999 and 99999),
  min_stock int not null default 0 check (min_stock between 0 and 9999),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (id, shop_id)
);
create index products_shop_idx on public.products (shop_id);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  barber_id uuid references public.barbers (id) on delete set null,
  appointment_id uuid references public.appointments (id) on delete set null,
  items jsonb not null default '[]'::jsonb, -- [{ product_id, name, price, qty }] com o preço da época
  total numeric(10, 2) not null check (total >= 0),
  payment_method text not null check (payment_method in ('pix', 'credito', 'debito', 'dinheiro')),
  status text not null default 'ok' check (status in ('ok', 'cancelada')),
  date date not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index sales_shop_date_idx on public.sales (shop_id, date);
create index sales_appointment_idx on public.sales (appointment_id) where appointment_id is not null;

create trigger products_updated before update on public.products for each row execute function public.set_updated_at();
create trigger sales_updated before update on public.sales for each row execute function public.set_updated_at();

alter table public.products enable row level security;
alter table public.sales enable row level security;

-- Produtos: a equipe vê (para vender); só o dono cadastra e edita
create policy products_staff_read on public.products for select using (public.is_staff(shop_id));
create policy products_admin_write on public.products for all using (public.is_admin(shop_id)) with check (public.is_admin(shop_id));
-- Vendas: a equipe vê; gravar só pelas funções abaixo
create policy sales_staff_read on public.sales for select using (public.is_staff(shop_id));

/** Registra uma venda e baixa o estoque. p_items: [{ "product_id": "...", "qty": 1, "price": 45.00 }]
    (price é opcional: sem ele vale o preço cadastrado; com ele, a equipe dá desconto) */
create or replace function public.register_sale(
  p_shop uuid, p_items jsonb, p_payment text,
  p_client uuid default null, p_barber uuid default null, p_appointment uuid default null, p_date date default null
) returns public.sales
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_product public.products;
  v_qty int;
  v_price numeric;
  v_lines jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_tz text;
  v_row public.sales;
begin
  if not public.is_staff(p_shop) then
    raise exception 'Só a equipe da barbearia registra vendas.' using errcode = '42501';
  end if;
  if p_payment is null or p_payment not in ('pix', 'credito', 'debito', 'dinheiro') then
    raise exception 'Escolha a forma de pagamento.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'Escolha pelo menos um produto.';
  end if;
  if p_client is not null and not exists (select 1 from public.clients where id = p_client and shop_id = p_shop) then
    raise exception 'Cliente não encontrado.';
  end if;
  if p_barber is not null and not exists (select 1 from public.barbers where id = p_barber and shop_id = p_shop) then
    raise exception 'Profissional não encontrado.';
  end if;
  if p_appointment is not null and not exists (select 1 from public.appointments where id = p_appointment and shop_id = p_shop) then
    raise exception 'Atendimento não encontrado.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from public.products
    where id = (v_item ->> 'product_id')::uuid and shop_id = p_shop and active
    for update;
    if not found then raise exception 'Um dos produtos não está mais à venda. Atualize a página.'; end if;
    v_qty := coalesce((v_item ->> 'qty')::int, 0);
    if v_qty < 1 or v_qty > 999 then raise exception 'Quantidade inválida para %.', v_product.name; end if;
    v_price := coalesce((v_item ->> 'price')::numeric, v_product.price);
    if v_price < 0 then raise exception 'Preço inválido para %.', v_product.name; end if;
    v_price := round(v_price, 2);
    update public.products set stock = stock - v_qty where id = v_product.id;
    v_lines := v_lines || jsonb_build_object('product_id', v_product.id, 'name', v_product.name, 'price', v_price, 'qty', v_qty);
    v_total := v_total + v_price * v_qty;
  end loop;

  select coalesce(settings ->> 'timezone', 'America/Sao_Paulo') into v_tz from public.shops where id = p_shop;
  insert into public.sales (shop_id, client_id, barber_id, appointment_id, items, total, payment_method, date, created_by)
  values (p_shop, p_client, p_barber, p_appointment, v_lines, round(v_total, 2), p_payment,
          coalesce(p_date, (now() at time zone v_tz)::date), auth.uid())
  returning * into v_row;
  return v_row;
end $$;

/** Cancela a venda (só o dono) e devolve os itens ao estoque */
create or replace function public.cancel_sale(p_id uuid) returns public.sales
language plpgsql security definer set search_path = public as $$
declare
  v_row public.sales;
  v_item jsonb;
begin
  select * into v_row from public.sales where id = p_id for update;
  if not found or not public.is_admin(v_row.shop_id) then
    raise exception 'Venda não encontrada.';
  end if;
  if v_row.status = 'cancelada' then return v_row; end if;
  for v_item in select * from jsonb_array_elements(v_row.items) loop
    update public.products set stock = stock + (v_item ->> 'qty')::int
    where id = (v_item ->> 'product_id')::uuid and shop_id = v_row.shop_id;
  end loop;
  update public.sales set status = 'cancelada' where id = p_id returning * into v_row;
  return v_row;
end $$;

/** Entrada de mercadoria: soma ao estoque sem sobrescrever vendas feitas no meio-tempo */
create or replace function public.add_stock(p_product uuid, p_qty int) returns public.products
language plpgsql security definer set search_path = public as $$
declare
  v_row public.products;
begin
  select * into v_row from public.products where id = p_product for update;
  if not found or not public.is_admin(v_row.shop_id) then
    raise exception 'Produto não encontrado.';
  end if;
  if p_qty is null or p_qty = 0 or abs(p_qty) > 9999 then raise exception 'Quantidade inválida.'; end if;
  update public.products set stock = stock + p_qty where id = p_product returning * into v_row;
  return v_row;
end $$;

-- O painel atualiza sozinho quando outro aparelho vende ou mexe no estoque
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.products, public.sales;
  end if;
end $$;
