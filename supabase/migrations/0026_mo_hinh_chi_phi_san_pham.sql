-- Chọn mô hình AI từng việc (Cài đặt → Mô hình AI) + chi phí AI của từng sản phẩm.

-- 1) Mô hình từng việc: lưu ở settings.mo_hinh_ai. Nhân viên không đọc bảng settings → đọc qua hàm này.
create or replace function public.mo_hinh_ai() returns jsonb
  language sql stable security definer set search_path = public
  as $$ select coalesce((select value from settings where key = 'mo_hinh_ai'), '{}'::jsonb) $$;
grant execute on function public.mo_hinh_ai() to authenticated;

-- Ghi đè mô hình riêng từng dự án video: {"kich-ban": {"model": "...", "effort": "..."}}
alter table du_an add column if not exists mo_hinh jsonb not null default '{}'::jsonb;

-- 2) Gắn mỗi lần gọi AI với sản phẩm / lô (từ giờ trở đi; chi phí cũ không biết của sản phẩm nào)
alter table llm_calls add column if not exists product_id uuid references products(id) on delete set null;
alter table llm_calls add column if not exists batch_id uuid references product_batches(id) on delete set null;
create index if not exists llm_calls_product on llm_calls (product_id) where product_id is not null;
create index if not exists llm_calls_batch on llm_calls (batch_id) where batch_id is not null;

-- Tổng chi phí AI mỗi sản phẩm = chi phí riêng + phần chia đều chi phí chung của lô (tìm thông tin cho cả lô).
-- Nhân viên không đọc được bảng llm_calls → đọc qua hàm này.
create or replace function public.chi_phi_san_pham(p_ids uuid[])
  returns table (product_id uuid, usd numeric, so_lan bigint)
  language sql stable security definer set search_path = public
  as $$
    with sp as (
      select p.id, p.batch_id from products p where p.id = any(p_ids)
    ),
    rieng as (
      select l.product_id, sum(l.cost_usd) as usd, count(*) filter (where l.purpose = 'product-write') as so_lan
      from llm_calls l where l.product_id = any(p_ids) group by l.product_id
    ),
    lo as (
      select l.batch_id, sum(l.cost_usd) as usd from llm_calls l
      where l.batch_id in (select batch_id from sp where batch_id is not null) group by l.batch_id
    ),
    mau_lo as (select batch_id, count(*) as n from products where batch_id in (select batch_id from sp where batch_id is not null) group by batch_id)
    select sp.id,
           coalesce(r.usd, 0) + coalesce(lo.usd / nullif(m.n, 0), 0),
           coalesce(r.so_lan, 0)
    from sp
    left join rieng r on r.product_id = sp.id
    left join lo on lo.batch_id = sp.batch_id
    left join mau_lo m on m.batch_id = sp.batch_id
    where can_write_products() or is_admin()
  $$;
grant execute on function public.chi_phi_san_pham(uuid[]) to authenticated;
