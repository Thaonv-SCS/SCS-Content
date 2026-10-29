import { seedSources } from '@app/core';
import { getDb, upsertSeedSources } from './db.ts';

const db = getDb();
if (!db) {
  console.error('Chưa cấu hình SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY trong .env');
  process.exit(1);
}
await upsertSeedSources(db, seedSources);
console.log(`Đã seed ${seedSources.length} nguồn (nguồn đã có giữ nguyên).`);
