# Soccerstore Content App

Web app cá nhân tổng hợp ý tưởng content giày & bóng đá mỗi ngày. Đặc tả: [docs/phase1-spec.md](docs/phase1-spec.md).

App **không** đăng bài — chỉ gợi ý, tóm tắt, viết caption nháp.

## Cấu trúc

```
apps/web               Next.js — giao diện bản tin, quản lý nguồn
packages/core          Kiểu dữ liệu, chuẩn hóa URL/tiêu đề, danh sách nguồn seed
packages/connectors    Mỗi loại nguồn một connector (rss, sitemap, manual, …)
packages/pipeline      Job hằng ngày: lấy bài → lọc trùng → (sắp tới) AI → bản tin
supabase/migrations    Schema database
.github/workflows      Lịch chạy pipeline (06:00 giờ VN)
```

## Chạy local

```bash
npm install
npm run fetch                                   # lấy bài 48 giờ qua từ mọi nguồn đang bật
npm run fetch -- --hours=24 --source=footy-headlines
npm run dev                                     # web app ở http://localhost:3000
```

Chưa cấu hình Supabase thì pipeline ghi kết quả ra `.data/raw-<ngày>.json`.

## Kết nối Supabase

1. Tạo project trên Supabase, chạy `supabase/migrations/0001_init.sql` trong SQL Editor.
2. Copy `.env.example` thành `.env`, điền `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY`.
3. `npm run seed` để đưa danh sách nguồn vào DB.
4. Tạo tài khoản đăng nhập của mày, rồi tắt đăng ký tài khoản mới (Auth → Settings).

Khóa API chỉ đặt trong `.env` (local), GitHub Secrets (pipeline) và Vercel Environment Variables (web). Không commit `.env`.

## Đưa lên mạng

Xem [docs/deploy.md](docs/deploy.md).

## Thêm nguồn mới

- Có RSS/Atom → thêm vào `packages/core/src/seed/sources.json` với `kind: "rss"`.
- Không có RSS nhưng có sitemap → `kind: "sitemap"`, dùng `config.include` (regex) để chỉ lấy URL bài viết.
- Loại nguồn mới → viết module trong `packages/connectors/src/` theo interface `Connector`, đăng ký trong `index.ts`.
