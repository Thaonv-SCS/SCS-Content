-- Lịch sử up ảnh vào mô tả sản phẩm (ai up, mã nào, bao nhiêu ảnh, thêm hay thay).
create table image_uploads (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  woo_id bigint not null,
  sku text,
  name text,
  mode text not null check (mode in ('append', 'replace')),
  added int not null,
  images_before int,
  images_after int,
  media_ids bigint[] not null default '{}',
  created_at timestamptz not null default now()
);
create index image_uploads_created_idx on image_uploads (created_at desc);
alter table image_uploads enable row level security;
create policy "team_all" on image_uploads for all to authenticated using (can_write_products()) with check (can_write_products());
