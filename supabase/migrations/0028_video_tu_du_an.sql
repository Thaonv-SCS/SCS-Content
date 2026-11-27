-- B3: Video editor dựng theo kịch bản + shotlist của Dự án video.
-- App chụp lại kịch bản + shotlist lúc bấm "Tạo video từ dự án" vào video_jobs.kich_ban.
-- Máy dựng đọc qua hành động "lay_viec" (đã select *) → KHÔNG cần deploy lại Edge Function.

alter table video_jobs add column if not exists du_an_id uuid references du_an(id) on delete set null;
alter table video_jobs add column if not exists kich_ban jsonb;
create index if not exists video_jobs_du_an on video_jobs (du_an_id) where du_an_id is not null;
