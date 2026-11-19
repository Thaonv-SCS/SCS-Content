# Lộ trình phát triển — Soccerstore Content

Cập nhật: 2026-11-19. File này tổng hợp **đã làm gì, đang ở đâu, dự kiến làm gì**. Mỗi khi xong một mốc hoặc chốt hướng mới thì sửa file này.

App gồm 2 repo:
- **Content APP** (`github.com/Thaonv-SCS/SCS-Content`): web trên Netlify + database Supabase. Chứa bản tin, Post sản phẩm, Cập nhật sản phẩm, Up ảnh, và **giao diện** module Video.
- **SCS Video Studio** (`github.com/Thaonv-SCS/SCS-Video-Studio`): phần **dựng video** chạy trên máy worker (bộ não Claude, ffmpeg). Chi tiết kỹ thuật: `BAN-DO-KY-THUAT.md` trong repo đó.

## Tổng quan

| Mốc | Nội dung | Trạng thái |
|---|---|---|
| Giai đoạn 1 | Bản tin ý tưởng content mỗi ngày | ✅ Xong 2026-11-11 (tag `giai-doan-1`) |
| Giai đoạn 1.5 | Viết content + quản lý sản phẩm WooCommerce | ✅ Xong 2026-11-18 |
| Module Video | Dựng video ngắn tự động (V1 → V3 → V2) | 🔄 V3 đang chạy thật (giai đoạn 4) |
| Giai đoạn 2 | Phân tích hình ảnh để học gu | ⏳ Chưa làm |
| Giai đoạn 3 | Mẫu ảnh đăng bài (template) | ⏳ Chưa làm |

---

## Giai đoạn 1 — Bản tin ý tưởng content ✅
Mỗi sáng tổng hợp tin giày & bóng đá, gợi ý bài đăng. Không bao giờ tự đăng bài.
- Nguồn: website (RSS / sitemap), football-data.org (tỉ số), 7 nguồn Việt Nam. Thêm / sửa / thử / xóa nguồn ngay trong app, tự dò RSS / sitemap.
- AI phân loại + chấm điểm → bản tin 12 gợi ý: 6 giày · 2 cầu thủ · 2 sự kiện · 2 Việt Nam, kèm ngăn phụ áo đấu (1–2) và bóng & phụ kiện (0–1).
- Mỗi gợi ý: tóm tắt tiếng Việt, lý do chọn, góc khai thác, caption dài / ngắn, mục "cần xác minh".
- Nút Chọn / Bỏ / Sửa có nhãn; kho caption + ghi chú văn phong tự cập nhật mỗi +10 caption.
- Cài đặt: bật/tắt lịch 6h sáng, tự tạm dừng khi bản tin chưa xem, trần chi phí AI/ngày, nút "Chạy ngay".
- Chi phí khoảng $0,5/bản tin.

## Giai đoạn 1.5 — Viết content + quản lý sản phẩm WooCommerce ✅
**Post sản phẩm**
- Phiếu nhập (giày đúng 8 dòng bảng thông số web; bóng / găng / phụ kiện) → AI viết: tiêu đề SEO, meta, từ khóa, mô tả ngắn, mô tả dài (bảng thông số + 3–4 đoạn), tags, slug, alt ảnh, mục "còn thiếu" / "cần kiểm tra".
- Link nội bộ 3 đích theo thứ tự: danh mục dòng → trang hãng → loại sân.
- "Tìm thêm thông tin" trên web có nguồn; sửa tay; viết lại theo yêu cầu.
- Tạo **bản nháp** WooCommerce: tên, mã, giá + giá KM, size, Loại Đinh (kèm loại sân), Hãng (XStore), danh mục, tags, Yoast.
- Nhập **nhiều màu** một lần (màu sau không viết lặp màu trước); **nhập từ Excel** nhiều sản phẩm khác nhau (file mẫu, kiểm tra trùng mã trên web).
- **Dán nội dung soạn sẵn** (không dùng AI): mô tả giữ nguyên bài dán, app tự gắn link nội bộ (dòng → hãng → loại sân) bằng cách dò chữ trong bài, báo link nào không gắn được.
- Học văn phong: tự rút luật từ bản sửa tay (mỗi +10 bản), mẫu chuẩn chọn trong app; bài đã đẩy lên web được ưu tiên làm mẫu.
- Phân quyền admin / nhân viên; chi phí AI theo người. Chi phí khoảng $0,10/bài viết, $0,15–0,2/lần tìm thêm.

**Cập nhật sản phẩm** (sửa thẳng trên web, có lịch sử + hoàn tác)
- Tình trạng còn / hết hàng + chế độ hiển thị (4 mức). Chuyển sang hết hàng thì tự bỏ giá sale, về giá gốc (Hoàn tác trả lại).
- Giá niêm yết / giá sale sửa trên từng dòng; dán bảng từ Excel hoặc áp chung (giảm %, làm tròn 10.000đ).
- Size sửa trên từng dòng kiểu WooCommerce (không tự tạo size mới); gộp size 40.5 bị trùng (~448 sản phẩm).

**Up ảnh sản phẩm**
- Chọn thư mục mẹ (thư mục con = mã) → tự khớp mã → thu nhỏ 1024px → chèn cuối mô tả (thêm hoặc thay toàn bộ ảnh cũ).

