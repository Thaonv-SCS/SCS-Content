/**
 * Đưa danh sách nguồn mặc định vào database MỚI (bảng sources còn trống).
 * Database đã có nguồn thì không làm gì — nguồn được quản lý trong app (trang Nguồn), seed lại sẽ
 * "hồi sinh" những nguồn mày đã xóa.
 */
import { seedSources } from '@app/core';
import { getDb, upsertSeedSources } from './db.ts';

const db = getDb();
if (!db) {
  console.error('Chưa cấu hình SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY trong .env');
  process.exit(1);
}

const { count, error } = await db.from('sources').select('*', { count: 'exact', head: true });
if (error) throw error;
if (count) {
  console.log(`Database đã có ${count} nguồn — bỏ qua. Thêm / sửa / xóa nguồn ở trang Nguồn trong app.`);
  process.exit(0);
}
await upsertSeedSources(db, seedSources);
console.log(`Đã seed ${seedSources.length} nguồn.`);
