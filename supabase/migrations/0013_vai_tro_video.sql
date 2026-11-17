-- Vai trò 'video': tài khoản CHỈ dùng module Video (không thấy / không sửa được sản phẩm, tồn kho, ảnh, bản tin).
-- Dữ liệu sản phẩm đã tự chặn: can_write_products() chỉ cho 'admin' / 'staff'.
--
-- 4 loại tài khoản (chủ shop chốt 2026-11-17):
--   admin            : mọi thứ (role 'admin')
--   admin2           : post sản phẩm + video   → role 'staff', video_quyen '{lam,duyet}'
--   post             : chỉ post sản phẩm       → role 'staff', video_quyen '{}'
--   video            : chỉ video, duyệt luôn   → role 'video', video_quyen '{lam,duyet}'

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('admin', 'staff', 'video'));
