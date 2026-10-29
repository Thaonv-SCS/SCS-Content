/**
 * Kiểm tra token GitHub dùng cho nút "Chạy ngay": thấy repo không, thấy workflow không, có quyền chạy không.
 * Đọc GITHUB_TOKEN, GITHUB_REPO từ .env.  →  npm run check-github
 */
export {};

const token = process.env.GITHUB_TOKEN?.trim();
const repo = process.env.GITHUB_REPO?.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
if (!token || !repo) {
  console.error('Cần GITHUB_TOKEN và GITHUB_REPO trong .env');
  process.exit(1);
}

const gh = (path: string) =>
  fetch(`https://api.github.com${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });

const me = await gh('/user');
console.log(`1. Token hợp lệ:        ${me.ok ? '✓' : `✗ HTTP ${me.status} — token sai hoặc hết hạn`}`);

const r = await gh(`/repos/${repo}`);
console.log(`2. Thấy repo ${repo}: ${r.ok ? '✓' : `✗ HTTP ${r.status} — token chưa được cấp quyền repo này (Repository access) hoặc sai tên repo`}`);

const w = await gh(`/repos/${repo}/actions/workflows/daily.yml`);
console.log(`3. Thấy workflow:       ${w.ok ? '✓' : `✗ HTTP ${w.status} — thiếu quyền Actions hoặc chưa có .github/workflows/daily.yml trên nhánh main`}`);

const runs = await gh(`/repos/${repo}/actions/runs?per_page=1`);
console.log(`4. Đọc được Actions:    ${runs.ok ? '✓' : `✗ HTTP ${runs.status} — token thiếu quyền "Actions: Read and write"`}`);
