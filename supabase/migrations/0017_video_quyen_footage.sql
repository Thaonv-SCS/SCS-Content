-- Module VIDEO: quyền theo TỪNG thư mục footage (chủ shop chốt 2026-11-17).
--   moi-nguoi (mặc định, không cần dòng nào) · an = chỉ admin · chi-cho = chỉ các tài khoản trong danh sách
-- Áp dụng cả XEM lẫn LÀM: footage bị chặn không hiện ở màn tạo video, không tạo được video từ nó,
-- và các video đã làm từ footage đó cũng ẩn với người bị chặn. Chặn trong database (không chỉ ẩn giao diện).
-- Quyền gắn theo TÊN thư mục footage (cùng tên trên nhiều máy = cùng 1 footage).

create table if not exists video_footage_quyen (
  footage text primary key,
  che_do text not null check (che_do in ('an', 'chi-cho')),
  nguoi uuid[] not null default '{}',
  cap_nhat_boi uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table video_footage_quyen enable row level security;
create policy "admin_all" on video_footage_quyen for all to authenticated using (is_admin()) with check (is_admin());

-- Người đang đăng nhập có được xem / làm footage này không
create or replace function public.video_footage_duoc(p_footage text) returns boolean
  language sql stable security definer set search_path = public as $$
  select video_la_sql_editor() or is_admin() or coalesce(
    (select case q.che_do when 'an' then false else auth.uid() = any(q.nguoi) end
     from video_footage_quyen q where q.footage = p_footage),
    true) $$;
revoke execute on function public.video_footage_duoc(text) from public, anon;
grant execute on function public.video_footage_duoc(text) to authenticated, service_role;

-- Xem việc: thêm điều kiện footage
create or replace function public.video_xem_viec(p_job uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select video_la_sql_editor() or is_admin() or (
    video_thay() and exists (
      select 1 from video_jobs j
      where j.id = p_job
        and video_footage_duoc(j.footage)
        and not exists (select 1 from profiles p where p.user_id = j.tao_boi and p.role = 'admin'))) $$;

-- Tạo việc: không có quyền với footage thì từ chối (kể cả gửi thẳng lên, bỏ qua giao diện)
create or replace function public.video_giao_may() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if not video_footage_duoc(new.footage) then
    raise exception 'Tài khoản này không được dùng footage "%"', new.footage;
  end if;
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

-- Màn tạo video: chỉ hiện footage được phép
create or replace function public.video_lua_chon() returns jsonb
  language sql stable security definer set search_path = public as $$
  with may as (
    select id, ten, footage, phong_cach, coalesce(lan_cuoi > now() - interval '2 minutes', false) as bat
    from video_workers where dang_nhan_viec and trang_thai = 'hoat-dong'
  ), ft as (
    select f.ten_ft, jsonb_agg(jsonb_build_object('may', m.ten, 'bat', m.bat) order by m.bat desc, m.ten) as o_dau,
           bool_or(m.bat) as bat
    from may m cross join lateral jsonb_array_elements_text(m.footage) as f(ten_ft)
    where video_footage_duoc(f.ten_ft)
    group by f.ten_ft
  ), pc as (
    select distinct on (p->>'ten') p->>'ten' as ten, coalesce((p->>'rieng')::boolean, false) as rieng
    from may m cross join lateral jsonb_array_elements(m.phong_cach) p order by p->>'ten', (p->>'rieng')::boolean
  )
  select case when not video_thay() then null else jsonb_build_object(
    'footage', coalesce((select jsonb_agg(jsonb_build_object('ten', ten_ft, 'o_dau', o_dau, 'bat', bat) order by ten_ft desc) from ft), '[]'::jsonb),
    'phong_cach', coalesce((select jsonb_agg(jsonb_build_object('ten', ten, 'rieng', rieng) order by ten) from pc), '[]'::jsonb),
    'may_dang_bat', coalesce((select bool_or(bat) from may), false),
    'so_may', (select count(*) from may)) end $$;

-- Admin đặt quyền 1 footage. 'moi-nguoi' = xóa dòng (trở về mặc định)
create or replace function public.video_dat_quyen_footage(p_footage text, p_che_do text, p_nguoi uuid[]) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not video_admin_ok() then raise exception 'Chỉ admin'; end if;
  if p_che_do = 'moi-nguoi' then
    delete from video_footage_quyen where footage = p_footage;
  elsif p_che_do in ('an', 'chi-cho') then
    if p_che_do = 'chi-cho' and coalesce(array_length(p_nguoi, 1), 0) = 0 then
      raise exception 'Chọn ít nhất 1 tài khoản (hoặc dùng chế độ Ẩn)';
    end if;
    insert into video_footage_quyen (footage, che_do, nguoi, cap_nhat_boi, updated_at)
    values (p_footage, p_che_do, case when p_che_do = 'chi-cho' then p_nguoi else '{}' end, auth.uid(), now())
    on conflict (footage) do update set che_do = excluded.che_do, nguoi = excluded.nguoi,
      cap_nhat_boi = excluded.cap_nhat_boi, updated_at = now();
  else
    raise exception 'Chế độ không hợp lệ';
  end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array['video_dat_quyen_footage(text,text,uuid[])', 'video_lua_chon()', 'video_xem_viec(uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
