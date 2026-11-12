-- Giai đoạn 1.5: viết content sản phẩm + phân quyền admin / nhân viên.
--
-- SAU KHI CHẠY: gán vai trò cho từng tài khoản (Claude chạy bằng script, hoặc tự chạy):
--   insert into profiles (user_id, role) select id, 'admin' from auth.users where email = '<email admin>';
--   insert into profiles (user_id, role) select id, 'staff' from auth.users where email = '<email nhân viên>';
-- Tài khoản chưa có vai trò thì không thấy dữ liệu nào.

-- ───────────── Vai trò ─────────────
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'staff')),
  display_name text,
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;
create policy "read_own" on profiles for select to authenticated using (user_id = auth.uid());

create or replace function public.app_role() returns text
  language sql stable security definer set search_path = public
  as $$ select role from profiles where user_id = auth.uid() $$;

create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public
  as $$ select coalesce(app_role() = 'admin', false) $$;

create or replace function public.can_write_products() returns boolean
  language sql stable security definer set search_path = public
  as $$ select coalesce(app_role() in ('admin', 'staff'), false) $$;

-- Các bảng giai đoạn 1: chỉ admin (trước đây: mọi tài khoản đăng nhập)
do $$
declare t text;
begin
  foreach t in array array['sources','raw_items','stories','story_items','matches','digests','suggestions',
                           'feedback','players','boot_lines','glossary','media_assets','settings','captions']
  loop
    execute format('drop policy if exists "owner_all" on %I', t);
    execute format('create policy "admin_all" on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- Chi phí AI: admin xem tất cả; nhân viên chỉ ghi (khi viết sản phẩm)
drop policy if exists "owner_all" on llm_calls;
create policy "admin_all" on llm_calls for all to authenticated using (is_admin()) with check (is_admin());
create policy "staff_insert" on llm_calls for insert to authenticated with check (can_write_products());

-- Tổng chi phí AI hôm nay (giờ VN) — để chặn theo trần ngân sách mà không cần cho nhân viên đọc bảng chi phí
create or replace function public.ai_spent_today() returns numeric
  language sql stable security definer set search_path = public
  as $$ select coalesce(sum(cost_usd), 0) from llm_calls
        where created_at >= (date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh') $$;

-- Trần ngân sách đọc từ settings (nhân viên không đọc được bảng settings)
create or replace function public.ai_daily_budget() returns numeric
  language sql stable security definer set search_path = public
  as $$ select coalesce((select (value #>> '{}')::numeric from settings where key = 'daily_budget_usd'), 3) $$;

-- ───────────── Dữ liệu từ website (WooCommerce) ─────────────
create table woo_categories (
  id bigint primary key,
  name text not null,
  slug text not null,
  parent bigint,
  link text not null,
  count int not null default 0,
  synced_at timestamptz not null default now()
);

-- Kho mô tả mẫu: sản phẩm đã đăng trên web, dùng làm mẫu văn phong
create table product_examples (
  woo_id bigint primary key,
  name text not null,
  sku text,
  link text not null,
  category_ids bigint[] not null default '{}',
  short_description text,
  description_html text,
  yoast_title text,
  yoast_meta text,
  tags text[] not null default '{}',
  modified_at timestamptz,
  is_gold boolean not null default false,          -- mẫu chuẩn admin chọn
  synced_at timestamptz not null default now()
);

-- ───────────── Sản phẩm đang viết ─────────────
create table products (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  type text not null check (type in ('boots', 'ball', 'gloves', 'accessory')),
  name text not null,
  sku text,
  price numeric,
  sizes text[] not null default '{}',
  spec jsonb not null default '{}',                -- phiếu nhập: các ô thông số theo loại sản phẩm
  notes text,                                      -- ý chính khác
  research jsonb,                                  -- kết quả "Tìm thêm thông tin": { facts: [{ field, value, source_url, source_title }], at }
  output jsonb,                                    -- bản viết hiện tại (các ô WooCommerce)
  category_ids bigint[] not null default '{}',     -- danh mục đã xác nhận
  job text check (job in ('generate', 'research')),
  job_status text not null default 'idle' check (job_status in ('idle', 'queued', 'running', 'done', 'failed')),
  job_error text,
  job_started_at timestamptz,
  woo_product_id bigint,
  woo_edit_url text,
  pushed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_created_idx on products (created_at desc);

-- Lịch sử: mỗi bản AI viết và mỗi bản người sửa (dữ liệu học văn phong cho 1.5b)
create table product_revisions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  kind text not null check (kind in ('ai', 'edit')),
  output jsonb not null,
  instruction text,                                -- yêu cầu khi bấm "Viết lại"
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table woo_categories enable row level security;
alter table product_examples enable row level security;
alter table products enable row level security;
alter table product_revisions enable row level security;

create policy "read" on woo_categories for select to authenticated using (can_write_products());
create policy "admin_write" on woo_categories for all to authenticated using (is_admin()) with check (is_admin());
create policy "read" on product_examples for select to authenticated using (can_write_products());
create policy "admin_write" on product_examples for all to authenticated using (is_admin()) with check (is_admin());
create policy "team_all" on products for all to authenticated using (can_write_products()) with check (can_write_products());
create policy "team_all" on product_revisions for all to authenticated using (can_write_products()) with check (can_write_products());