**Hạ tầng làm trong giai đoạn này:** gọi web qua Cloudflare bằng mã bí mật `SITE_ACCESS_TOKEN` (luật Cloudflare 1/4/5, đã tắt Bot Fight Mode).

## Module Video 🔄
Dựng video ngắn dọc 9:16 (TikTok / Reels / Shorts) từ footage có lời nói sẵn, 15–20 video/tuần. Trước đây dựng tay ~2 giờ/video.

| Bản | Nội dung | Trạng thái |
|---|---|---|
| **V1** | Claude Code + lệnh `/dung-video` trên máy (proxy, chuyển lời, kho cảnh, dàn ý, cảnh trám, thẻ đồ họa, kế hoạch dựng, render, tự kiểm tra), phong cách `co-ban`, SFX theo nghĩa, sticker né mặt | ✅ Xong 2026-11-16 — video thử mất 15 phút công người |
| **V3** (làm trước V2) | Lên app: tạo việc, 3 cổng duyệt (dàn ý → thẻ → bản nháp), góp ý / chốt, máy worker nhận việc bằng chìa khóa máy, tự cập nhật code, nhiều máy (tự giao theo footage), quyền theo thư mục footage, chi phí theo video, vai trò `video` | ✅ Giai đoạn 0–3 xong 2026-11-17 · 🔄 **Giai đoạn 4: chạy thật 5–10 video** |
| **V2** | Video không lời + giọng clone HeyGen, ảnh cảnh trám bằng AI, chữ động, nhạc khớp nhịp | ⏳ Chưa làm |

- Chi phí đo thật: $1,07–1,53/video; trần $8/ngày.
- Tiêu chí giai đoạn 4: ≤ 60 phút công người/video, ≥ 7/10 bản nháp dùng được (số liệu ở Video → Lịch sử tất cả máy).
- Việc còn lại: cài thử máy công ty; nút "Dựng lại không tốn AI"; giới hạn tải lên 50 MB/file (file nặng chép USB); thêm phong cách mới khi có video mẫu.

## Giai đoạn 2 — Phân tích hình ảnh để học gu ⏳
AI xem ảnh (cầu thủ, giày, bối cảnh) trong các tin mày Chọn / Bỏ ở bản tin → hiểu gu, chọn tin và ảnh sát gu hơn.
- Điều kiện bắt đầu: bản tin đã có đủ lượt Chọn / Bỏ (khoảng 50) để học.
- Chi tiết: bàn và chốt khi bắt đầu.

## Giai đoạn 3 — Mẫu ảnh đăng bài ⏳
Làm ảnh đăng bài theo mẫu (template) của shop. Chi tiết: bàn và chốt khi tới lúc.

## Việc lặt vặt còn treo
- Bản tin: tắt nguồn Unisport (bị chặn HTTP 405); nguồn X / Instagram; nguồn website không có RSS (kiểu Futbolemotion).
- Video: xem mục Module Video ở trên.

---

## Quy ước làm việc
- **Đẩy code:** thử kỹ trên máy, chỉ commit + đẩy khi chủ shop chốt. Gộp nhiều thay đổi vào 1 lần đẩy (Netlify gói miễn phí 300 credit/tháng).
- **Migration Supabase:** số tăng dần, lấy số kế tiếp sau số lớn nhất hiện có (hiện tới `0018`). Chạy migration trên Supabase **trước** khi đẩy code dùng nó.
- **Module Video:** sửa trên bản sao `D:\SCS Video Studio dev` (laptop chủ shop là máy worker thật, chạy code từ `D:\SCS Video Studio`). Việc chạm cả app lẫn worker: đẩy theo thứ tự database → worker → web.
- **Mốc phiên bản (tag git):** `giai-doan-N` cho app, `video-vN` cho Video; đánh dấu khi xong một giai đoạn / bản lớn.
- **Chi phí AI / dịch vụ trả phí:** mọi lần gọi ghi vào bảng `llm_calls` với `purpose = "<loại>:<bước>"` (vd `image:tao-anh`, `voice:doc-loi`) → tự hiện ở Cài đặt → Chi phí AI. Thêm tên tiếng Việt cho loại / bước ở `packages/core/src/costs.ts`. Chi phí của 1 video ghi kèm `job_id` (tính vào trần video, không tính vào trần bản tin + sản phẩm).

## Lịch sử phiên bản
| Ngày | Repo | Mốc |
|---|---|---|
| 2026-10-29 | Content APP | Bản đầu tiên: bản tin ý tưởng (giai đoạn 1), lên Netlify |
| 2026-11-11 | Content APP | Quản lý nguồn trong app — tag `giai-doan-1` |
| 2026-11-12 | Content APP | Post sản phẩm hoàn thiện (1.5a + 1.5b, tình trạng hàng, nhập Excel, up ảnh) |
| 2026-11-16 | Video Studio | V1: công cụ dựng + `/dung-video`; V3 giai đoạn 0–2 (bộ não API, máy worker) |
| 2026-11-16–17 | Content APP | Module Video trên app (V3 giai đoạn 2–3), nhiều máy, quyền footage |
| 2026-11-17 | Video Studio | Worker chạy ngầm, chịu lỗi mạng, kiểm tra cấu hình máy |
| 2026-11-18 | Content APP | Cập nhật sản phẩm: giá + size sửa trên dòng, gộp size 40.5; lộ trình này |
