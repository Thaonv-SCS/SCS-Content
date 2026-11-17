-- Module VIDEO (chủ shop yêu cầu 2026-11-17):
--   1) Người dùng thường KHÔNG thấy video do admin tạo; admin thấy tất cả video của mọi người.
--   2) Nút "Hủy": dừng hẳn 1 video (không làm nữa). Máy đang chạy dở bước nào cũng không ghi đè lại trạng thái đã hủy.

-- ───────────── 1) Ai xem được việc nào ─────────────
create or replace function public.video_xem_viec(p_job uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select video_la_sql_editor() or is_admin() or (
    video_thay() and exists (
      select 1 from video_jobs j
      where j.id = p_job
        and not exists (select 1 from profiles p where p.user_id = j.tao_boi and p.role = 'admin'))) $$;
revoke execute on function public.video_xem_viec(uuid) from public, anon;
grant execute on function public.video_xem_viec(uuid) to authenticated, service_role;

drop policy if exists "xem" on video_jobs;
create policy "xem" on video_jobs for select to authenticated using (video_xem_viec(id));

drop policy if exists "xem" on video_su_kien;
create policy "xem" on video_su_kien for select to authenticated using (video_xem_viec(job_id));

-- file trên kho (ảnh thẻ, bản xem thử, cảnh trám) cũng theo việc: thư mục đầu tiên = id việc
drop policy if exists "video_xem_doc" on storage.objects;
create policy "video_xem_doc" on storage.objects for select to authenticated
  using (bucket_id = 'video-xem' and video_xem_viec(((storage.foldername(name))[1])::uuid));
drop policy if exists "video_tai_canh_tram" on storage.objects;
create policy "video_tai_canh_tram" on storage.objects for insert to authenticated
  with check (bucket_id = 'video-xem' and video_co_quyen('lam') and (storage.foldername(name))[2] = 'canh-tram'
              and video_xem_viec(((storage.foldername(name))[1])::uuid));

-- các nút duyệt / góp ý / chốt: chỉ thao tác được trên việc mình xem được
create or replace function public.video_chuyen(p_job uuid, p_tu text[], p_sang text, p_loai text, p_noi_dung jsonb)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not video_xem_viec(p_job) then raise exception 'Không có quyền với video này'; end if;
  update video_jobs set trang_thai = p_sang, updated_at = now() where id = p_job and trang_thai = any(p_tu);
  if not found then raise exception 'Việc không ở bước cho phép thao tác này'; end if;
  insert into video_su_kien (job_id, loai, noi_dung) values (p_job, p_loai, p_noi_dung);
end $$;
revoke execute on function public.video_chuyen(uuid,text[],text,text,jsonb) from public, anon, authenticated;

-- ───────────── 2) Hủy video ─────────────
create or replace function public.video_huy(p_job uuid, p_ly_do text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not video_co_quyen('lam') then raise exception 'Không có quyền'; end if;
  perform video_chuyen(p_job,
    '{moi,dang-chuan-bi,cho-duyet-dan-y,cho-canh-tram,canh-tram-xong,dang-lam-the,cho-duyet-the,dang-dung,cho-xem-nhap,gop-y,dang-sua,loi}',
    'huy', 'huy', jsonb_build_object('ly_do', coalesce(p_ly_do, '')));
  update video_jobs set thong_bao = 'Đã hủy' || coalesce(': ' || nullif(p_ly_do, ''), '') where id = p_job;
end $$;
revoke execute on function public.video_huy(uuid,text) from public, anon;
grant execute on function public.video_huy(uuid,text) to authenticated, service_role;

-- Đã hủy thì máy (đang chạy dở) không ghi đè trạng thái được nữa; chỉ admin "đặt lại bước" mới mở lại
create or replace function public.video_giu_huy() returns trigger
  language plpgsql as $$
begin
  if old.trang_thai = 'huy' and new.trang_thai is distinct from 'huy'
     and coalesce(current_setting('video.mo_lai', true), '') <> '1' then
    new.trang_thai := 'huy';
  end if;
  return new;
end $$;
drop trigger if exists video_jobs_giu_huy on video_jobs;
create trigger video_jobs_giu_huy before update on video_jobs for each row execute function video_giu_huy();

create or replace function public.video_dat_trang_thai(p_job uuid, p_trang_thai text, p_ly_do text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not video_admin_ok() then raise exception 'Chỉ admin'; end if;
  perform set_config('video.mo_lai', '1', true);  -- cho phép mở lại việc đã hủy
  update video_jobs set trang_thai = p_trang_thai, thong_bao = p_ly_do, updated_at = now() where id = p_job;
  insert into video_su_kien (job_id, loai, noi_dung) values (p_job, 'thong-bao', jsonb_build_object('admin_dat', p_trang_thai, 'ly_do', p_ly_do));
end $$;
