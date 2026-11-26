-- Dự án video — giai đoạn B1: thêm bước ④ "Đạo diễn + Shotlist" sau Kịch bản.
-- Quyền giao theo bước dùng khóa "shotlist" trong profiles.du_an_quyen, vd {"shotlist": ["lam","duyet"]}.

alter table du_an drop constraint if exists du_an_buoc_check;
alter table du_an add constraint du_an_buoc_check check (buoc in ('y-tuong', 'ke-hoach', 'kich-ban', 'shotlist'));

alter table du_an_phien_ban drop constraint if exists du_an_phien_ban_buoc_check;
alter table du_an_phien_ban add constraint du_an_phien_ban_buoc_check check (buoc in ('y-tuong', 'ke-hoach', 'kich-ban', 'shotlist'));
