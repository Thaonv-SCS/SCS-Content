/**
 * Làm việc với website WooCommerce.
 * - Đọc công khai (không cần khóa): danh mục, sản phẩm mẫu (Store API + WordPress REST, có cả Yoast).
 * - Ghi (cần WOO_CONSUMER_KEY / WOO_CONSUMER_SECRET): chỉ TẠO BẢN NHÁP — không có lệnh đăng hay sửa sản phẩm đang bán.
 */

export const WOO_URL = (process.env.WOO_URL || 'https://soccerstore.vn').replace(/\/+$/, '');
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; SoccerstoreContentApp/0.1)' };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return (await res.json()) as T;
}

const decode = (s: string) =>
  s
    .replace(/&#8211;/g, '–')
    .replace(/&#8217;/g, '’')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");

// ───────────── Đọc công khai ─────────────

export interface WooCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
  link: string;
  count: number;
}

export async function fetchCategories(): Promise<WooCategory[]> {
  const rows = await getJson<{ id: number; name: string; slug: string; parent: number; permalink: string; count: number }[]>(
    `${WOO_URL}/wp-json/wc/store/v1/products/categories?per_page=100`,
  );
  return rows.map((c) => ({ id: c.id, name: decode(c.name), slug: c.slug, parent: c.parent, link: c.permalink, count: c.count }));
}

export interface WooExample {
  woo_id: number;
  name: string;
  sku: string | null;
  link: string;
  category_ids: number[];
  short_description: string;
  description_html: string;
  yoast_title: string | null;
  yoast_meta: string | null;
  tags: string[];
  modified_at: string | null;
}

/**
 * Sản phẩm mới nhất trên web làm mẫu văn phong. Store API cho SKU / danh mục / tag nhưng cắt ngắn mô tả,
 * nên lấy mô tả đầy đủ + Yoast từ WordPress REST.
 */
type StoreProduct = {
  id: number;
  name: string;
  sku: string;
  permalink: string;
  short_description: string;
  categories: { id: number }[];
  tags: { name: string }[];
};

export async function fetchRecentExamples(limit = 200): Promise<WooExample[]> {
  const store: StoreProduct[] = [];
  for (let page = 1; store.length < limit; page++) {
    const batch = await getJson<StoreProduct[]>(
      `${WOO_URL}/wp-json/wc/store/v1/products?per_page=100&page=${page}&orderby=date&order=desc`,
    );
    store.push(...batch);
    if (batch.length < 100) break;
  }
  return withFullContent(store.slice(0, limit));
}

/** Lấy sản phẩm theo slug (mẫu chuẩn — có thể là sản phẩm cũ, không nằm trong nhóm mới nhất). */
export async function fetchExamplesBySlugs(slugs: string[]): Promise<WooExample[]> {
  if (!slugs.length) return [];
  const found = await getJson<{ id: number }[]>(
    `${WOO_URL}/wp-json/wp/v2/product?per_page=100&slug=${slugs.join(',')}&_fields=id`,
  );
  if (!found.length) return [];
  const store = await getJson<StoreProduct[]>(
    `${WOO_URL}/wp-json/wc/store/v1/products?per_page=100&include=${found.map((p) => p.id).join(',')}`,
  );
  return withFullContent(store);
}

async function withFullContent(store: StoreProduct[]): Promise<WooExample[]> {
  type WpProduct = { id: number; content: { rendered: string }; modified: string; yoast_head_json?: { title?: string; description?: string } };
  const wp = new Map<number, WpProduct>();
  const ids = store.map((p) => p.id);
  for (let i = 0; i < ids.length; i += 100) {
    const batch = await getJson<WpProduct[]>(
      `${WOO_URL}/wp-json/wp/v2/product?per_page=100&include=${ids.slice(i, i + 100).join(',')}&_fields=id,content,modified,yoast_head_json`,
    );
    batch.forEach((p) => wp.set(p.id, p));
  }

  return store.map((p) => {
    const w = wp.get(p.id);
    return {
      woo_id: p.id,
      name: decode(p.name),
      sku: p.sku || null,
      link: p.permalink,
      category_ids: p.categories.map((c) => c.id),
      short_description: p.short_description,
      description_html: w?.content.rendered ?? '',
      yoast_title: w?.yoast_head_json?.title ? decode(w.yoast_head_json.title) : null,
      yoast_meta: w?.yoast_head_json?.description ? decode(w.yoast_head_json.description) : null,
      tags: p.tags.map((t) => decode(t.name)),
      modified_at: w?.modified ? new Date(w.modified).toISOString() : null,
    };
  });
}

// ───────────── Ghi: chỉ tạo bản nháp ─────────────

function wcAuth(): string {
  const key = process.env.WOO_CONSUMER_KEY?.trim();
  const secret = process.env.WOO_CONSUMER_SECRET?.trim();
  if (!key || !secret) throw new Error('Chưa cấu hình WOO_CONSUMER_KEY / WOO_CONSUMER_SECRET');
  return 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64');
}

async function wc<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${WOO_URL}/wp-json/wc/v3${path}`, {
    method,
    headers: { ...UA, Authorization: wcAuth(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await res.json().catch(() => null)) as T & { message?: string };
  if (!res.ok) throw new Error(`WooCommerce ${res.status}: ${data?.message ?? 'lỗi không rõ'}`);
  return data;
}

/** Kiểm tra khóa API: đọc được thuộc tính sản phẩm là khóa hợp lệ. */
export async function checkWooAccess(): Promise<string[]> {
  const attrs = await wc<{ id: number; name: string }[]>('GET', '/products/attributes');
  return attrs.map((a) => a.name);
}

async function tagIds(names: string[]): Promise<{ id: number }[]> {
  const ids: { id: number }[] = [];
  for (const name of names) {
    const found = await wc<{ id: number; name: string }[]>('GET', `/products/tags?search=${encodeURIComponent(name)}&per_page=20`);
    const exact = found.find((t) => decode(t.name).toLowerCase() === name.toLowerCase());
    ids.push({ id: exact ? exact.id : (await wc<{ id: number }>('POST', '/products/tags', { name })).id });
  }
  return ids;
}

export interface DraftInput {
  name: string;
  sku: string | null;
  price: number | null;
  slug: string;
  description_html: string;
  short_description_html: string;
  category_ids: number[];
  tags: string[];
  sizes: string[];
  soleplate?: string;
  seo_title: string;
  meta_description: string;
  focus_keyphrase: string;
}

export interface DraftResult {
  id: number;
  edit_url: string;
  brand: string | null;
}

/**
 * Hãng trên web là taxonomy "brand" của theme XStore (ô "etheme_brands"), không phải Hãng chuẩn của WooCommerce.
 * Nhận hãng từ tên sản phẩm: tên hãng xuất hiện sớm nhất (vd "Nike Phantom 6…" → Nike, "Giày … Động Lực …" → Động Lực).
 */
export interface Brand {
  id: number;
  name: string;
  link: string; // trang hãng, vd https://soccerstore.vn/brand/kelme/
}

export async function fetchBrands(): Promise<Brand[]> {
  const rows = await getJson<Brand[]>(`${WOO_URL}/wp-json/wp/v2/etheme_brands?per_page=100&_fields=id,name,link`);
  return rows.map((b) => ({ ...b, name: decode(b.name) }));
}

export function matchBrand(productName: string, brands: Brand[]): Brand | null {
  const name = ` ${productName.toLowerCase()} `;
  let best: { b: Brand; at: number } | null = null;
  for (const b of brands) {
    const at = name.search(new RegExp(`[^\\p{L}\\p{N}]${b.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\p{L}\\p{N}]`, 'u'));
    if (at >= 0 && (!best || at < best.at)) best = { b, at };
  }
  return best?.b ?? null;
}

export async function detectBrand(productName: string): Promise<Brand | null> {
  return matchBrand(productName, await fetchBrands());
}

export async function createDraftProduct(input: DraftInput): Promise<DraftResult> {
  if (input.sku) {
    const dup = await wc<{ id: number; name: string; status: string }[]>('GET', `/products?sku=${encodeURIComponent(input.sku)}&status=any`);
    if (dup.length) throw new Error(`Mã ${input.sku} đã có trên web: "${decode(dup[0]!.name)}" (${dup[0]!.status}).`);
  }

  // Thuộc tính dùng chung trên web ("Chọn Size", "Loại Đinh") — gắn theo id để dùng đúng bộ lọc sẵn có
  const attrs = await wc<{ id: number; name: string }[]>('GET', '/products/attributes');
  const attrId = (name: string) => attrs.find((a) => a.name.toLowerCase() === name.toLowerCase())?.id;
  const attributes = [
    input.sizes.length && { ...(attrId('Chọn Size') ? { id: attrId('Chọn Size') } : { name: 'Chọn Size' }), options: input.sizes, visible: true },
    input.soleplate && { ...(attrId('Loại Đinh') ? { id: attrId('Loại Đinh') } : { name: 'Loại Đinh' }), options: [input.soleplate], visible: true },
  ].filter(Boolean);

  const brand = await detectBrand(input.name);

  const created = await wc<{ id: number }>('POST', '/products', {
    name: input.name,
    status: 'draft', // KHÔNG BAO GIỜ đổi: admin tự kiểm tra và bấm Đăng trên WordPress
    type: 'simple',
    sku: input.sku ?? undefined,
    regular_price: input.price ? String(input.price) : undefined,
    slug: input.slug,
    description: input.description_html,
    short_description: input.short_description_html,
    categories: input.category_ids.map((id) => ({ id })),
    tags: await tagIds(input.tags),
    attributes,
    ...(brand ? { etheme_brands: [brand.id] } : {}),
    meta_data: [
      { key: '_yoast_wpseo_title', value: input.seo_title },
      { key: '_yoast_wpseo_metadesc', value: input.meta_description },
      { key: '_yoast_wpseo_focuskw', value: input.focus_keyphrase },
    ],
  });
  return { id: created.id, edit_url: `${WOO_URL}/wp-admin/post.php?post=${created.id}&action=edit`, brand: brand?.name ?? null };
}
