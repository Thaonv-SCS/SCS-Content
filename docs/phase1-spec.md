# Đặc tả Giai đoạn 1 — Bản tin ý tưởng mỗi ngày

> Trạng thái: bản nháp v1 · 2026-10-28
> Mục tiêu: mỗi sáng mở app là có danh sách ý tưởng content về giày/bóng đá đã lọc, tóm tắt tiếng Việt, có caption nháp, không phải tự đọc từng website.

---

## 1. Phạm vi

### 1a — dùng được sớm
- Quản lý danh sách nguồn (thêm/sửa/bật/tắt, trọng số, trạng thái lỗi).
- Connector: RSS/Atom, sitemap, HTML selector, dán link tay, API dữ liệu trận đấu.
- Gom cụm/lọc trùng, phân loại theo ngăn, chấm điểm, chọn bản tin.
- Làm giàu nội dung cho ứng viên: tóm tắt tiếng Việt, lý do chọn, góc khai thác, 2 caption nháp, mục cần xác minh.
- Web app: xem bản tin, chọn / bỏ qua / sửa, gắn tag lý do.
- Danh mục: cầu thủ, dòng giày, thuật ngữ dịch.

### 1b — sau khi 1a dùng ổn 1–2 tuần
- Connector X (qua dịch vụ scrape trả phí).
- Cache thumbnail cho ứng viên.
- Thông báo Telegram (chỉ báo "bản tin đã sẵn sàng" + link).
- Trang theo dõi chi phí API + trần chi phí cứng.

### Ngoài phạm vi giai đoạn 1
- Phân tích ảnh (giai đoạn 2), template ảnh (giai đoạn 3).
- **Không có bất kỳ chức năng đăng bài nào**, kể cả nút ẩn.

---

## 2. Cấu trúc bản tin

Bản tin chính: **10 mục, tỉ lệ 6 : 2 : 2**. 5 mục đầu hiển thị là "nổi bật", 5 mục sau là "thêm lựa chọn".

| Ngăn | Số mục | Tiêu chí ăn điểm |
|---|---|---|
| **Giày** | 6 | Giày / bộ sưu tập sắp hoặc vừa ra mắt, rò rỉ, phối màu mới, collab (vd Beckham), cầu thủ mang giày "lạ" (khi có bài viết nhắc tới) |
| **Cầu thủ** | 2 | Thi đấu ấn tượng trong trận đáng chú ý, legend vừa ra sân/xuất hiện — **ưu tiên khi có góc soi giày** |
| **Sự kiện** | 2 | Trận / khoảnh khắc nổi bật ở Ngoại hạng Anh, La Liga, Cúp C1, đội tuyển quốc gia châu Âu — **ưu tiên khi có góc liên quan giày** |

**Ngăn áo đấu (riêng, ngoài 10 mục):** 1–2 mục/ngày — áo mới, áo kỷ niệm, retro, phiên bản giới hạn. Mục thứ 2 chỉ hiện khi đạt ngưỡng điểm.

**Ngày thiếu tin:** ngăn nào không đủ ứng viên đạt ngưỡng thì nhường chỗ cho ngăn khác, mục được lấp chỗ gắn nhãn **"bổ sung"**. Không ép đủ số bằng tin dở — nếu tổng ứng viên đạt ngưỡng < 10 thì bản tin ngắn hơn.

---

## 3. Mỗi mục gợi ý gồm

- Tiêu đề (tiếng Việt) + tiêu đề gốc
- Link nguồn gốc; nếu cụm có nhiều nguồn thì liệt kê tất cả
- Thời điểm đăng (theo nguồn) + thời điểm app phát hiện; nếu nguồn không có ngày đăng thì ghi rõ "không rõ, phát hiện lúc …"
- Ảnh (link ảnh gốc, bấm vào mở ảnh/bài gốc)
- Ngăn + điểm số
- Tóm tắt ngắn tiếng Việt (3–5 câu)
- Vì sao đáng làm (1–2 câu, gắn với tiêu chí ở mục 2)
- 2–3 góc khai thác
- 2 caption nháp: **bản dài** (kể chuyện, kiểu A/B/D) và **bản ngắn** (một câu cảm xúc/chơi chữ, kiểu C)
- **Cần xác minh**: các khẳng định có thể sai — số liệu, kỷ lục, ngày tháng, mẫu giày cầu thủ mang. Thông tin giày suy ra từ danh mục (không phải từ bài viết) luôn ghi "theo dữ liệu gần nhất, cần xác minh qua ảnh trận".

---

## 4. Nguồn và connector

### 4.1 Kết quả kiểm tra website (2026-10-28)

