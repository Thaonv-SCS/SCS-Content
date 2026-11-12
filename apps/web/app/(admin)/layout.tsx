import { requireAdmin } from '@/lib/auth';

/** Bản tin, bài thô, nguồn, kho caption, cài đặt: chỉ admin. Dữ liệu cũng được chặn ở database (RLS). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return children;
}
