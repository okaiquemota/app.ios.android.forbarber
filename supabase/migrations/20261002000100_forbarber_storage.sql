-- ============================================================================
-- ForBarber — arquivos (logo, foto de capa, fotos da equipe)
-- Bucket público para leitura; só o admin da barbearia grava na pasta dela:
--   shop-assets/<shop_id>/arquivo.jpg
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-assets', 'shop-assets', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create or replace function public.can_write_shop_asset(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_admin(split_part(p_name, '/', 1)::uuid)
    else false
  end
$$;

create policy "shop assets public read" on storage.objects
  for select using (bucket_id = 'shop-assets');
create policy "shop assets admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'shop-assets' and public.can_write_shop_asset(name));
create policy "shop assets admin update" on storage.objects
  for update to authenticated using (bucket_id = 'shop-assets' and public.can_write_shop_asset(name));
create policy "shop assets admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'shop-assets' and public.can_write_shop_asset(name));
