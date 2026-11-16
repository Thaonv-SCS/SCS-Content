-- Module VIDEO — phần cho giao diện (V3 giai đoạn 3). Chạy SAU 0011_video.sql.

-- Admin: danh sách tài khoản + quyền video (bảng profiles chỉ cho mỗi người đọc dòng của mình)
create or replace function public.video_ds_nguoi() returns table (user_id uuid, email text, ten text, role text, video_quyen text[])
  language sql stable security definer set search_path = public, auth as $$
  select p.user_id, u.email::text, p.display_name, p.role, p.video_quyen
  from profiles p join auth.users u on u.id = p.user_id
  where is_admin() or video_la_sql_editor()
  order by u.email $$;

create or replace function public.video_dat_quyen(p_user uuid, p_quyen text[]) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not video_admin_ok() then raise exception 'Chỉ admin'; end if;
  if exists (select 1 from unnest(p_quyen) q where q not in ('lam', 'duyet')) then raise exception 'Quyền chỉ gồm lam / duyet'; end if;
  update profiles set video_quyen = p_quyen where user_id = p_user;
end $$;

-- Tên người (để hiện "ai tạo / ai duyệt") cho người được xem module video
create or replace function public.video_ten_nguoi() returns table (user_id uuid, ten text)
  language sql stable security definer set search_path = public, auth as $$
  select p.user_id, coalesce(nullif(p.display_name, ''), split_part(u.email::text, '@', 1))
  from profiles p join auth.users u on u.id = p.user_id
  where video_thay() $$;

-- Admin: chạy lại bước bị lỗi / đổi trạng thái việc (ghi lại vào lịch sử)
create or replace function public.video_dat_trang_thai(p_job uuid, p_trang_thai text, p_ly_do text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not video_admin_ok() then raise exception 'Chỉ admin'; end if;
  update video_jobs set trang_thai = p_trang_thai, thong_bao = p_ly_do, updated_at = now() where id = p_job;
  insert into video_su_kien (job_id, loai, noi_dung) values (p_job, 'thong-bao', jsonb_build_object('admin_dat', p_trang_thai, 'ly_do', p_ly_do));
end $$;

-- Admin: tạm ngưng / bật lại 1 máy (khác thu hồi: tạm ngưng thì bật lại được)
create or replace function public.video_tam_ngung_may(p_may uuid, p_tam_ngung boolean) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not video_admin_ok() then raise exception 'Chỉ admin'; end if;
  update video_workers set trang_thai = case when p_tam_ngung then 'tam-ngung' else 'hoat-dong' end,
                           dang_nhan_viec = case when p_tam_ngung then false else dang_nhan_viec end
   where id = p_may and trang_thai <> 'thu-hoi';
  insert into video_worker_nhat_ky (worker_id, su_kien) values (p_may, case when p_tam_ngung then 'tam-ngung' else 'bat-lai' end);
end $$;

do $$
declare f text;
begin
  foreach f in array array['video_ds_nguoi()', 'video_dat_quyen(uuid,text[])', 'video_ten_nguoi()',
                           'video_dat_trang_thai(uuid,text,text)', 'video_tam_ngung_may(uuid,boolean)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
