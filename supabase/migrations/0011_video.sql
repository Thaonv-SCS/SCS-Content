-- Module VIDEO (SCS Video Studio V3): máy worker, việc dựng video, các bước duyệt, chi phí.
-- Thiết kế: d:\SCS Video Studio\KE-HOACH-V3.md
--
-- Nguyên tắc an toàn:
--   * Máy worker KHÔNG đọc/ghi bảng trực tiếp. Nó chỉ gọi Edge Function `video-worker` (supabase/functions/video-worker),
--     function kiểm tra CHÌA KHÓA MÁY (chỉ admin tạo) rồi mới làm. Khóa toàn quyền chỉ nằm trong Supabase.
--   * Chỉ admin thấy / quản lý máy worker. Việc mới TỰ giao cho máy admin đang chọn (trigger), nhân viên không chọn được máy.
--   * Nhân viên thao tác qua các hàm video_* (duyệt, góp ý, chốt), không sửa thẳng bảng.
--
-- SAU KHI CHẠY (admin, trong SQL Editor):
--   1) Tạo máy:      select video_tao_may('Laptop chủ shop');      -- trả về CHÌA KHÓA, chỉ hiện 1 lần → dán vào .env của máy đó
--   2) Chọn máy:     select video_chon_may('<id máy>');
--   3) Gán quyền:    update profiles set video_quyen = '{lam}'  where user_id = (select id from auth.users where email = '...');
--                    update profiles set video_quyen = '{duyet}' where ...;     ('{lam,duyet}' = cả hai)
--   Thu hồi máy:     select video_thu_hoi_may('<id máy>');

-- ───────────── Quyền ─────────────
alter table profiles add column if not exists video_quyen text[] not null default '{}';

-- session_user = 'postgres' = đang chạy trong SQL Editor của Supabase (chủ project). Qua web/app thì session_user luôn là
-- 'authenticator' (kể cả khi đi qua hàm security definer), nên người ngoài không giả được.
create or replace function public.video_la_sql_editor() returns boolean
  language sql stable as $$ select session_user = 'postgres' $$;

create or replace function public.video_co_quyen(q text) returns boolean
  language sql stable security definer set search_path = public
  as $$ select video_la_sql_editor() or is_admin()
               or coalesce((select q = any(video_quyen) from profiles where user_id = auth.uid()), false) $$;

create or replace function public.video_thay() returns boolean   -- được xem module video
  language sql stable security definer set search_path = public
  as $$ select video_co_quyen('lam') or video_co_quyen('duyet') $$;

