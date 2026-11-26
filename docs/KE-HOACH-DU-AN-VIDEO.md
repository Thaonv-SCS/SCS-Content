# Kế hoạch module "Dự án video" (tiền kỳ → nối Video editor)

Chốt: 2026-11-20. File này là kế hoạch chi tiết của module; tổng quan cả app ở `LO-TRINH.md`.
Mỗi khi xong một phần hoặc đổi quyết định → sửa cột **Trạng thái** và mục **Nhật ký quyết định**.

## Mục tiêu
Chủ shop (giám đốc marketing) nhập **một ý tưởng** → app làm như một đội sản xuất: **strategist → scriptwriter → director → editor**.
Mỗi bước có duyệt (hoặc chạy thẳng nếu chọn làm nhanh), cuối cùng nối vào **Video editor** đã có để ra video.

Loại video: người nói trước máy, hội thoại, hỏi đáp, phỏng vấn (1–2 người nói). **Không** làm video không lời.
Khuôn video: Review · Top sản phẩm · Hỏi đáp · Storytelling · So sánh · Mẹo.

## Quy trình đầy đủ (khi xong cả A → C)
```
Brief → ① Ý tưởng → ② Kế hoạch nội dung → ③ Kịch bản → ④ Đạo diễn + Shotlist → ⑤ Quay (người) → ⑥ Dựng (Video editor) → ⑦ Đăng & đo
        [duyệt]      [duyệt]                 [duyệt]      [duyệt]                                      [3 cổng như cũ]         [học lại]
```
- **Hai chế độ khi tạo dự án:** *Qua các bước duyệt* (dừng ở mỗi cổng) hoặc *Làm nhanh* (tự chạy hết tới kịch bản, AI tự chọn góc tốt nhất, không dừng duyệt).
- Mọi bước giữ lịch sử phiên bản; quay lại bước trước được, các bước sau làm lại.
- Mọi bước đọc chung **Kho tri thức** (bên dưới) — đây là thứ quyết định chất lượng.

## Kho tri thức (dùng chung mọi bước)
| Mục | Nội dung | Nguồn |
|---|---|---|
| Thương hiệu | Shop là ai, giọng nói, xưng hô, từ nên / cấm, CTA, chính sách (bảo hành, đổi trả, ship) | Chủ shop trả lời bảng câu hỏi trong app |
| Dữ liệu khán giả (thô) | Bình luận, tin nhắn khách, số liệu video cũ | Dán / tải file xuất từ Meta Business Suite, TikTok Studio, YouTube Studio. **Tin nhắn Messenger**: tải thẳng file xuất JSON của Facebook (.zip) — app đọc trên trình duyệt, che tên / sđt / email / địa chỉ, chọn ngẫu nhiên ~1,2 triệu ký tự (200–400 hội thoại), AI đọc riêng theo hành trình tư vấn → chốt đơn |
| Khán giả (insight) | Chân dung khách, nỗi lo, câu hỏi hay gặp, chữ khách dùng, nội dung chạy tốt | AI tóm tắt từ dữ liệu thô → chủ shop duyệt / sửa. Các bước sau chỉ đọc bản này |
| Sản phẩm | Thông số, giá, công nghệ | WooCommerce (đã có) |
| Khuôn video | Mục tiêu, các nhịp, độ dài, số người nói, kiểu hook, lỗi hay gặp, video mẫu | Bản nháp ban đầu + phân tích video mẫu (bổ sung dần) |
| Bài học | Luật rút ra từ các lần chủ shop sửa / chọn | App tự gom, chủ shop duyệt |

## Các giai đoạn
| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| **A** | Kho tri thức + Brief → ① Ý tưởng → ② Kế hoạch → ③ Kịch bản (duyệt hoặc làm nhanh) | 🔄 Đang làm |
| **B** | ④ Đạo diễn + shotlist (mã cảnh, cỡ cảnh, góc máy, đạo cụ, checklist buổi quay) · quy ước đặt tên footage theo mã cảnh · Video editor đọc kịch bản + shotlist (thay file .docx) · tách 2 người nói cho video hỏi đáp / phỏng vấn | 🔄 Đang làm (chốt 2026-11-26, làm trước A3–A5) |
| **C** | Kế hoạch theo chuỗi / lịch đăng · caption + chữ thumbnail · nhập số liệu sau đăng → học lại · kết nối API số liệu (YouTube / Facebook / TikTok — kiểm tra khả năng khi làm) · nút "Tạo dự án từ gợi ý bản tin" | ⏳ Chưa làm |

