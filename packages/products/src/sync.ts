import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCategories, fetchExamplesByIds, fetchExamplesBySlugs, fetchRecentExamples, slugFromProductUrl, type WooExample } from './woo.ts';

/** Mẫu chuẩn ban đầu (4 link admin gửi) — chỉ dùng khi kho chưa có mẫu chuẩn nào; sau đó admin chọn trong app. */
export const GOLD_EXAMPLE_SLUGS = [
  'nike-mercurial-vapor-16-pro-tf-racer-blue-fq8687-446',
  'nike-tiempo-legend-10-academy-tf-prism-pack-mau-xanh-ngoc-dv4342-401-tiempo-10',
  'mizuno-morelia-sala-%ce%b2-japan-tf-unity-sky-blue-q1gb264025-mij',
  'mizuno-morelia-sala-japan-tf-trang-gold-made-in-japan-q1gb260250',
];

async function upsertExamples(db: SupabaseClient, examples: WooExample[]) {
  for (let i = 0; i < examples.length; i += 50) {
    const { error } = await db
      .from('product_examples')
      .upsert(examples.slice(i, i + 50).map((e) => ({ ...e, synced_at: new Date().toISOString() })), { onConflict: 'woo_id' });
    if (error) throw error;
  }
}

/** Đồng bộ danh mục + sản phẩm mới nhất (+ cập nhật mẫu chuẩn) từ website vào kho mẫu. Chỉ đọc website. */
export async function syncFromWebsite(
  db: SupabaseClient,
  limit = 200,
): Promise<{ categories: number; examples: number; gold: number }> {
  const categories = await fetchCategories();
  const { error: cErr } = await db
    .from('woo_categories')
    .upsert(categories.map((c) => ({ ...c, synced_at: new Date().toISOString() })), { onConflict: 'id' });
  if (cErr) throw cErr;

  const { data: goldRows } = await db.from('product_examples').select('woo_id').eq('is_gold', true);
  const goldIds = (goldRows ?? []).map((r) => r.woo_id as number);
  const recent = await fetchRecentExamples(limit);
  // Mẫu chuẩn có thể là sản phẩm cũ (không nằm trong nhóm mới nhất) → lấy riêng để cập nhật nội dung
  const gold = goldIds.length ? await fetchExamplesByIds(goldIds) : await fetchExamplesBySlugs(GOLD_EXAMPLE_SLUGS);
  const seen = new Set(recent.map((e) => e.woo_id));
  const examples = [...recent, ...gold.filter((e) => !seen.has(e.woo_id))];

  // Không gửi is_gold → giữ nguyên lựa chọn mẫu chuẩn của admin
  await upsertExamples(db, examples);
  if (!goldIds.length && gold.length) {
    await db.from('product_examples').update({ is_gold: true }).in('woo_id', gold.map((e) => e.woo_id));
  }
  return { categories: categories.length, examples: examples.length, gold: goldIds.length || gold.length };
}

/** Admin dán link sản phẩm trên web → thêm vào kho mẫu và đánh dấu mẫu chuẩn. */
export async function addGoldExampleByUrl(db: SupabaseClient, url: string): Promise<string> {
  const slug = slugFromProductUrl(url);
  if (!slug) throw new Error('Link không đúng dạng soccerstore.vn/san-pham/…');
  const [ex] = await fetchExamplesBySlugs([slug]);
  if (!ex) throw new Error('Không tìm thấy sản phẩm này trên web (hoặc sản phẩm chưa đăng).');
  await upsertExamples(db, [ex]);
  const { error } = await db.from('product_examples').update({ is_gold: true }).eq('woo_id', ex.woo_id);
  if (error) throw error;
  return ex.name;
}
