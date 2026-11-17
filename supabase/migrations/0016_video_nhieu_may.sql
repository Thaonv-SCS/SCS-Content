-- Module VIDEO: NHIỀU máy worker cùng nhận việc, việc TỰ GIAO cho máy đang chứa footage (chủ shop chốt 2026-11-17).
--   * Admin bật "nhận việc" cho bao nhiêu máy cũng được (trước đây chỉ 1 máy).
--   * Người làm chỉ chọn footage; việc tự về máy có footage đó (+ có phong cách đã chọn).
--     Nhiều máy cùng có → ưu tiên máy đang bật, ít việc đang chạy, dựng nhanh hơn (số đo "Kiểm tra máy").
--   * Người làm vẫn KHÔNG chọn được máy (worker_id gửi lên bị bỏ qua); chỉ admin chỉ định / chuyển máy.

drop index if exists video_workers_mot_may;

-- Máy phù hợp nhất cho 1 footage + phong cách (null nếu không máy nào có)
create or replace function public.video_tim_may(p_footage text, p_phong_cach text) returns uuid
  language sql stable security definer set search_path = public as $$
  select w.id from video_workers w
  where w.dang_nhan_viec and w.trang_thai = 'hoat-dong'
    and w.footage ? p_footage
    and (p_phong_cach is null or exists (select 1 from jsonb_array_elements(w.phong_cach) pc where pc->>'ten' = p_phong_cach))
  order by
    (w.lan_cuoi > now() - interval '2 minutes') desc,                                         -- đang bật trước
    (select count(*) from video_jobs j where j.worker_id = w.id
       and j.trang_thai in ('moi','dang-chuan-bi','canh-tram-xong','dang-lam-the','dang-dung','gop-y','dang-sua')),  -- ít việc
    coalesce((w.cau_hinh->>'uoc_phut_dung')::numeric, 99),                                    -- dựng nhanh
    w.created_at
  limit 1 $$;
revoke execute on function public.video_tim_may(text, text) from public, anon;
grant execute on function public.video_tim_may(text, text) to authenticated, service_role;

create or replace function public.video_giao_may() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  -- admin chỉ định máy thì giữ (máy phải đang hoạt động); còn lại máy tự chọn theo footage
  if new.worker_id is not null and (is_admin() or video_la_sql_editor())
     and exists (select 1 from video_workers where id = new.worker_id and trang_thai = 'hoat-dong') then
    null;
  else
    new.worker_id := video_tim_may(new.footage, new.phong_cach);
  end if;
  if new.worker_id is null then
    if exists (select 1 from video_workers where dang_nhan_viec and trang_thai = 'hoat-dong' and footage ? new.footage) then
      raise exception 'Máy chứa footage "%" không có phong cách "%"', new.footage, new.phong_cach;
    end if;
    raise exception 'Không máy dựng nào (đang nhận việc) có thư mục footage "%"', new.footage;
  end if;
  new.trang_thai := 'moi';
  return new;
end $$;

-- Admin: bật / tắt "nhận việc" cho TỪNG máy (không còn tắt các máy khác)
create or replace function public.video_chon_may(p_may uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not video_admin_ok() then raise exception 'Chỉ admin'; end if;
  update video_workers set dang_nhan_viec = true where id = p_may and trang_thai = 'hoat-dong';
  if not found then raise exception 'Máy không tồn tại hoặc đã bị tạm ngưng/thu hồi'; end if;
  insert into video_worker_nhat_ky (worker_id, su_kien) values (p_may, 'chon-nhan-viec');
end $$;

create or replace function public.video_bo_nhan_viec(p_may uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not video_admin_ok() then raise exception 'Chỉ admin'; end if;
  update video_workers set dang_nhan_viec = false where id = p_may;
  insert into video_worker_nhat_ky (worker_id, su_kien) values (p_may, 'bo-nhan-viec');
end $$;

-- Admin: chuyển 1 việc sang máy khác (vd máy cũ hỏng). Máy mới không có file trung gian của máy cũ
-- → việc làm lại từ đầu (dàn ý), các ý kiến duyệt cũ vẫn giữ trong lịch sử để bộ não đọc lại.
create or replace function public.video_chuyen_may(p_job uuid, p_may uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare cu uuid; ft text;
begin
  if not video_admin_ok() then raise exception 'Chỉ admin'; end if;
  select worker_id, footage into cu, ft from video_jobs where id = p_job;
  if not exists (select 1 from video_workers where id = p_may and trang_thai = 'hoat-dong') then
    raise exception 'Máy không hoạt động';
  end if;
  if not exists (select 1 from video_workers where id = p_may and footage ? ft) then
    raise exception 'Máy này không có thư mục footage "%" (chép footage sang trước)', ft;
  end if;
  perform set_config('video.mo_lai', '1', true);
  update video_jobs set worker_id = p_may, trang_thai = 'moi', thong_bao = 'Admin chuyển máy — làm lại từ dàn ý',
         updated_at = now() where id = p_job;
  insert into video_su_kien (job_id, loai, noi_dung) values (p_job, 'thong-bao',
    jsonb_build_object('admin_dat', 'chuyen-may', 'ly_do', 'Chuyển sang máy ' || (select ten from video_workers where id = p_may)));
end $$;

-- Người làm thấy footage của MỌI máy đang nhận việc, kèm tên máy chứa nó (để biết chép footage đúng chỗ)
create or replace function public.video_lua_chon() returns jsonb
  language sql stable security definer set search_path = public as $$
  with may as (
    select id, ten, footage, phong_cach, coalesce(lan_cuoi > now() - interval '2 minutes', false) as bat
    from video_workers where dang_nhan_viec and trang_thai = 'hoat-dong'
  ), ft as (
    select f.ten_ft, jsonb_agg(jsonb_build_object('may', m.ten, 'bat', m.bat) order by m.bat desc, m.ten) as o_dau,
           bool_or(m.bat) as bat
    from may m cross join lateral jsonb_array_elements_text(m.footage) as f(ten_ft) group by f.ten_ft
  ), pc as (
    select distinct on (p->>'ten') p->>'ten' as ten, coalesce((p->>'rieng')::boolean, false) as rieng
    from may m cross join lateral jsonb_array_elements(m.phong_cach) p order by p->>'ten', (p->>'rieng')::boolean
  )
  select case when not video_thay() then null else jsonb_build_object(
    'footage', coalesce((select jsonb_agg(jsonb_build_object('ten', ten_ft, 'o_dau', o_dau, 'bat', bat) order by ten_ft desc) from ft), '[]'::jsonb),
    'phong_cach', coalesce((select jsonb_agg(jsonb_build_object('ten', ten, 'rieng', rieng) order by ten) from pc), '[]'::jsonb),
    'may_dang_bat', coalesce((select bool_or(bat) from may), false),
    'so_may', (select count(*) from may)) end $$;

do $$
declare f text;
begin
  foreach f in array array['video_bo_nhan_viec(uuid)', 'video_chuyen_may(uuid,uuid)', 'video_chon_may(uuid)', 'video_lua_chon()']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
