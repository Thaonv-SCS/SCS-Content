-- Bước AI: lưu kết quả phân loại trên từng bài, thêm dữ liệu hiển thị và trạng thái cho gợi ý.

alter table raw_items
  add column classification jsonb,
  add column classified_at timestamptz;
create index raw_items_unclassified_idx on raw_items (discovered_at) where classified_at is null;

alter table suggestions
  add column sources jsonb,                       -- [{ name, url, published_at }]
  add column image_urls text[] not null default '{}',
  add column status text not null default 'new' check (status in ('new', 'picked', 'skipped'));
