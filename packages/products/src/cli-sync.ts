/** npm run sync -w @app/products — đồng bộ danh mục + mẫu từ website (chạy trên máy, dùng service key). */
import { createClient } from '@supabase/supabase-js';
import { syncFromWebsite } from './sync.ts';

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const t0 = Date.now();
const r = await syncFromWebsite(db, Number(process.argv[2] ?? 200));
console.log(`Đồng bộ xong trong ${((Date.now() - t0) / 1000).toFixed(1)}s: ${r.categories} danh mục, ${r.examples} sản phẩm mẫu (${r.gold} mẫu chuẩn)`);
