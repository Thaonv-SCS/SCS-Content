-- Nhập nhiều sản phẩm KHÁC NHAU từ Excel: dùng lại bảng lô, phân biệt bằng "kind".
--   variants = cùng mẫu nhiều màu (phiếu chung, màu sau tránh lặp màu trước)
--   import   = mỗi dòng Excel là một sản phẩm riêng (phiếu riêng, danh mục riêng)
alter table product_batches add column kind text not null default 'variants' check (kind in ('variants', 'import'));
