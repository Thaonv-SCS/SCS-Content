-- Sửa lỗi: trần chi phí ngày của bản tin + Post sản phẩm (settings.daily_budget_usd) đang cộng cả tiền VIDEO,
-- trong khi video có trần riêng (video_tran_ngay_usd, hàm video_chi_hom_nay chỉ tính dòng có job_id).
-- Ngày dựng vài video là viết sản phẩm / chạy bản tin bị chặn oan. Từ giờ: không tính dòng của video (job_id có giá trị).
create or replace function public.ai_spent_today() returns numeric
  language sql stable security definer set search_path = public
  as $$ select coalesce(sum(cost_usd), 0) from llm_calls
        where job_id is null
          and created_at >= (date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh') $$;

create index if not exists llm_calls_job_idx on llm_calls (job_id) where job_id is not null;
