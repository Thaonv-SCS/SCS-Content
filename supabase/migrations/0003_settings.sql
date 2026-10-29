-- Cài đặt chỉnh từ web app (bật/tắt lịch chạy, tự tạm dừng, trần chi phí) + đánh dấu bản tin đã xem.

create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table settings enable row level security;
create policy "owner_all" on settings for all to authenticated using (true) with check (true);

insert into settings (key, value) values
  ('schedule_enabled', 'true'),   -- lịch 6h sáng có chạy không
  ('auto_pause_days', '3'),       -- N bản tin liên tiếp chưa xem thì tự dừng (0 = không tự dừng)
  ('daily_budget_usd', '3');      -- trần chi phí AI mỗi ngày

alter table digests add column viewed_at timestamptz;
