-- Cập nhật tình trạng hàng / ẩn hiện trên web từ app: lịch sử từng lần đổi để xem lại và hoàn tác.
create table stock_changes (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,                           -- một lần bấm "Cập nhật"
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  woo_id bigint not null,
  sku text,
  name text,
  old_stock text,
  new_stock text,
  old_visibility text,
  new_visibility text,
  undo_of uuid,                                   -- lần này là hoàn tác của run nào
  undone_at timestamptz,                          -- đã được hoàn tác
  created_at timestamptz not null default now()
);
create index stock_changes_run_idx on stock_changes (run_id);
create index stock_changes_created_idx on stock_changes (created_at desc);

alter table stock_changes enable row level security;
create policy "team_all" on stock_changes for all to authenticated using (can_write_products()) with check (can_write_products());
