-- Module VIDEO: cấu hình từng máy worker (CPU, RAM, card, cách dựng, ước tính thời gian dựng, thư mục làm việc).
-- Máy đo bằng cong-cu/kiem-tra-may.py rồi gửi lên mỗi lần báo "đang bật" (Edge Function video-worker → "chao").
alter table video_workers add column if not exists cau_hinh jsonb not null default '{}';
