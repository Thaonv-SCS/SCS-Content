/**
 * Gắn nhãn caption mới trong kho và viết lại ghi chú văn phong.
 *   npm run style
 */
import { parseSettings } from '@app/core';
import { getDb } from './db.ts';
import { Budget } from './ai/client.ts';
import { loadCaptionLibrary, tagNewCaptions } from './ai/captions.ts';
import { generateStyleNotes } from './ai/style.ts';

const db = getDb();
if (!db) throw new Error('Cần SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY trong .env');

const { data: rows } = await db.from('settings').select('key,value');
const budget = new Budget(db, parseSettings(rows).daily_budget_usd);
await budget.init();

const tagged = await tagNewCaptions(db, budget);
console.log(`Gắn nhãn ${tagged} caption mới`);

const library = await loadCaptionLibrary(db);
if (library.length < 5) {
  console.log(`Kho mới có ${library.length} caption — cần ít nhất 5 để rút ghi chú văn phong.`);
} else {
  const notes = await generateStyleNotes(db, budget, library);
  console.log(`Đã cập nhật ghi chú văn phong từ ${notes.caption_count} caption · chi phí hôm nay $${budget.spentToday.toFixed(3)}`);
}
