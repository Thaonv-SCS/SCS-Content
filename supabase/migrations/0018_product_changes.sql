-- Trang "Cập nhật sản phẩm": lịch sử đổi giá và size dùng chung bảng stock_changes (thêm cột).
--   kind = stock (tình trạng / hiển thị) | price (giá) | size (thêm / bớt size) | merge_size (gộp 40½ → 40.5)
alter table stock_changes add column kind text not null default 'stock' check (kind in ('stock', 'price', 'size', 'merge_size'));
alter table stock_changes add column old_regular numeric;
alter table stock_changes add column new_regular numeric;
alter table stock_changes add column old_sale numeric;      -- null = không giảm giá
alter table stock_changes add column new_sale numeric;
alter table stock_changes add column old_sizes text[];
alter table stock_changes add column new_sizes text[];