-- ───────────── Máy worker (chỉ admin) ─────────────
create table video_workers (
  id uuid primary key default gen_random_uuid(),
  ten text not null,
  khoa_bam text not null unique,              -- sha256 của chìa khóa máy (không lưu chìa khóa thật)
  trang_thai text not null default 'hoat-dong' check (trang_thai in ('hoat-dong', 'tam-ngung', 'thu-hoi')),
  dang_nhan_viec boolean not null default false,
  phien_ban int,                               -- số bản code (git) máy đang chạy
  lan_cuoi timestamptz,                        -- lần báo "đang bật" gần nhất
  footage jsonb not null default '[]',         -- thư mục Footage\ có trên máy
  phong_cach jsonb not null default '[]',      -- [{"ten": "co-ban", "rieng": false}, ...]
  tao_boi uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index video_workers_mot_may on video_workers (dang_nhan_viec) where dang_nhan_viec;
alter table video_workers enable row level security;
create policy "admin_all" on video_workers for all to authenticated using (is_admin()) with check (is_admin());

create table video_worker_nhat_ky (           -- ai thêm / thu hồi máy, máy bật lúc nào, nhận việc nào
  id bigint generated always as identity primary key,
  worker_id uuid references video_workers(id) on delete cascade,
  su_kien text not null,
  chi_tiet jsonb,
  nguoi uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table video_worker_nhat_ky enable row level security;
create policy "admin_all" on video_worker_nhat_ky for all to authenticated using (is_admin()) with check (is_admin());

-- ───────────── Việc dựng video ─────────────
-- Trạng thái:  moi → dang-chuan-bi → cho-duyet-dan-y → cho-canh-tram → canh-tram-xong → dang-lam-the → cho-duyet-the
--              → dang-dung → cho-xem-nhap → (gop-y → dang-sua → cho-xem-nhap)* → xong      | loi (kèm thông báo)
create table video_jobs (
  id uuid primary key default gen_random_uuid(),
  ten text not null,
  worker_id uuid references video_workers(id) on delete set null,
  footage text not null,                       -- tên thư mục trong Footage\ của máy worker
  phong_cach text not null default 'co-ban',
  hook_goi_y text,
  mo_hinh jsonb not null default '{}',         -- ghi đè mô hình từng bước: {"ke-hoach": {"model": "...", "effort": "..."}}
  trang_thai text not null default 'moi',
  thong_bao text,                              -- đang làm gì / lỗi gì (máy ghi)
  ket_qua jsonb not null default '{}',         -- {"file": "...nhap-co-phu-de.mp4 trên máy worker", "dai": 148.3, ...}
  phut_cong int,                               -- số phút người bỏ ra (nhập khi chốt)
  dung_duoc text check (dung_duoc in ('co', 'sua-nhieu', 'khong')),
  tao_boi uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index video_jobs_moi_nhat on video_jobs (created_at desc);
alter table video_jobs enable row level security;
create policy "xem" on video_jobs for select to authenticated using (video_thay());
create policy "tao" on video_jobs for insert to authenticated
  with check (video_co_quyen('lam') and trang_thai = 'moi');
create policy "admin_sua" on video_jobs for update to authenticated using (is_admin()) with check (is_admin());
create policy "admin_xoa" on video_jobs for delete to authenticated using (is_admin());

-- Việc mới LUÔN giao cho máy admin đang chọn (bỏ qua mọi worker_id người tạo gửi lên)
create or replace function public.video_giao_may() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  new.worker_id := (select id from video_workers where dang_nhan_viec and trang_thai = 'hoat-dong' limit 1);
  if new.worker_id is null then
    raise exception 'Chưa có máy worker nào đang nhận việc (admin chọn máy trước)';
  end if;
  new.trang_thai := 'moi';
  return new;
end $$;
create trigger video_jobs_giao_may before insert on video_jobs for each row execute function video_giao_may();

-- Lịch sử từng việc: kết quả máy nộp (dàn ý, ảnh thẻ, bản xem thử) + ý kiến duyệt / góp ý của người
create table video_su_kien (
  id bigint generated always as identity primary key,
  job_id uuid not null references video_jobs(id) on delete cascade,
  loai text not null,          -- 'dan-y' | 'canh-tram-can' | 'the' | 'nhap' | 'duyet' | 'gop-y' | 'chot' | 'loi' | 'thong-bao'
  noi_dung jsonb not null default '{}',
  nguoi uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index video_su_kien_job on video_su_kien (job_id, id);
alter table video_su_kien enable row level security;
create policy "xem" on video_su_kien for select to authenticated using (video_thay());

-- ───────────── Thao tác của người (gọi từ app) ─────────────
create or replace function public.video_chuyen(p_job uuid, p_tu text[], p_sang text, p_loai text, p_noi_dung jsonb)
  returns void language plpgsql security definer set search_path = public as $$
begin
  update video_jobs set trang_thai = p_sang, updated_at = now() where id = p_job and trang_thai = any(p_tu);
  if not found then raise exception 'Việc không ở bước cho phép thao tác này'; end if;
  insert into video_su_kien (job_id, loai, noi_dung) values (p_job, p_loai, p_noi_dung);
end $$;

-- Người làm: duyệt dàn ý (kèm ghi chú) → chờ cảnh trám
create or replace function public.video_duyet_dan_y(p_job uuid, p_ghi_chu text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not video_co_quyen('lam') then raise exception 'Không có quyền'; end if;
  perform video_chuyen(p_job, '{cho-duyet-dan-y}', 'cho-canh-tram', 'duyet',
                       jsonb_build_object('buoc', 'dan-y', 'ghi_chu', p_ghi_chu));
end $$;

-- Người làm: yêu cầu làm lại dàn ý
create or replace function public.video_lam_lai_dan_y(p_job uuid, p_ghi_chu text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not video_co_quyen('lam') then raise exception 'Không có quyền'; end if;
  perform video_chuyen(p_job, '{cho-duyet-dan-y}', 'dang-chuan-bi', 'duyet',
                       jsonb_build_object('buoc', 'dan-y', 'lam_lai', true, 'ghi_chu', p_ghi_chu));
end $$;

-- Người làm: đã tải xong cảnh trám (hoặc không có) → máy làm thẻ
create or replace function public.video_xong_canh_tram(p_job uuid, p_ghi_chu text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not video_co_quyen('lam') then raise exception 'Không có quyền'; end if;
  perform video_chuyen(p_job, '{cho-canh-tram}', 'canh-tram-xong', 'duyet',
                       jsonb_build_object('buoc', 'canh-tram', 'ghi_chu', p_ghi_chu));
end $$;

-- Người làm: duyệt thẻ đồ họa (ghi chú kiểu "bỏ số 3") → máy dựng
create or replace function public.video_duyet_the(p_job uuid, p_ghi_chu text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not video_co_quyen('lam') then raise exception 'Không có quyền'; end if;
  perform video_chuyen(p_job, '{cho-duyet-the}', 'dang-dung', 'duyet',
                       jsonb_build_object('buoc', 'the', 'ghi_chu', p_ghi_chu));
end $$;

-- Người duyệt: góp ý bản nháp → máy sửa
create or replace function public.video_gop_y(p_job uuid, p_gop_y text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not video_co_quyen('duyet') then raise exception 'Không có quyền'; end if;
  perform video_chuyen(p_job, '{cho-xem-nhap}', 'gop-y', 'gop-y', jsonb_build_object('gop_y', p_gop_y));
end $$;

-- Người duyệt: chốt bản cuối (+ số phút đã bỏ ra, dùng được không — thay sổ THEO-DOI-V1.md)
create or replace function public.video_chot(p_job uuid, p_phut int, p_dung_duoc text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not video_co_quyen('duyet') then raise exception 'Không có quyền'; end if;
  perform video_chuyen(p_job, '{cho-xem-nhap}', 'xong', 'chot',
                       jsonb_build_object('phut', p_phut, 'dung_duoc', p_dung_duoc));
  update video_jobs set phut_cong = p_phut, dung_duoc = p_dung_duoc where id = p_job;
end $$;

-- Người làm thấy footage + phong cách CÓ TRÊN MÁY ĐANG NHẬN VIỆC, nhưng KHÔNG thấy tên / id máy
create or replace function public.video_lua_chon() returns jsonb
  language sql stable security definer set search_path = public as $$
  select case when not video_thay() then null else coalesce(
    (select jsonb_build_object('footage', footage, 'phong_cach', phong_cach,
                               'may_dang_bat', coalesce(lan_cuoi > now() - interval '2 minutes', false))
     from video_workers where dang_nhan_viec and trang_thai = 'hoat-dong' limit 1),
    jsonb_build_object('footage', '[]'::jsonb, 'phong_cach', '[]'::jsonb, 'may_dang_bat', false)) end $$;

-- ───────────── Admin quản lý máy ─────────────
create or replace function public.video_admin_ok() returns boolean
  language sql stable security definer set search_path = public
  as $$ select is_admin() or video_la_sql_editor() $$;

create or replace function public.video_tao_may(p_ten text) returns text
  language plpgsql security definer set search_path = public, extensions as $$
declare khoa text; may uuid;
begin
  if not video_admin_ok() then raise exception 'Chỉ admin'; end if;
  khoa := 'scsw_' || encode(gen_random_bytes(24), 'hex');
  insert into video_workers (ten, khoa_bam) values (p_ten, encode(digest(khoa, 'sha256'), 'hex')) returning id into may;
  insert into video_worker_nhat_ky (worker_id, su_kien, chi_tiet) values (may, 'tao', jsonb_build_object('ten', p_ten));
  return khoa;  -- CHỈ HIỆN 1 LẦN
end $$;

create or replace function public.video_chon_may(p_may uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not video_admin_ok() then raise exception 'Chỉ admin'; end if;
  update video_workers set dang_nhan_viec = false where dang_nhan_viec;
  update video_workers set dang_nhan_viec = true where id = p_may and trang_thai = 'hoat-dong';
  if not found then raise exception 'Máy không tồn tại hoặc đã bị tạm ngưng/thu hồi'; end if;
  insert into video_worker_nhat_ky (worker_id, su_kien) values (p_may, 'chon-nhan-viec');
end $$;

create or replace function public.video_thu_hoi_may(p_may uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not video_admin_ok() then raise exception 'Chỉ admin'; end if;
  update video_workers set trang_thai = 'thu-hoi', dang_nhan_viec = false where id = p_may;
  insert into video_worker_nhat_ky (worker_id, su_kien) values (p_may, 'thu-hoi');
end $$;

-- ───────────── Chi phí ─────────────
alter table llm_calls add column if not exists job_id uuid references video_jobs(id) on delete set null;
create index if not exists llm_calls_job on llm_calls (job_id) where job_id is not null;

insert into settings (key, value) values
  ('video_phien_ban_toi_thieu', '0'),    -- máy chạy code cũ hơn số này thì không được giao việc
  ('video_giu_ban_xem_ngay', '14'),      -- bản xem thử 480p trên mạng tự xóa sau N ngày
  ('video_tran_ngay_usd', '8')           -- trần chi phí AI riêng cho video mỗi ngày (~1,5$/video); hết trần thì việc chờ sang ngày
on conflict (key) do nothing;

-- Chi phí AI của video hôm nay (giờ VN) + trần — Edge Function đọc để dừng máy khi vượt trần
create or replace function public.video_chi_hom_nay() returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'da_chi', coalesce((select sum(cost_usd) from llm_calls where job_id is not null and created_at >=
              (date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh')), 0),
    'tran', coalesce((select (value #>> '{}')::numeric from settings where key = 'video_tran_ngay_usd'), 8),
    'phien_ban_toi_thieu', coalesce((select (value #>> '{}')::int from settings where key = 'video_phien_ban_toi_thieu'), 0),
    'giu_ngay', coalesce((select (value #>> '{}')::int from settings where key = 'video_giu_ban_xem_ngay'), 14)) $$;

-- File trong kho video-xem đã quá N ngày (Edge Function xóa định kỳ). Chỉ khóa toàn quyền gọi được.
create or replace function public.video_file_cu(p_ngay int) returns setof text
  language sql stable security definer set search_path = public, storage as $$
  select name from storage.objects where bucket_id = 'video-xem' and created_at < now() - make_interval(days => p_ngay) $$;
revoke execute on function public.video_file_cu(int) from public, anon, authenticated;
revoke execute on function public.video_chi_hom_nay() from public, anon;

-- ───────────── Kho file nhẹ (ảnh duyệt, bản xem thử 480p, cảnh trám người làm tải lên) ─────────────
insert into storage.buckets (id, name, public) values ('video-xem', 'video-xem', false) on conflict (id) do nothing;
create policy "video_xem_doc" on storage.objects for select to authenticated
  using (bucket_id = 'video-xem' and video_thay());
-- người làm tải cảnh trám vào <id việc>/canh-tram/...
create policy "video_tai_canh_tram" on storage.objects for insert to authenticated
  with check (bucket_id = 'video-xem' and video_co_quyen('lam') and (storage.foldername(name))[2] = 'canh-tram');
grant execute on function public.video_file_cu(int) to service_role;
grant execute on function public.video_chi_hom_nay() to service_role;

-- Người CHƯA đăng nhập (anon) không được gọi bất kỳ hàm video nào
do $$
declare f text;
begin
  foreach f in array array['video_co_quyen(text)','video_thay()','video_duyet_dan_y(uuid,text)','video_lam_lai_dan_y(uuid,text)',
    'video_xong_canh_tram(uuid,text)','video_duyet_the(uuid,text)','video_gop_y(uuid,text)','video_chot(uuid,int,text)',
    'video_lua_chon()','video_admin_ok()','video_tao_may(text)','video_chon_may(uuid)','video_thu_hoi_may(uuid)',
    'video_chuyen(uuid,text[],text,text,jsonb)','video_la_sql_editor()']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
-- video_chuyen chỉ dùng nội bộ (các hàm duyệt gọi nó), không cho gọi thẳng
revoke execute on function public.video_chuyen(uuid,text[],text,text,jsonb) from authenticated;
