/**
 * Cập nhật sản phẩm hàng loạt trên web (WooCommerce REST v3, cần khóa API):
 * tình trạng hàng, chế độ hiển thị, giá niêm yết / giá khuyến mãi, size ("Chọn Size").
 * Không chạm nội dung, ảnh hay trạng thái đăng.
 */
import { wc, wcList } from './woo.ts';
import type { StockItem, StockStatus, StockUpdate } from './stock-types.ts';
export * from './stock-types.ts';

/** Thuộc tính "Chọn Size" trên web (pa_size). */
export const SIZE_ATTRIBUTE_ID = 4;
/** Bản "40.5" bị trùng (slug 40½) — gộp về bản 40-5. */
export const DUPLICATE_405_TERM_ID = 17514;

type RawAttribute = { id: number; name: string; position: number; visible: boolean; variation: boolean; options: string[] };
type RawProduct = Omit<StockItem, 'sizes'> & { attributes?: RawAttribute[] };

const FIELDS = 'id,name,sku,stock_status,catalog_visibility,permalink,status,regular_price,sale_price,attributes';
const decode = (s: string) => s.replace(/&#8211;/g, '–').replace(/&#8217;/g, '’').replace(/&amp;/g, '&').replace(/&quot;/g, '"');

const clean = (r: RawProduct): StockItem => ({
  id: r.id,
  name: decode(r.name),
  sku: r.sku,
  stock_status: r.stock_status,
  catalog_visibility: r.catalog_visibility,
  permalink: r.permalink,
  status: r.status,
  regular_price: r.regular_price ?? '',
  sale_price: r.sale_price ?? '',
  sizes: r.attributes?.find((a) => a.id === SIZE_ATTRIBUTE_ID)?.options ?? [],
});

/** Một trang sản phẩm đang đăng theo tình trạng hàng (100 / trang). */
export async function fetchStockPage(
  stock: StockStatus | 'all',
  page: number,
): Promise<{ items: StockItem[]; totalPages: number; total: number }> {
  const { data, headers } = await wcList<RawProduct[]>(
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
    const found = await wc<RawProduct[]>('GET', `/products?per_page=100&status=any&sku=${encodeURIComponent(chunk.join(','))}&_fields=${FIELDS}`);
    items.push(...found.filter((p) => p.status !== 'trash').map(clean));
  }
  const have = new Set(items.map((p) => p.sku.toLowerCase()));
  return { items, missing: wanted.filter((s) => !have.has(s.toLowerCase())) };
}

/** Một trang các sản phẩm đang gắn bản "40.5" trùng (40½) — để gộp về một bản. */
export async function fetchDuplicate405Page(page: number): Promise<{ items: StockItem[]; totalPages: number; total: number }> {
  const { data, headers } = await wcList<RawProduct[]>(
    'GET',
    `/products?status=any&per_page=100&page=${page}&attribute=pa_size&attribute_term=${DUPLICATE_405_TERM_ID}&_fields=${FIELDS}`,
  );
  return {
    items: data.filter((p) => p.status !== 'trash').map(clean),
    totalPages: Number(headers.get('x-wp-totalpages') ?? 1),
    total: Number(headers.get('x-wp-total') ?? data.length),
  };
}

let termCache: { at: number; names: string[] } | null = null;

/** Danh sách size có trên web (tên), theo thứ tự WooCommerce. Lưu tạm 10 phút. */
export async function fetchSizeTerms(): Promise<string[]> {
  if (termCache && Date.now() - termCache.at < 10 * 60_000) return termCache.names;
  const names: string[] = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await wc<{ name: string }[]>('GET', `/products/attributes/${SIZE_ATTRIBUTE_ID}/terms?per_page=100&page=${page}`);
    names.push(...batch.map((t) => decode(t.name)));
    if (batch.length < 100) break;
  }
  termCache = { at: Date.now(), names: [...new Set(names)] };
  return termCache.names;
}

/**
 * Cập nhật hàng loạt (tối đa 100 / lần). Có đổi size thì đọc lại ĐỦ thuộc tính hiện tại của sản phẩm rồi chỉ thay
 * phần size — WooCommerce ghi đè cả danh sách thuộc tính, gửi thiếu là mất "Loại Đinh".
 */
export async function updateStock(updates: StockUpdate[]): Promise<{ id: number; error?: string }[]> {
  if (updates.length > 100) throw new Error('Tối đa 100 sản phẩm mỗi lần gửi.');

  const sizeIds = updates.filter((u) => u.sizes).map((u) => u.id);
  const current = new Map<number, RawAttribute[]>();
  if (sizeIds.length) {
    const rows = await wc<{ id: number; attributes: RawAttribute[] }[]>(
      'GET',
      `/products?per_page=100&status=any&include=${sizeIds.join(',')}&_fields=id,attributes`,
    );
    rows.forEach((r) => current.set(r.id, r.attributes));
    // Sản phẩm không có trong danh sách (vd trong thùng rác) → đọc riêng từng cái
    for (const id of sizeIds.filter((id) => !current.has(id))) {
      const p = await wc<{ id: number; attributes: RawAttribute[] }>('GET', `/products/${id}?_fields=id,attributes`);
      current.set(id, p.attributes);
    }
  }

  const payload = updates.map(({ sizes, ...rest }) => {
    if (!sizes) return rest;
    const attrs = current.get(rest.id);
    if (!attrs) throw new Error(`Không đọc được thuộc tính của sản phẩm ${rest.id}.`);
    const others = attrs
      .filter((a) => a.id !== SIZE_ATTRIBUTE_ID)
      .map((a) => ({ ...(a.id ? { id: a.id } : { name: a.name }), position: a.position, visible: a.visible, variation: a.variation, options: a.options }));
    const old = attrs.find((a) => a.id === SIZE_ATTRIBUTE_ID);
    const size = sizes.length
      ? [{ id: SIZE_ATTRIBUTE_ID, position: old?.position ?? 0, visible: old?.visible ?? true, variation: false, options: sizes }]
      : [];
    return { ...rest, attributes: [...size, ...others] };
  });

  const res = await wc<{ update?: { id: number; error?: { message: string } }[] }>('POST', '/products/batch', { update: payload });
  return (res.update ?? []).map((u) => ({ id: u.id, error: u.error?.message }));
}
