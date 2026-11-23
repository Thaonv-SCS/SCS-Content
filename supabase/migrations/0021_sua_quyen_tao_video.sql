-- Sửa lỗi (2026-11-20): tài khoản KHÔNG phải admin bấm "Tạo video" bị báo
--   new row violates row-level security policy for table "video_jobs"
-- Nguyên nhân: app thêm việc rồi đọc lại id (INSERT ... RETURNING). Quyền XEM việc (video_xem_viec) tự tra lại
-- bảng video_jobs theo id, nhưng trong lúc thêm thì chưa thấy dòng mới → coi như không được xem → báo lỗi.
-- Admin không bị vì is_admin() trả true trước khi tra bảng. Lỗi có từ migration 0014.
-- Sửa: quyền xem tính thẳng trên cột của dòng (footage, tao_boi), không tra lại bảng. Quy tắc giữ nguyên:
--   admin thấy tất cả · người khác: có quyền video + được dùng footage đó + việc không do admin tạo.
-- Độc lập với 0020 (chạy trước hay sau đều được).

create or replace function public.video_xem_dong(p_footage text, p_tao_boi uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select video_la_sql_editor() or is_admin() or (
    video_thay()
    and video_footage_duoc(p_footage)
    and not exists (select 1 from profiles p where p.user_id = p_tao_boi and p.role = 'admin')) $$;
revoke execute on function public.video_xem_dong(text, uuid) from public, anon;
grant execute on function public.video_xem_dong(text, uuid) to authenticated, service_role;

drop policy if exists "xem" on video_jobs;
create policy "xem" on video_jobs for select to authenticated using (video_xem_dong(footage, tao_boi));

-- Hàm cũ (dùng cho sự kiện, file trên kho, hủy việc) đi qua cùng một quy tắc
create or replace function public.video_xem_viec(p_job uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select video_la_sql_editor() or is_admin() or exists (
    select 1 from video_jobs j where j.id = p_job and video_xem_dong(j.footage, j.tao_boi)) $$;