### Giai đoạn A — chi tiết
| Phần | Nội dung | Trạng thái |
|---|---|---|
| A1 | **Kho tri thức**: trang Thương hiệu (bảng câu hỏi), nhập dữ liệu khán giả (dán / tải file), AI tóm tắt insight + duyệt, 6 khuôn video (bản nháp, sửa được, gắn video mẫu). Menu "Dự án video", đổi menu Video → "Video editor". Trần chi phí riêng (mặc định $3/ngày, chỉnh trong app). Quyền theo bước (cột dữ liệu sẵn, admin toàn quyền) | 🔄 Code xong 2026-11-20, migration `0020` đã chạy — chủ shop đang điền Thương hiệu. 2026-11-23: thêm nhập file xuất tin nhắn Messenger (chờ file thật từ Facebook) |
| A2 | **Quy trình dự án**: Brief → ① Ý tưởng (insight có bằng chứng, 3 góc, chấm điểm, hook, đề xuất) → ② Kế hoạch nội dung → ③ Kịch bản 2 cột (lời ↔ hình, người nói A/B, thời lượng, hook phương án, "cần xác minh"); duyệt / viết lại / sửa tay từng đoạn; chế độ làm nhanh; lịch sử phiên bản; bản xem trên điện thoại + in | 🔄 Code xong 2026-11-20 (migration `0022`), chờ chạy migration + thử |
| A3 | **Phân quyền theo bước** (giao làm / duyệt từng bước cho người khác), trang danh sách "đang chờ ai" | ⏳ |
| A4 | **Học từ bản sửa**: rút luật kịch bản / chọn góc → mục Bài học | ⏳ |
| A5 | **Chạy thử 5 dự án thật** | ⏳ |

**Tiêu chí A đạt** (đo ở A5): ≥ 4/5 kịch bản dùng được với sửa nhẹ · từ ý tưởng tới kịch bản chốt ≤ 30 phút công · chủ shop chấm insight "đúng và có ích" ≥ 3/5. Không đạt → sửa kho tri thức / khuôn trước, chưa sang B.

## Chủ shop chuẩn bị (song song, gửi dần)
- [ ] Trả lời bảng câu hỏi Thương hiệu (trong app, mục Kho tri thức → Thương hiệu)
- [ ] File xuất số liệu + bình luận ~3 tháng: Facebook (Meta Business Suite), TikTok (TikTok Studio), YouTube (YouTube Studio); tin nhắn khách hỏi nhiều
- [ ] Video mẫu từng khuôn (đủ khuôn nào làm khuôn đó): Review · Top sản phẩm · Hỏi đáp · Storytelling · So sánh · Mẹo

## Chi phí
- Trần riêng **$3/ngày** (chỉnh trong app), không tính vào trần bản tin + sản phẩm, không tính vào trần video.
- Ghi `llm_calls.purpose = "du-an:<bước>"` → tự hiện ở Cài đặt → Chi phí AI, loại "Dự án video".
- Ước (chưa đo): $0,5–1,5 / dự án tới kịch bản.

## Nhật ký quyết định
| Ngày | Quyết định |
|---|---|
| 2026-11-19 | Làm module tiền kỳ; người dùng chính là chủ shop nhưng để mở giao từng bước cho người khác; chỉ video có người nói (1–2 người); dữ liệu khán giả lấy từ FB / TikTok / YouTube; bắt đầu giai đoạn A |
| 2026-11-20 | Trần chi phí riêng $3/ngày, chỉnh được · menu "Dự án video", đổi "Video" → "Video editor" · khi tạo dự án chọn *làm nhanh* (tự chạy, không duyệt) hoặc *qua các bước duyệt* · video mẫu bổ sung dần, đủ khuôn nào làm khuôn đó |
| 2026-11-26 | Làm B trước A3/A4. Footage KHÔNG bắt đổi tên (máy dựng tự khớp clip theo lời + khung hình; file tên `C05.mp4` được ưu tiên) · shotlist chỉ xem / in, không tick `đã quay` · video 2 người: phụ đề khác màu theo người nói. Thứ tự: B1 shotlist → B3 Video editor đọc kịch bản + shotlist → B4 tách 2 người nói. B1 code xong (migration `0025`) |
| 2026-11-23 | Tin nhắn tư vấn: không gửi toàn bộ, chọn mẫu ~200–400 hội thoại dài (≥ 6 tin) 6 tháng gần nhất; lấy bằng file xuất JSON của Facebook, che thông tin cá nhân ngay trên trình duyệt; bản insight thêm mục "Hành trình tư vấn → chốt đơn" |
