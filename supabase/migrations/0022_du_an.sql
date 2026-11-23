-- Dự án video — giai đoạn A2: dự án + các bước (ý tưởng → kế hoạch → kịch bản), mỗi bước giữ mọi phiên bản.
-- Kế hoạch: docs/KE-HOACH-DU-AN-VIDEO.md. Cần chạy 0020 trước.
--
-- Chế độ: 'duyet' = dừng chờ duyệt ở mỗi bước · 'nhanh' = tự chạy hết tới kịch bản (AI tự chọn góc đề xuất).
-- trang_thai: dang-lam (AI đang chạy) · cho-duyet (chờ người ở bước buoc) · xong · loi · huy

create table du_an (
  id uuid primary key default gen_random_uuid(),
  ten text not null,
  -- {y_tuong, muc_tieu, san_pham_links[], nen_tang[], khuon (mã hoặc null = AI chọn), ghi_chu}
  brief jsonb not null default '{}'::jsonb,
  -- dữ kiện sản phẩm lấy từ web lúc chạy bước ý tưởng (nguồn chuẩn cho các bước sau)
  san_pham jsonb not null default '[]'::jsonb,
  che_do text not null default 'duyet' check (che_do in ('duyet', 'nhanh')),
  buoc text not null default 'y-tuong' check (buoc in ('y-tuong', 'ke-hoach', 'kich-ban')),
  trang_thai text not null default 'dang-lam' check (trang_thai in ('dang-lam', 'cho-duyet', 'xong', 'loi', 'huy')),
  thong_bao text,
  job_started_at timestamptz,
  tao_boi uuid references auth.users(id) on delete set null default auth.uid(),
  tao_luc timestamptz not null default now(),
  cap_nhat_luc timestamptz not null default now()
);
create index du_an_moi_nhat on du_an (tao_luc desc);
alter table du_an enable row level security;
-- Quyền theo bước được kiểm tra ở từng thao tác của app (giai đoạn A3 thêm màn giao quyền); database chặn ở mức module.
create policy "xem" on du_an for select to authenticated using (du_an_co_quyen());
create policy "tao" on du_an for insert to authenticated with check (du_an_co_quyen('y-tuong', 'lam'));
create policy "sua" on du_an for update to authenticated using (du_an_co_quyen()) with check (du_an_co_quyen());
create policy "admin_xoa" on du_an for delete to authenticated using (is_admin());

-- Mỗi lần AI viết / người sửa một bước = 1 phiên bản. Phiên bản mới nhất của bước là bản đang dùng.
create table du_an_phien_ban (
  id uuid primary key default gen_random_uuid(),
  du_an_id uuid not null references du_an(id) on delete cascade,
  buoc text not null check (buoc in ('y-tuong', 'ke-hoach', 'kich-ban')),
  nguon text not null default 'ai' check (nguon in ('ai', 'sua-tay')),
  noi_dung jsonb not null,
  -- yêu cầu / ghi chú dẫn tới bản này (góp ý khi bấm viết lại, lựa chọn khi duyệt bước trước)
  yeu_cau text,
  -- lựa chọn khi duyệt (vd góc được chọn ở bước ý tưởng) + ghi chú duyệt
  duyet jsonb,
  duyet_boi uuid references auth.users(id) on delete set null,
  duyet_luc timestamptz,
  model text,
  tao_boi uuid references auth.users(id) on delete set null default auth.uid(),
  tao_luc timestamptz not null default now()
);
create index du_an_phien_ban_moi on du_an_phien_ban (du_an_id, buoc, tao_luc desc);
alter table du_an_phien_ban enable row level security;
create policy "xem" on du_an_phien_ban for select to authenticated using (du_an_co_quyen());
create policy "ghi" on du_an_phien_ban for insert to authenticated with check (du_an_co_quyen());
create policy "sua" on du_an_phien_ban for update to authenticated using (du_an_co_quyen()) with check (du_an_co_quyen());
create policy "admin_xoa" on du_an_phien_ban for delete to authenticated using (is_admin());

-- Chi phí AI theo dự án
alter table llm_calls add column if not exists du_an_id uuid references du_an(id) on delete set null;
create index if not exists llm_calls_du_an on llm_calls (du_an_id) where du_an_id is not null;

-- Tổng chi phí từng dự án (người có quyền dự án xem được, không cần quyền đọc bảng chi phí)
create or replace function public.du_an_chi_phi(p_ids uuid[]) returns table (du_an_id uuid, usd numeric)
  language sql stable security definer set search_path = public as $$
  select l.du_an_id, sum(l.cost_usd) from llm_calls l
  where du_an_co_quyen() and l.du_an_id = any(p_ids) group by l.du_an_id $$;
revoke execute on function public.du_an_chi_phi(uuid[]) from public, anon;
grant execute on function public.du_an_chi_phi(uuid[]) to authenticated, service_role;

-- Tên người (để hiện "ai tạo" cho người không phải admin)
create or replace function public.du_an_ten_nguoi() returns table (user_id uuid, ten text)
  language sql stable security definer set search_path = public as $$
  select p.user_id, coalesce(p.display_name, left(p.user_id::text, 8)) from profiles p where du_an_co_quyen() $$;
revoke execute on function public.du_an_ten_nguoi() from public, anon;
grant execute on function public.du_an_ten_nguoi() to authenticated, service_role;