| Nguồn | Ngăn chính | Cách lấy | Tình trạng |
|---|---|---|---|
| Footy Headlines | Giày, Áo | RSS `footyheadlines.com/rss.xml` (hoặc `atom.xml`, 100 mục) | ✅ Tốt, cập nhật trong ngày |
| FourFourTwo | Giày, Sự kiện | RSS `fourfourtwo.com/feeds.xml` + news sitemap | ✅ Tốt, cả site → cần lọc chủ đề |
| Pro:Direct Blog | Giày | Atom `prodirectsport.com/blogs/football.atom` | ✅ Tốt (URL blog đúng là `/blogs/football`) |
| Football Kit Archive | Áo | RSS `footballkitarchive.com/news/rss` | ✅ Tốt (trang chủ bị Cloudflare, RSS vẫn lấy được) |
| FootballBoots.co.uk | Giày | RSS `/feed` | ✅ Chạy được, tần suất thấp (bài mới nhất 25/09) |
| Soccer Reviews For You | Giày | RSS `/feed/` | ✅ Chạy được, tần suất thấp (bài mới nhất 06/10) |
| BootsCulture | Giày | Sitemap (`sitemap.xml`, ~4.100 URL) | ⚠️ Không có RSS; lọc URL mới theo lastmod |
| Unisport | Giày | Sitemap `sitemap-blogs.xml` (có lastmod), bài nằm ở `/stories/` | ⚠️ Lẫn nhiều bài khuyến mãi → lọc mạnh |
| Futbolemotion | Giày | HTML selector trang danh mục | ⚠️ Danh sách không có ngày đăng → dùng thời điểm phát hiện |
| Goal.com – Boots | Giày | Có sitemap | ❓ Kết nối bị reset khi thử từ máy mày; thử lại từ GitHub Actions |
| SOCCER.COM Guide | Giày | — | ❌ Cloudflare chặn (403) |
| Football Shirt Culture | Áo | — | ❌ Cloudflare chặn (403) |
| Football Boots DB | Tra cứu | Trang cầu thủ / giải đấu | ℹ️ Không phải nguồn tin — dùng làm **dữ liệu tra cứu cầu thủ ↔ giày** |
| Football Boots 101 | Tra cứu | — | ℹ️ Trang review tĩnh, không ngày đăng — chỉ dùng tham khảo khi viết caption |

Tóm tắt: 6 RSS dùng ngay · 2 sitemap · 1 HTML · 1 cần thử lại · 2 bị chặn · 2 dùng làm dữ liệu tra cứu.

Đã loại khỏi danh sách: The Kitman (domain `thekitman.com` bỏ hoang), Footy Boots (ngừng cập nhật từ 2020–2022).

Với 2 nguồn bị Cloudflare chặn: giai đoạn 1 bỏ qua. Nếu sau này thật sự cần thì dùng trình duyệt headless hoặc dịch vụ scrape — tốn thêm chi phí và hay hỏng.

### 4.2 Nguồn trận đấu (bổ sung)

| Nguồn | Vai trò | Tình trạng |
|---|---|---|
| football-data.org API | Lịch, kết quả, người ghi bàn: PL, La Liga, Cúp C1, giải đội tuyển | Cần đăng ký token miễn phí; cần kiểm tra gói free có đủ dữ liệu người ghi bàn và các trận đội tuyển không |
| BBC Sport Football RSS | Câu chuyện trận đấu | ✅ `feeds.bbci.co.uk/sport/football/rss.xml` |
| Guardian Football RSS | Câu chuyện trận đấu | ✅ `theguardian.com/football/rss` |
| ESPN | — | ❌ Chặn bot (202) → thay bằng nguồn khác, kiểm tra sau |

### 4.3 X (giai đoạn 1b)

`@Footballtweet`, `@ManCity`, `@MotivacionesF`, `@PurelyFootball`, `@Footy_Headlines` — lấy qua dịch vụ scrape trả theo lượng. Mục đích chính: ảnh đẹp và chuyện bên lề (nguyên liệu cho giai đoạn 2). `@ManCity` đăng nhiều nhưng ít tin dùng được → trọng số thấp, lọc mạnh.

### 4.4 Quy ước connector

- Mỗi connector là một module độc lập, chung interface: `fetch(sourceConfig, since) → RawItem[]`.
- Connector chỉ lấy và chuẩn hóa dữ liệu, không gọi AI (trừ chế độ "AI trích xuất" là phương án cuối cho trang HTML khó).
- Lỗi ở một nguồn không làm hỏng cả lượt chạy; ghi `last_error`, đếm số lần lỗi liên tiếp, quá 3 lần thì cảnh báo trên trang nguồn.
- Luôn lưu `published_at` (có thể null) và `discovered_at`.
- Có giới hạn tốc độ gửi request và User-Agent rõ ràng; tôn trọng robots.txt.

---

## 5. Pipeline mỗi ngày

