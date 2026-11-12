import type { SupabaseClient } from '@supabase/supabase-js';

export type CategoryOption = { id: number; path: string };

/** Danh mục WooCommerce kèm đường dẫn đầy đủ để chọn dễ: "Giày Bóng Đá > Giày Cỏ Nhân Tạo". */
export async function loadCategoryOptions(supabase: SupabaseClient): Promise<CategoryOption[]> {
  const { data } = await supabase.from('woo_categories').select('id,name,parent');
  const byId = new Map((data ?? []).map((c) => [c.id as number, c as { id: number; name: string; parent: number }]));
  const path = (c: { id: number; name: string; parent: number }) => {
    const names = [c.name];
    for (let x = byId.get(c.parent); x && names.length < 6; x = byId.get(x.parent)) names.unshift(x.name);
    return names.join(' > ');
  };
  return [...byId.values()].map((c) => ({ id: c.id, path: path(c) })).sort((a, b) => a.path.localeCompare(b.path, 'vi'));
}
