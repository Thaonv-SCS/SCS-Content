/**
 * Tình trạng hàng và chế độ hiển thị trên web (WooCommerce REST v3, cần khóa API).
 * Chỉ đổi 2 ô: stock_status và catalog_visibility — không chạm giá, nội dung hay trạng thái đăng.
 */
import { wc, wcList } from './woo.ts';

import type { StockItem, StockStatus, StockUpdate } from "./stock-types.ts";
export * from "./stock-types.ts";

const FIELDS = 'id,name,sku,stock_status,catalog_visibility,permalink,status';
const decode = (s: string) => s.replace(/&#8211;/g, '–').replace(/&#8217;/g, '’').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
const clean = (r: StockItem): StockItem => ({ ...r, name: decode(r.name) });

/** Một trang sản phẩm đang đăng theo tình trạng hàng (100 / trang). */
export async function fetchStockPage(
  stock: StockStatus | 'all',
  page: number,
): Promise<{ items: StockItem[]; totalPages: number; total: number }> {
  const { data, headers } = await wcList<StockItem[]>(
    'GET',
    `/products?status=publish&per_page=100&page=${page}&orderby=date&order=desc&_fields=${FIELDS}${stock === 'all' ? '' : `&stock_status=${stock}`}`,
  );
  return { items: data.map(clean), totalPages: Number(headers.get('x-wp-totalpages') ?? 1), total: Number(headers.get('x-wp-total') ?? data.length) };
}

/** Tìm theo danh sách mã (mọi trạng thái đăng trừ thùng rác). */
export async function findBySkus(skus: string[]): Promise<{ items: StockItem[]; missing: string[] }> {
  const wanted = [...new Set(skus.map((s) => s.trim()).filter(Boolean))];
  const items: StockItem[] = [];
  for (let i = 0; i < wanted.length; i += 40) {
    const chunk = wanted.slice(i, i + 40);
    const found = await wc<StockItem[]>('GET', `/products?per_page=100&status=any&sku=${encodeURIComponent(chunk.join(','))}&_fields=${FIELDS}`);
    items.push(...found.filter((p) => p.status !== 'trash').map(clean));
  }
  const have = new Set(items.map((p) => p.sku.toLowerCase()));
  return { items, missing: wanted.filter((s) => !have.has(s.toLowerCase())) };
}

/** Cập nhật hàng loạt (tối đa 100 / lần). Trả về lỗi theo từng sản phẩm, nếu có. */
export async function updateStock(updates: StockUpdate[]): Promise<{ id: number; error?: string }[]> {
  if (updates.length > 100) throw new Error('Tối đa 100 sản phẩm mỗi lần gửi.');
  const res = await wc<{ update?: { id: number; error?: { message: string } }[] }>('POST', '/products/batch', { update: updates });
  return (res.update ?? []).map((u) => ({ id: u.id, error: u.error?.message }));
}