Chạy bằng GitHub Actions theo lịch, mặc định 06:00 giờ Việt Nam. Có thêm nút "chạy ngay" trong app.

```
1. Fetch      các connector đang bật → RawItem (lưu nguyên dữ liệu)
2. Chuẩn hóa  URL chuẩn (bỏ utm, AMP…), hash tiêu đề → loại trùng tuyệt đối
3. Gom cụm    embedding đa ngôn ngữ, so với các Story trong 72 giờ → gắn vào Story có sẵn hoặc tạo Story mới
4. Phân loại  (model rẻ) ngăn: giày / cầu thủ / sự kiện / áo / bỏ; trích thực thể: cầu thủ, hãng, dòng giày, CLB, giải
5. Chấm điểm  điểm đo được + điểm LLM (mục 6) → xếp hạng trong từng ngăn
6. Chọn       ~15 ứng viên chính + ~4 ứng viên áo
7. Làm giàu   (model tốt) với từng ứng viên: dịch, tóm tắt, lý do chọn, góc khai thác, 2 caption, mục cần xác minh
8. Bản tin    xếp theo tỉ lệ 6/2/2 (+ ngăn áo), áp dụng quy tắc nhường chỗ → Digest
```

Dữ liệu trận đấu (football-data.org) chạy trước bước 4: tạo danh sách "trận đáng chú ý 36 giờ qua" và "cầu thủ nổi bật" để bước phân loại và chấm điểm dùng.

---

## 6. Chấm điểm

`điểm = Σ (trọng số × thành phần)`. Tất cả trọng số nằm trong file cấu hình để chỉnh tay.

| Thành phần | Mô tả |
|---|---|
| Độ mới | Giảm dần theo giờ kể từ khi đăng/phát hiện |
| Trọng số nguồn | Mày đặt cho từng nguồn (vd Footy Headlines cao, trang review thấp) |
| Độ lan tỏa | Số nguồn khác nhau trong cùng cụm |
| Cầu thủ | Có trong danh sách theo dõi: +cao; đang đá ở 5 giải hàng đầu: +vừa; legend: +cao |
| Trận đấu | Thuộc PL / La Liga / C1 / đội tuyển châu Âu |
| Góc giày | Bài có nhắc dòng giày / hãng giày cụ thể (bắt buộc cao với ngăn giày, cộng điểm với ngăn cầu thủ & sự kiện) |
| Điểm LLM | 0–10 theo tiêu chí "đáng làm", kèm giải thích ngắn |
| Lịch sử phản hồi | (bật sau khi có ≥ 50 phản hồi) độ giống với các mục mày từng chọn / bỏ |

Ngưỡng tối thiểu để được vào bản tin đặt riêng cho từng ngăn.

---

## 7. Phản hồi

- Hành động: **Chọn**, **Bỏ qua**, **Sửa** (sửa caption / tóm tắt / góc khai thác).
- Tag lý do nhanh (chọn được nhiều): `không hợp gu`, `tin cũ`, `trùng`, `sai thông tin`, `sai mẫu giày`, `góc chưa ổn`, `caption chưa đúng giọng`. Thêm được tag mới.
- Khi sửa, lưu cả bản trước và bản sau → dữ liệu học văn phong cho giai đoạn 3.
- Mục đã chọn đi vào danh sách "Đã chọn" (có thể xuất caption). Không có thao tác đăng.

---

## 8. Văn phong và dịch

- Bộ caption mẫu (13 caption mày gửi) được sửa chính tả và sửa sai sự thật trước khi dùng làm mẫu, ví dụ caption 13: cú đá phạt của Beckham vào lưới Hy Lạp là năm 2001, vòng loại World Cup **2002**.
- Hướng dẫn giọng văn: có kiến thức + vui vẻ; gọi "ae / anh em"; emoji đi cặp (🔥🔥 😍😍 😔😔); hashtag dạng `#HãngDòng` (`#AdidasPredator`, `#NikeVapor17`) và `#TênCầuThủ`; hay kết bằng câu hỏi mở cho anh em.
- Giữ nguyên tiếng Anh: tên cầu thủ, tên giày, tên bộ sưu tập, tên công nghệ.
- Bảng thuật ngữ (chỉnh trong app): colorway → phối màu, boots → giày, pack → bộ sưu tập / pack, leak → rò rỉ, laceless → không dây, …

---

## 9. Danh mục

**Cầu thủ** — tên chuẩn, các cách viết khác / hashtag, CLB, giải, legend?, hãng giày + dòng giày đang mang (kèm ngày cập nhật và nguồn).
Chuẩn hóa từ danh sách của mày:
- Cole Palmer, Rodri, Pau Cubarsí, Alexander Isak, Rayan Cherki, Ousmane Dembélé, Raúl González, Michael Carrick, Cesc Fàbregas
- "Ronaldo" legend = **Ronaldo Nazário (R9)**, tách hẳn khỏi Cristiano Ronaldo

