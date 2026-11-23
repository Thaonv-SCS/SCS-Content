-- Dự án video — giai đoạn A1: kho tri thức (thương hiệu, dữ liệu khán giả, insight, 6 khuôn video),
-- quyền theo bước, trần chi phí riêng. Kế hoạch: docs/KE-HOACH-DU-AN-VIDEO.md
--
-- Quyền: admin toàn quyền. Người khác được giao theo bước qua profiles.du_an_quyen, vd
--   {"y-tuong": ["lam","duyet"], "kich-ban": ["duyet"]}
-- Bước: y-tuong · ke-hoach · kich-ban (giai đoạn B thêm shotlist). Kho tri thức: ai có quyền dự án thì ĐỌC, chỉ admin SỬA.

-- ───────────── Quyền ─────────────
alter table profiles add column if not exists du_an_quyen jsonb not null default '{}'::jsonb;

-- p_buoc null = có quyền dự án nào đó; p_loai null = làm hoặc duyệt đều được
create or replace function public.du_an_co_quyen(p_buoc text default null, p_loai text default null) returns boolean
  language sql stable security definer set search_path = public
  as $$
    select coalesce(
      (select case
         when p.role = 'admin' then true
         when p_buoc is null then exists (select 1 from jsonb_each(p.du_an_quyen) e where jsonb_array_length(e.value) > 0)
         when p_loai is null then jsonb_array_length(coalesce(p.du_an_quyen -> p_buoc, '[]'::jsonb)) > 0
         else coalesce(p.du_an_quyen -> p_buoc, '[]'::jsonb) ? p_loai
       end
       from profiles p where p.user_id = auth.uid()),
      false) $$;

-- ───────────── Kho tri thức ─────────────
-- Mỗi mục một dòng: 'thuong-hieu' (câu trả lời bảng câu hỏi), 'khan-gia' (insight AI tóm tắt + bản đã duyệt), 'bai-hoc' (giai đoạn A4)
create table du_an_kien_thuc (
  muc text primary key,
  noi_dung jsonb not null default '{}'::jsonb,
  job_status text not null default 'idle' check (job_status in ('idle', 'queued', 'running', 'done', 'failed')),
  job_error text,
  job_started_at timestamptz,
  cap_nhat_luc timestamptz not null default now(),
  cap_nhat_boi uuid references auth.users(id) on delete set null default auth.uid()
);
alter table du_an_kien_thuc enable row level security;
create policy "xem" on du_an_kien_thuc for select to authenticated using (du_an_co_quyen());
create policy "admin_all" on du_an_kien_thuc for all to authenticated using (is_admin()) with check (is_admin());
insert into du_an_kien_thuc (muc, cap_nhat_boi) values ('thuong-hieu', null), ('khan-gia', null), ('bai-hoc', null) on conflict do nothing;

-- Dữ liệu khán giả thô: bình luận, tin nhắn, số liệu xuất từ Facebook / TikTok / YouTube
create table du_an_khan_gia_du_lieu (
  id uuid primary key default gen_random_uuid(),
  nguon text not null check (nguon in ('facebook', 'tiktok', 'youtube', 'tin-nhan', 'khac')),
  loai text not null check (loai in ('binh-luan', 'so-lieu', 'tin-nhan', 'khac')),
  ten text not null,
  noi_dung text not null,
  so_ky_tu int generated always as (length(noi_dung)) stored,
  tu_ngay date,
  den_ngay date,
  -- tóm tắt riêng của file này (AI rẻ đọc 1 lần, lần tóm tắt sau dùng lại); null = chưa tóm tắt
  tom_tat text,
  tao_luc timestamptz not null default now(),
  tao_boi uuid references auth.users(id) on delete set null default auth.uid()
);
alter table du_an_khan_gia_du_lieu enable row level security;
create policy "xem" on du_an_khan_gia_du_lieu for select to authenticated using (du_an_co_quyen());
create policy "admin_all" on du_an_khan_gia_du_lieu for all to authenticated using (is_admin()) with check (is_admin());
create index du_an_khan_gia_du_lieu_tao_luc on du_an_khan_gia_du_lieu (tao_luc desc);

