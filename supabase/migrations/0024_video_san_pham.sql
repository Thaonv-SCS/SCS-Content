-- Link video YouTube / TikTok chèn vào mô tả sản phẩm (ngay dưới bảng thông số) khi đẩy lên web.
alter table products add column if not exists video_links text[] not null default '{}';
-- Lịch sử chèn video hàng loạt theo SKU (menu Up ảnh) ghi chung bảng image_uploads với mode 'video'.
alter table image_uploads drop constraint if exists image_uploads_mode_check;
alter table image_uploads add constraint image_uploads_mode_check check (mode in ('append', 'replace', 'thumb', 'video'));
