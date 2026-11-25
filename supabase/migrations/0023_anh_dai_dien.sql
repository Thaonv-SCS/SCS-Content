-- Up ảnh đại diện (thumb ở catalogue) hàng loạt: lịch sử ghi chung bảng image_uploads với mode 'thumb'.
-- thumb_cu = id ảnh đại diện CŨ trong Thư viện Media (để đặt lại khi up nhầm).
alter table image_uploads drop constraint if exists image_uploads_mode_check;
alter table image_uploads add constraint image_uploads_mode_check check (mode in ('append', 'replace', 'thumb'));
alter table image_uploads add column if not exists thumb_cu bigint;
