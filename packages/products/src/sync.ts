import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCategories, fetchExamplesBySlugs, fetchRecentExamples } from './woo.ts';

/** Mẫu chuẩn admin chọn (slug sản phẩm trên web) — được ưu tiên khi chọn mẫu văn phong. */
export const GOLD_EXAMPLE_SLUGS = [
  'nike-mercurial-vapor-16-pro-tf-racer-blue-fq8687-446',
  'nike-tiempo-legend-10-academy-tf-prism-pack-mau-xanh-ngoc-dv4342-401-tiempo-10',
  'mizuno-morelia-sala-%ce%b2-japan-tf-unity-sky-blue-q1gb264025-mij',
  'mizuno-morelia-sala-japan-tf-trang-gold-made-in-japan-q1gb260250',
];

/** Đồng bộ danh mục + sản phẩm mới nhất (+ mẫu chuẩn) từ website vào kho mẫu. Chỉ đọc website, không ghi gì lên web. */
export async function syncFromWebsite(
  db: SupabaseClient,
  limit = 200,
): Promise<{ categories: number; examples: number; gold: number }> {
  const categories = await fetchCategories();
  const { error: cErr } = await db
    .from('woo_categories')
    .upsert(categories.map((c) => ({ ...c, synced_at: new Date().toISOString() })), { onConflict: 'id' });
  if (cErr) throw cErr;

  const recent = await fetchRecentExamples(limit);
  const gold = await fetchExamplesBySlugs(GOLD_EXAMPLE_SLUGS);
  const seen = new Set(recent.map((e) => e.woo_id));
  const examples = [...recent, ...gold.filter((e) => !seen.has(e.woo_id))];

  // Không gửi is_gold → giữ nguyên lựa chọn mẫu chuẩn đã có
  for (let i = 0; i < examples.length; i += 50) {
    const { error } = await db
      .from('product_examples')
      .upsert(examples.slice(i, i + 50).map((e) => ({ ...e, synced_at: new Date().toISOString() })), { onConflict: 'woo_id' });
    if (error) throw error;
  }
  const goldIds = gold.map((e) => e.woo_id);
  if (goldIds.length) await db.from('product_examples').update({ is_gold: true }).in('woo_id', goldIds);
  return { categories: categories.length, examples: examples.length, gold: goldIds.length };
}