-- 6 khuôn video. noi_dung: muc_tieu, khi_nao_dung, do_dai, nguoi_noi, nhip[{ten,mo_ta,giay}], hook_mau[], nen_tranh[], phong_cach_dung, ghi_chu, trang_thai ('nhap' | 'da-hoc-tu-mau')
create table du_an_khuon (
  ma text primary key,
  ten text not null,
  thu_tu int not null default 0,
  noi_dung jsonb not null default '{}'::jsonb,
  video_mau jsonb not null default '[]'::jsonb,   -- [{link, ghi_chu, them_luc}]
  cap_nhat_luc timestamptz not null default now(),
  cap_nhat_boi uuid references auth.users(id) on delete set null default auth.uid()
);
alter table du_an_khuon enable row level security;
create policy "xem" on du_an_khuon for select to authenticated using (du_an_co_quyen());
create policy "admin_all" on du_an_khuon for all to authenticated using (is_admin()) with check (is_admin());

insert into du_an_khuon (ma, ten, thu_tu, noi_dung, cap_nhat_boi) values
('review', 'Review', 1, $${
  "muc_tieu": "Giúp người xem quyết định có nên mua một sản phẩm cụ thể không.",
  "khi_nao_dung": "Sản phẩm mới về, sản phẩm chủ lực cần đẩy bán, sản phẩm khách hỏi nhiều.",
  "do_dai": "60–120 giây",
  "nguoi_noi": "1 người",
  "nhip": [
    {"ten": "Hook", "mo_ta": "Câu hỏi / nhận định gây tò mò về điểm đáng chú ý nhất (giá, công nghệ, cảm giác đi)", "giay": "0–3"},
    {"ten": "Giới thiệu nhanh", "mo_ta": "Tên sản phẩm, dòng, phân khúc giá, dành cho ai", "giay": "3–10"},
    {"ten": "Chi tiết nổi bật", "mo_ta": "2–4 điểm: upper, đế, form, công nghệ — mỗi điểm cầm / chỉ vào sản phẩm", "giay": "10–60"},
    {"ten": "Nhược điểm / lưu ý", "mo_ta": "Ai không hợp, lưu ý size — tăng độ tin", "giay": "60–80"},
    {"ten": "Kết luận + CTA", "mo_ta": "Có đáng mua không, giá, cách mua", "giay": "80–100"}
  ],
  "hook_mau": ["Đôi giày X có đáng tiền Y không?", "Đừng mua X nếu chưa biết điều này", "Lần đầu cầm X trên tay, tao bất ngờ vì…"],
  "nen_tranh": ["Khen chung chung, không có chi tiết cầm nắm được", "Không nói nhược điểm → mất tin tưởng", "Đọc thông số như catalogue"],
  "phong_cach_dung": "co-ban",
  "ghi_chu": "",
  "trang_thai": "nhap"
}$$::jsonb, null),
('top', 'Top sản phẩm', 2, $${
  "muc_tieu": "Gợi ý nhanh nhiều lựa chọn theo một tiêu chí (giá, sân, vị trí, chân bè…).",
  "khi_nao_dung": "Mùa mua sắm, khách phân vân nhiều mẫu, đẩy nhiều mã cùng lúc.",
  "do_dai": "45–90 giây",
  "nguoi_noi": "1 người",
  "nhip": [
    {"ten": "Hook", "mo_ta": "Nêu tiêu chí + lời hứa: 'Top 3 giày sân cỏ nhân tạo dưới 1 triệu'", "giay": "0–3"},
    {"ten": "Từng sản phẩm", "mo_ta": "Mỗi sản phẩm 10–20 giây: tên, giá, 1–2 điểm mạnh, hợp với ai — đếm ngược hoặc đếm xuôi", "giay": "3–75"},
    {"ten": "Chốt + CTA", "mo_ta": "Gợi ý chọn theo nhu cầu, mời bình luận / inbox", "giay": "75–90"}
  ],
  "hook_mau": ["Top 3 đôi X đáng mua nhất tầm giá Y", "Chân bè chọn giày gì? Đây là 3 đôi", "Số 1 sẽ làm anh em bất ngờ"],
  "nen_tranh": ["Quá nhiều sản phẩm, mỗi cái nói qua loa", "Tiêu chí không rõ", "Không nói giá"],
  "phong_cach_dung": "co-ban",
  "ghi_chu": "",
  "trang_thai": "nhap"
}$$::jsonb, null),
('hoi-dap', 'Hỏi đáp', 3, $${
  "muc_tieu": "Trả lời một câu hỏi khách hay hỏi; xây hình ảnh shop hiểu nghề, tư vấn tận tâm.",
  "khi_nao_dung": "Câu hỏi lặp lại trong bình luận / tin nhắn (size, sân, bảo quản, thật giả…).",
  "do_dai": "30–90 giây",
  "nguoi_noi": "1 người tự đọc câu hỏi, hoặc 2 người (hỏi – đáp)",
  "nhip": [
    {"ten": "Câu hỏi", "mo_ta": "Đọc / hiện nguyên văn câu hỏi của khách (bình luận, tin nhắn)", "giay": "0–4"},
    {"ten": "Trả lời ngắn", "mo_ta": "Đáp án một câu, đi thẳng vào vấn đề", "giay": "4–10"},
    {"ten": "Giải thích + minh họa", "mo_ta": "Vì sao, kèm sản phẩm / ví dụ thực tế", "giay": "10–70"},
    {"ten": "CTA", "mo_ta": "Mời hỏi tiếp trong bình luận — câu hỏi hay sẽ làm video", "giay": "70–90"}
  ],
  "hook_mau": ["Anh em hỏi: X — trả lời luôn", "90% anh em chọn sai size giày X vì…", "Câu hỏi nhận nhiều nhất tuần này"],
  "nen_tranh": ["Vòng vo trước khi trả lời", "Câu hỏi bịa, không giống chữ khách thật", "Trả lời sai chính sách / thông số"],
  "phong_cach_dung": "co-ban",
  "ghi_chu": "",
  "trang_thai": "nhap"
}$$::jsonb, null),
('storytelling', 'Storytelling', 4, $${
  "muc_tieu": "Kể một câu chuyện (khách hàng, đôi giày, cầu thủ, shop) để tạo cảm xúc và gắn kết thương hiệu.",
  "khi_nao_dung": "Sản phẩm có câu chuyện, sự kiện bóng đá, kỷ niệm của shop, khách hàng đặc biệt.",
  "do_dai": "60–150 giây",
  "nguoi_noi": "1 người kể, có thể kèm phỏng vấn nhân vật",
  "nhip": [
    {"ten": "Hook", "mo_ta": "Mở bằng khoảnh khắc / mâu thuẫn hấp dẫn nhất của câu chuyện", "giay": "0–5"},
    {"ten": "Bối cảnh", "mo_ta": "Ai, ở đâu, chuyện gì", "giay": "5–25"},
    {"ten": "Cao trào", "mo_ta": "Vấn đề / khó khăn / bước ngoặt", "giay": "25–80"},
    {"ten": "Kết + thông điệp", "mo_ta": "Kết quả, bài học, sản phẩm xuất hiện tự nhiên", "giay": "80–120"},
    {"ten": "CTA nhẹ", "mo_ta": "Mời chia sẻ câu chuyện của người xem / theo dõi kênh", "giay": "120–150"}
  ],
  "hook_mau": ["Đôi giày này suýt bị vứt đi, cho đến khi…", "Khách quay lại shop sau 3 năm chỉ để nói một câu", "Chuyện chưa kể về X"],
  "nen_tranh": ["Kể dài dòng, cao trào đến quá muộn", "Bán hàng lộ liễu làm mất cảm xúc", "Bịa tình tiết"],
  "phong_cach_dung": "co-ban",
  "ghi_chu": "",
  "trang_thai": "nhap"
}$$::jsonb, null),
('so-sanh', 'So sánh', 5, $${
  "muc_tieu": "Giúp người xem chọn giữa 2–3 lựa chọn (2 phiên bản, 2 hãng, 2 tầm giá).",
  "khi_nao_dung": "Khách phân vân giữa các mẫu, bản thường vs bản cao cấp, mẫu cũ vs mẫu mới.",
  "do_dai": "60–120 giây",
  "nguoi_noi": "1 người, hoặc 2 người mỗi người bênh một bên",
  "nhip": [
    {"ten": "Hook", "mo_ta": "Đặt 2 lựa chọn cạnh nhau + câu hỏi 'chọn cái nào?'", "giay": "0–3"},
    {"ten": "Điểm giống", "mo_ta": "Nói nhanh để tập trung vào khác biệt", "giay": "3–12"},
    {"ten": "Khác biệt", "mo_ta": "2–4 tiêu chí, mỗi tiêu chí đặt 2 sản phẩm cạnh nhau (thẻ so sánh)", "giay": "12–80"},
    {"ten": "Kết luận theo nhu cầu", "mo_ta": "Ai nên chọn cái nào — không cần có người thắng tuyệt đối", "giay": "80–105"},
    {"ten": "CTA", "mo_ta": "Mời bình luận chọn bên nào / inbox tư vấn", "giay": "105–120"}
  ],
  "hook_mau": ["X hay Y — tiền nào của nấy thật không?", "Bản 99K và bản 199K khác nhau ở đâu?", "Đừng mua X khi chưa xem Y"],
  "nen_tranh": ["Chê đối thủ / hãng khác đích danh", "So tiêu chí không công bằng", "Kết luận mơ hồ"],
  "phong_cach_dung": "co-ban",
  "ghi_chu": "",
  "trang_thai": "nhap"
}$$::jsonb, null),
('meo', 'Mẹo', 6, $${
  "muc_tieu": "Chia sẻ mẹo hữu ích (chọn size, bảo quản, buộc dây, chọn giày theo sân…) để người xem lưu lại và theo dõi.",
  "khi_nao_dung": "Lấp lịch đăng đều, tăng lưu / chia sẻ, gắn mềm sản phẩm liên quan.",
  "do_dai": "30–75 giây",
  "nguoi_noi": "1 người",
  "nhip": [
    {"ten": "Hook", "mo_ta": "Nêu vấn đề hoặc lợi ích ngay: 'Giày nhanh bong keo? Do anh em làm sai bước này'", "giay": "0–3"},
    {"ten": "Các bước / mẹo", "mo_ta": "1–3 mẹo, mỗi mẹo có minh họa trực tiếp bằng tay / sản phẩm", "giay": "3–55"},
    {"ten": "Chốt + CTA", "mo_ta": "Nhắc lưu video, gợi ý sản phẩm liên quan nhẹ nhàng", "giay": "55–75"}
  ],
  "hook_mau": ["3 giây biết ngay giày có vừa chân không", "Sai lầm khi giặt giày mà 90% anh em mắc", "Mẹo buộc dây giúp ôm chân hơn"],
  "nen_tranh": ["Mẹo không làm thử trên hình", "Quá nhiều mẹo một video", "Mẹo sai kỹ thuật"],
  "phong_cach_dung": "co-ban",
  "ghi_chu": "",
  "trang_thai": "nhap"
}$$::jsonb, null)
on conflict (ma) do nothing;

-- ───────────── Chi phí: trần riêng ─────────────
insert into settings (key, value) values ('du_an_tran_ngay_usd', '3') on conflict (key) do nothing;

create or replace function public.du_an_chi_hom_nay() returns numeric
  language sql stable security definer set search_path = public
  as $$ select coalesce(sum(cost_usd), 0) from llm_calls
        where purpose like 'du-an:%'
          and created_at >= (date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh') $$;

create or replace function public.du_an_tran_ngay() returns numeric
  language sql stable security definer set search_path = public
  as $$ select coalesce((select (value #>> '{}')::numeric from settings where key = 'du_an_tran_ngay_usd'), 3) $$;

-- Trần bản tin + Post sản phẩm: không tính tiền video (job_id) và tiền dự án video (purpose 'du-an:%')
create or replace function public.ai_spent_today() returns numeric
  language sql stable security definer set search_path = public
  as $$ select coalesce(sum(cost_usd), 0) from llm_calls
        where job_id is null
          and purpose not like 'du-an:%'
          and created_at >= (date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh') $$;

-- Người có quyền dự án được ghi chi phí AI của dự án
create policy "du_an_insert" on llm_calls for insert to authenticated
  with check (purpose like 'du-an:%' and du_an_co_quyen());
