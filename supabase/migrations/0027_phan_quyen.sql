-- Phân quyền bằng ô tick (Cài đặt → Phân quyền) thay cho vai trò cứng admin / staff / video.
--
-- profiles.role: 'admin' = toàn quyền; người khác là 'thanh-vien' (giá trị cũ 'staff' / 'video' vẫn nhận).
-- profiles.quyen (mới): các ô tick theo module
--   ban-tin      Xem & dùng bản tin (chọn / sửa / lưu caption)
--   ban-tin-ql   Quản lý kho caption, bài thô, nguồn
--   san-pham     Post sản phẩm (viết + đẩy lên web)
--   cap-nhat     Cập nhật sản phẩm (giá, size, tồn kho)
--   up-anh       Up ảnh / ảnh đại diện / video sản phẩm
--   chi-phi      Xem chi phí AI
-- Video editor giữ profiles.video_quyen ('lam','duyet'); Dự án video giữ profiles.du_an_quyen (theo bước, thêm "kho": ["lam"] = sửa kho tri thức).
-- Cài đặt (trần chi phí, mô hình AI, phân quyền, máy dựng) vẫn chỉ admin.

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('admin', 'thanh-vien', 'staff', 'video'));
alter table profiles add column if not exists quyen text[] not null default '{}';

-- Chuyển quyền cũ sang ô tick: staff = 3 mục sản phẩm
update profiles set quyen = array['san-pham', 'cap-nhat', 'up-anh'] where role = 'staff' and quyen = '{}';

create or replace function public.co_quyen(k text) returns boolean
  language sql stable security definer set search_path = public
  as $$ select coalesce(is_admin() or exists (select 1 from profiles where user_id = auth.uid() and k = any(quyen)), false) $$;
grant execute on function public.co_quyen(text) to authenticated;

-- ───────────── Sản phẩm ─────────────
-- Bảng sản phẩm dùng chung cho 3 mục (Up ảnh đọc alt / ghi link video theo SKU) → ai có 1 trong 3 quyền đều đọc / ghi được.
create or replace function public.can_write_products() returns boolean
  language sql stable security definer set search_path = public
  as $$ select co_quyen('san-pham') or co_quyen('cap-nhat') or co_quyen('up-anh') $$;

drop policy if exists "team_all" on stock_changes;
create policy "team_all" on stock_changes for all to authenticated using (co_quyen('cap-nhat')) with check (co_quyen('cap-nhat'));
drop policy if exists "team_all" on image_uploads;
create policy "team_all" on image_uploads for all to authenticated using (co_quyen('up-anh')) with check (co_quyen('up-anh'));

-- ───────────── Bản tin ─────────────
do $$
declare t text;
begin
  foreach t in array array['digests', 'suggestions', 'feedback', 'stories', 'story_items', 'matches', 'media_assets', 'captions']
  loop
    execute format('drop policy if exists "ban_tin" on %I', t);
    execute format('create policy "ban_tin" on %I for all to authenticated using (co_quyen(''ban-tin'')) with check (co_quyen(''ban-tin''))', t);
  end loop;
  foreach t in array array['sources', 'raw_items', 'captions', 'players', 'boot_lines', 'glossary']
  loop
    execute format('drop policy if exists "ban_tin_ql" on %I', t);
    execute format('create policy "ban_tin_ql" on %I for all to authenticated using (co_quyen(''ban-tin-ql'')) with check (co_quyen(''ban-tin-ql''))', t);
  end loop;
end $$;

-- Kho caption: người quản lý đọc / sửa ghi chú văn phong + xem lượt chạy (không đụng cài đặt khác)
drop policy if exists "ban_tin_ql_doc" on settings;
create policy "ban_tin_ql_doc" on settings for select to authenticated using (co_quyen('ban-tin-ql') and key in ('style_notes', 'last_run'));
drop policy if exists "ban_tin_ql_ghi" on settings;
create policy "ban_tin_ql_ghi" on settings for all to authenticated
  using (co_quyen('ban-tin-ql') and key in ('style_notes', 'last_run')) with check (co_quyen('ban-tin-ql') and key in ('style_notes', 'last_run'));

-- ───────────── Chi phí AI ─────────────
drop policy if exists "chi_phi_doc" on llm_calls;
create policy "chi_phi_doc" on llm_calls for select to authenticated using (co_quyen('chi-phi'));

-- ───────────── Dự án video: sửa kho tri thức ─────────────
do $$
declare t text;
begin
  foreach t in array array['du_an_kien_thuc', 'du_an_khan_gia_du_lieu', 'du_an_khuon']
  loop
    execute format('drop policy if exists "kho" on %I', t);
    execute format('create policy "kho" on %I for all to authenticated using (du_an_co_quyen(''kho'', ''lam'')) with check (du_an_co_quyen(''kho'', ''lam''))', t);
  end loop;
end $$;

-- ───────────── Trang Phân quyền (chỉ admin) ─────────────
-- Mọi tài khoản đăng nhập được (kể cả tài khoản mới tạo ở Supabase, chưa có quyền gì)
create or replace function public.phan_quyen_ds()
  returns table (user_id uuid, email text, ten text, role text, quyen text[], video_quyen text[], du_an_quyen jsonb, lan_cuoi timestamptz, tao_luc timestamptz)
  language sql stable security definer set search_path = public, auth
  as $$
    select u.id, u.email::text, p.display_name, p.role, coalesce(p.quyen, '{}'), coalesce(p.video_quyen, '{}'), coalesce(p.du_an_quyen, '{}'::jsonb),
           u.last_sign_in_at, u.created_at
    from auth.users u left join profiles p on p.user_id = u.id
    where is_admin()
    order by (p.role = 'admin') desc nulls last, u.created_at
  $$;

create or replace function public.phan_quyen_luu(p_user uuid, p_ten text, p_admin boolean, p_quyen text[], p_video text[], p_du_an jsonb)
  returns void
  language plpgsql security definer set search_path = public
  as $$
  begin
    if not is_admin() then raise exception 'Chỉ admin được phân quyền.'; end if;
    if p_user = auth.uid() and not p_admin then raise exception 'Không tự bỏ quyền admin của chính mình được.'; end if;
    insert into profiles (user_id, role, display_name, quyen, video_quyen, du_an_quyen)
    values (
      p_user,
      case when p_admin then 'admin' else 'thanh-vien' end,
      nullif(trim(p_ten), ''),
      array(select distinct x from unnest(coalesce(p_quyen, '{}')) x where x in ('ban-tin', 'ban-tin-ql', 'san-pham', 'cap-nhat', 'up-anh', 'chi-phi')),
      array(select distinct x from unnest(coalesce(p_video, '{}')) x where x in ('lam', 'duyet')),
      coalesce(p_du_an, '{}'::jsonb)
    )
    on conflict (user_id) do update set
      role = excluded.role,
      display_name = coalesce(excluded.display_name, profiles.display_name),
      quyen = excluded.quyen,
      video_quyen = excluded.video_quyen,
      du_an_quyen = excluded.du_an_quyen;
  end $$;

revoke execute on function public.phan_quyen_ds() from public, anon;
revoke execute on function public.phan_quyen_luu(uuid, text, boolean, text[], text[], jsonb) from public, anon;
grant execute on function public.phan_quyen_ds() to authenticated;
grant execute on function public.phan_quyen_luu(uuid, text, boolean, text[], text[], jsonb) to authenticated;
