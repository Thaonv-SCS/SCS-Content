-- Giai đoạn 1.5b: nhập nhiều màu một lần (lô), học văn phong từ bản sửa, giá khuyến mãi, chi phí theo người.

-- ───────────── Lô sản phẩm (cùng mẫu, nhiều màu) ─────────────
create table product_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  type text not null check (type in ('boots', 'ball', 'gloves', 'accessory')),
  base_name text not null,                         -- tên chung, vd "Nike Phantom 6 Low Academy TF"
  price numeric,
  sale_price numeric,
  sizes text[] not null default '{}',
  spec jsonb not null default '{}',                -- phiếu thông số chung
  notes text,
  research jsonb,                                  -- "Tìm thêm" chạy 1 lần cho cả lô
  job text check (job in ('generate', 'research')),
  job_status text not null default 'idle' check (job_status in ('idle', 'queued', 'running', 'done', 'failed')),
  job_error text,
  job_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table product_batches enable row level security;
create policy "team_all" on product_batches for all to authenticated using (can_write_products()) with check (can_write_products());

alter table products add column batch_id uuid references product_batches(id) on delete set null;
alter table products add column color text;            -- phối màu, vd "trắng/ xanh"
alter table products add column sale_price numeric;    -- giá khuyến mãi
create index products_batch_idx on products (batch_id);

-- ───────────── Ghi chú văn phong sản phẩm (học từ bản người sửa) ─────────────
create table product_style (
  id int primary key default 1 check (id = 1),
  notes text not null default '',                  -- các luật văn phong, mỗi dòng một luật
  edits_used int not null default 0,               -- số bản sửa đã dùng ở lần rút luật gần nhất
  job_status text not null default 'idle' check (job_status in ('idle', 'running', 'done', 'failed')),
  job_error text,
  updated_at timestamptz not null default now()
);
insert into product_style default values;
alter table product_style enable row level security;
create policy "team_read" on product_style for select to authenticated using (can_write_products());
-- nhân viên cũng được ghi: việc rút luật tự động chạy bằng quyền của người đang bấm viết
create policy "team_write" on product_style for update to authenticated using (can_write_products()) with check (can_write_products());

-- ───────────── Chi phí AI theo người ─────────────
alter table llm_calls add column created_by uuid references auth.users(id) on delete set null default auth.uid();
create index llm_calls_created_idx on llm_calls (created_at desc);

-- Admin xem được tên mọi tài khoản (để hiện chi phí theo người)
update profiles p set display_name = u.email from auth.users u where u.id = p.user_id and p.display_name is null;
create policy "admin_read" on profiles for select to authenticated using (is_admin());