Football Boots DB dùng để gợi ý điền / cập nhật cột giày; mày xác nhận.

**Dòng giày** — hãng, dòng, tên gọi khác. Ví dụ: Nike Mercurial (Vapor/Superfly), Phantom, Tiempo, Hypervenom; adidas Predator, F50, Copa; Puma Future, Ultra, King; Mizuno Morelia, Alpha; New Balance Furon, Tekela; Skechers; ON.

---

## 10. Kiến trúc

```
GitHub Actions (cron)  ──►  pipeline (Node/TS, cùng repo)  ──►  Supabase Postgres
                                       │                              ▲
                                       ├─► LLM API (khóa trong secrets)
                                       └─► football-data.org          │
Vercel: Next.js (UI + API routes, khóa chỉ ở server)  ────────────────┘
```

- **Monorepo**: `apps/web` (Next.js), `packages/pipeline` (job), `packages/connectors` (mỗi nguồn một module), `packages/core` (kiểu dữ liệu, chấm điểm, prompt).
- **Khóa API** chỉ nằm trong GitHub Secrets / biến môi trường server của Vercel. Client không bao giờ gọi LLM hay nguồn trực tiếp.
- **Đăng nhập**: Supabase Auth, chỉ 1 tài khoản (của mày); bật RLS.
- **Ảnh**: lưu URL gốc. Lớp `storage` trung gian; giai đoạn 1b cache thumbnail ~50KB cho ứng viên vào Supabase Storage, đầy thì chuyển sang Cloudflare R2.
- **LLM**: model rẻ cho phân loại và chấm điểm, model tốt cho bước làm giàu. Prompt có đánh số phiên bản, mỗi Suggestion lưu `prompt_version`.
- **Chi phí**: ghi số token cho từng lần gọi; có trần theo ngày và theo tháng, chạm trần thì dừng gọi AI và báo.

---

## 11. Mô hình dữ liệu (rút gọn)

| Bảng | Cột chính |
|---|---|
| `sources` | id, name, kind (rss/sitemap/html/manual/x/match_api), config (json), category_hint, weight, enabled, last_success_at, last_error, fail_count |
| `raw_items` | id, source_id, url, canonical_url, title, content, author, image_urls, published_at, discovered_at, raw (json), hash |
| `stories` | id, title, category, entities (json), first_seen_at, embedding |
| `story_items` | story_id, raw_item_id |
| `matches` | id, competition, home, away, score, played_at, scorers (json) |
| `suggestions` | id, story_id, digest_id, slot, rank, score, score_breakdown (json), title_vi, summary_vi, why, angles (json), caption_long, caption_short, to_verify (json), is_filler, prompt_version |
| `digests` | id, date, status, stats (json) |
| `feedback` | id, suggestion_id, action, tags, before (json), after (json), created_at |
| `players` | id, name, aliases, club, league, is_legend, boot_brand, boot_model, boot_updated_at, boot_source |
| `boot_lines` | id, brand, line, aliases |
| `glossary` | term_en, term_vi |
| `media_assets` | id, raw_item_id, url, cached_path, width, height *(tạo sẵn cho giai đoạn 2)* |
| `llm_calls` | id, purpose, model, tokens_in, tokens_out, cost, created_at |

---

## 12. Ngân sách (ước tính thô, kiểm tra lại giá khi làm)

| Hạng mục | ~ $/tháng |
|---|---|
| Phân loại ~300–500 bài/ngày | 3–8 |
| Làm giàu ~20 ứng viên/ngày | 5–15 |
| Scrape X (1b) | 5–20 |
| Vercel / Supabase / GitHub Actions bản free | 0 |
| **Tổng** | **~15–40** (trần $50–80) |

---

## 13. Điều kiện nghiệm thu giai đoạn 1

- Pipeline chạy tự động mỗi ngày ≥ 7 ngày liên tục không cần can thiệp tay.
- Bản tin có đủ các trường ở mục 3; không mục nào thiếu link nguồn.
- Không có 2 mục cùng một sự kiện trong một bản tin.
- Thông tin giày suy ra từ danh mục luôn có nhãn cần xác minh.
- Mày tự đánh giá: ≥ 3/5 mục nổi bật mỗi ngày là "muốn làm" (đo qua tỉ lệ Chọn trong 2 tuần).

---

## 14. Việc còn mở

1. Đăng ký token **football-data.org** (miễn phí), và chọn LLM provider + tạo khóa API.
2. Thử lại Goal.com từ GitHub Actions; tìm nguồn thay ESPN.
3. Bổ sung hãng giày cho từng cầu thủ trong danh sách (có thể để Football Boots DB gợi ý, mày duyệt).
