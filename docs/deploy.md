# Đưa app lên mạng (GitHub + Netlify)

Kiến trúc khi chạy trên mạng:

```
GitHub (repo private)
  └─ GitHub Actions: 6h sáng + nút "Chạy ngay" → lấy bài, gọi AI, ghi vào Supabase
Netlify: web app (xem bản tin, chọn/sửa, cài đặt) ← đọc/ghi Supabase
Supabase: database + đăng nhập (đã có)
```

Khóa nào nằm ở đâu — **không bao giờ dán khóa vào code hay vào chat**:

| Khóa | GitHub Secrets | Netlify |
|---|:-:|:-:|
| `SUPABASE_URL` | ✓ | |
| `SUPABASE_SERVICE_ROLE_KEY` (secret key — toàn quyền DB) | ✓ | ✗ không đặt |
| `ANTHROPIC_API_KEY` | ✓ | |
| `FOOTBALL_DATA_TOKEN` | ✓ | |
| `NEXT_PUBLIC_SUPABASE_URL` | | ✓ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key) | | ✓ |
| `GITHUB_TOKEN` (token để nút "Chạy ngay" gọi GitHub) | | ✓ |
| `GITHUB_REPO` (vd `ten-tai-khoan/soccerstore-content-app`) | | ✓ |

Giá trị lấy từ file `.env` trên máy.

---

## Bước 1 — Tạo repo trên GitHub

1. Đăng nhập github.com → nút **+** góc trên phải → **New repository**.
2. Tên: `soccerstore-content-app` (tùy) · chọn **Private** · **không** tick README / .gitignore / license.
3. Bấm **Create repository**, copy link repo (dạng `https://github.com/<tài-khoản>/soccerstore-content-app`) gửi Claude.
4. Claude tạo commit đầu tiên và đẩy code lên. Nếu Windows hiện cửa sổ đăng nhập GitHub thì đăng nhập.

## Bước 2 — Đặt khóa cho GitHub Actions

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**, thêm lần lượt 4 khóa:
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `FOOTBALL_DATA_TOKEN`.

## Bước 3 — Tạo token cho nút "Chạy ngay"

1. Ảnh đại diện góc trên phải → **Settings** → cuối menu trái **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Token name: `content-app-run` · Expiration: 1 năm (ghi lịch nhắc gia hạn).
3. Repository access: **Only select repositories** → chọn repo vừa tạo.
4. Permissions → Repository permissions → **Actions: Read and write** (chỉ cái này).
5. **Generate token**, copy ngay (chỉ hiện một lần) — dùng ở bước 4.

## Bước 4 — Triển khai web lên Netlify

1. app.netlify.com → **Add new project** → **Import an existing project** → **GitHub** → cho phép Netlify đọc repo vừa tạo → chọn repo.
2. Màn hình cấu hình build:
   - **Base directory**: để **trống**.
   - **Package directory**: `apps/web`.
   - Build command / Publish directory: để trống — lấy từ `apps/web/netlify.toml`.
   - Netlify sẽ tự nhận Next.js.
3. **Add environment variables** → thêm 4 biến: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GITHUB_TOKEN` (token bước 3), `GITHUB_REPO` (`<tài-khoản>/soccerstore-content-app`).
4. **Deploy**. Xong sẽ có link dạng `https://<tên>.netlify.app` (đổi tên được ở Project configuration → Change project name).

Nếu màn hình không có ô **Package directory**: deploy trước, rồi vào **Project configuration → Build & deploy → Build settings → Configure**, đặt Package directory = `apps/web`, rồi **Deploys → Trigger deploy**.

## Bước 5 — Kiểm tra

1. Mở link Netlify (cả trên điện thoại): phải tự chuyển sang trang **Đăng nhập** → đăng nhập.
2. **Cài đặt → ▶ Chạy ngay** → trạng thái chuyển "Đang khởi động" → "Đang chạy" (mất ~1 phút để GitHub khởi động máy) → "✓ Xong" sau 3–4 phút.
3. Trên GitHub, tab **Actions** của repo sẽ thấy lượt chạy "Daily digest" màu xanh.
4. Từ giờ lịch 6h sáng tự chạy; máy tính ở nhà không cần bật.

## Chi phí hạ tầng

- GitHub repo private: miễn phí 2.000 phút Actions/tháng — app dùng ~100–150 phút.
- Supabase: gói miễn phí (job chạy mỗi ngày nên project không bị tạm dừng vì không hoạt động).
- Netlify: gói miễn phí — app một người dùng, lượng truy cập rất nhỏ.

## Cập nhật code về sau

Claude sửa code trên máy → commit → đẩy lên GitHub → Netlify tự triển khai lại, GitHub Actions dùng code mới từ lượt chạy kế tiếp.
Migration database mới (`supabase/migrations/*.sql`) vẫn chạy tay trong SQL Editor như trước.

## Ghi chú kỹ thuật

- Web dùng `apps/web/middleware.ts` (Edge) thay cho `proxy.ts` của Next 16: adapter Netlify (`@netlify/plugin-nextjs` 5.16) lỗi khi đóng gói proxy chạy Node trong monorepo. Build sẽ in cảnh báo "middleware deprecated" — bỏ qua được. Khi Netlify sửa lỗi, đổi lại thành `proxy.ts`.
