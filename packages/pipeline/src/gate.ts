/**
 * Chạy đầu tiên trong lịch 6h sáng: quyết định hôm nay có chạy pipeline không.
 *   - Lịch đang tắt trong app → không chạy.
 *   - N bản tin gần nhất chưa được mở xem → tự tạm dừng (mở app xem là chạy lại).
 * Kết quả ghi vào GITHUB_OUTPUT (run=true/false) để các bước sau dựa vào.
 */
import { appendFileSync } from 'node:fs';
import { parseSettings } from '@app/core';
import { getDb } from './db.ts';

const db = getDb();
if (!db) throw new Error('Cần SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');

const { data: rows, error } = await db.from('settings').select('key,value');
if (error) throw error;
const settings = parseSettings(rows);

let run = true;
let reason = 'Lịch đang bật';

if (!settings.schedule_enabled) {
  run = false;
  reason = 'Lịch chạy đang TẮT trong app';
} else if (settings.auto_pause_days > 0) {
  const { data: recent } = await db
    .from('digests')
    .select('date,viewed_at')
    .eq('status', 'ready')
    .order('date', { ascending: false })
    .limit(settings.auto_pause_days);
  if (recent && recent.length >= settings.auto_pause_days && recent.every((d) => !d.viewed_at)) {
    run = false;
    reason = `Tự tạm dừng: ${settings.auto_pause_days} bản tin gần nhất chưa được mở xem`;
  }
}

console.log(`${run ? '▶ Chạy' : '⏸ Bỏ qua'} — ${reason}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run=${run}\n`);
