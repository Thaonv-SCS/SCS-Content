/**
 * Làm việc với website WooCommerce.
 * - Đọc công khai (không cần khóa): danh mục, sản phẩm mẫu (Store API + WordPress REST, có cả Yoast).
 * - Ghi (cần WOO_CONSUMER_KEY / WOO_CONSUMER_SECRET): chỉ TẠO BẢN NHÁP — không có lệnh đăng hay sửa sản phẩm đang bán.
 */

import { exampleToText } from './html.ts';

export const WOO_URL = (process.env.WOO_URL || 'https://soccerstore.vn').replace(/\/+$/, '');
/**
 * Header gửi kèm mọi request tới web. SITE_ACCESS_TOKEN = mã bí mật để Cloudflare nhận ra app và cho đi qua
 * (luật WAF: header X-Content-App đúng mã → Skip). Máy chủ Netlify bị Cloudflare coi là "máy lạ" nên cần mã này.
 */
export function siteHeaders(): Record<string, string> {
  const token = process.env.SITE_ACCESS_TOKEN?.trim();
  return { 'User-Agent': 'Mozilla/5.0 (compatible; SoccerstoreContentApp/0.1)', ...(token ? { 'X-Content-App': token } : {}) };
}

/** Bị chặn (403 / 429 / 503) thì đoán bên nào chặn: Cloudflare hay máy chủ web phía sau — để biết sửa ở đâu. */
export function blockedHint(res: Response, body: string): string {
  if (![403, 429, 503].includes(res.status)) return '';
  const mitigated = res.headers.get('cf-mitigated');
  const ray = res.headers.get('cf-ray');
  const title = body.match(/<title>([^<]*)/i)?.[1]?.trim();
  const who = mitigated
    ? `Cloudflare chặn (${mitigated})`
    : /Apache|nginx|LiteSpeed|Wordfence|Imunify/i.test(body)
      ? 'máy chủ web chặn (không phải Cloudflare)'
      : /cloudflare|Attention Required|Just a moment/i.test(body + (title ?? ''))
        ? 'Cloudflare chặn'
        : 'chưa rõ bên nào chặn';
  const token = process.env.SITE_ACCESS_TOKEN?.trim() ? 'có gửi mã SITE_ACCESS_TOKEN' : 'CHƯA có SITE_ACCESS_TOKEN';
  return ` — ${who}${title ? `, trang "${title}"` : ''}${ray ? `, Ray ID ${ray}` : ''}, ${token}`;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: siteHeaders(), signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${url}${blockedHint(res, body)}`);
  }
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
  return fetchExamplesByIds(found.map((p) => p.id));
}

export async function fetchExamplesByIds(ids: number[]): Promise<WooExample[]> {
  if (!ids.length) return [];
  const store = await getJson<StoreProduct[]>(
    `${WOO_URL}/wp-json/wc/store/v1/products?per_page=100&include=${ids.slice(0, 100).join(',')}`,
  );
  return withFullContent(store);
}

/** Dữ kiện một sản phẩm cho Dự án video (nguồn chuẩn: giá, size, còn hàng, mô tả đang đăng trên web). */
export interface ProductFacts {
  link: string;
  name: string;
  sku: string | null;
  gia: string;
  gia_goc: string | null;
  con_hang: boolean;
  size: string[];
  mo_ta_ngan: string;
  mo_ta: string;
}

/** Link sản phẩm trên web → dữ kiện. Link không phải trang sản phẩm / không tìm thấy thì bỏ qua (trả về trong `khong_thay`). */
export async function fetchProductFacts(urls: string[]): Promise<{ items: ProductFacts[]; khong_thay: string[] }> {
  const bySlug = new Map<string, string>();
  for (const u of urls) {
    const s = slugFromProductUrl(u);
    if (s) bySlug.set(s, u);
  }
  const khong_thay = urls.filter((u) => !slugFromProductUrl(u));
  if (!bySlug.size) return { items: [], khong_thay };
  const found = await getJson<{ id: number; slug: string }[]>(
    `${WOO_URL}/wp-json/wp/v2/product?per_page=100&slug=${[...bySlug.keys()].join(',')}&_fields=id,slug`,
  );
  for (const [s, u] of bySlug) if (!found.some((f) => f.slug.toLowerCase() === s)) khong_thay.push(u);
  if (!found.length) return { items: [], khong_thay };
  type StoreFull = StoreProduct & {
    is_in_stock: boolean;
    prices: { price: string; regular_price: string; sale_price: string; currency_minor_unit: number };
    attributes: { name: string; terms: { name: string }[] }[];
  };
  const [store, full] = await Promise.all([
    getJson<StoreFull[]>(`${WOO_URL}/wp-json/wc/store/v1/products?per_page=100&include=${found.map((f) => f.id).join(',')}`),
    fetchExamplesByIds(found.map((f) => f.id)),
  ]);
  const vnd = (minor: string, unit: number) => `${Math.round(Number(minor) / 10 ** unit).toLocaleString('vi-VN')}đ`;
  const text = (html: string, max: number) => exampleToText(html, max);
  return {
    items: store.map((p) => {
      const f = full.find((x) => x.woo_id === p.id);
      const giam = p.prices.sale_price && p.prices.sale_price !== p.prices.regular_price;
      return {
        link: p.permalink,
        name: decode(p.name),
        sku: p.sku || null,
        gia: vnd(p.prices.price, p.prices.currency_minor_unit),
        gia_goc: giam ? vnd(p.prices.regular_price, p.prices.currency_minor_unit) : null,
        con_hang: p.is_in_stock,
        size: p.attributes.find((a) => /size/i.test(a.name))?.terms.map((t) => t.name) ?? [],
        mo_ta_ngan: text(p.short_description, 600),
        mo_ta: text(f?.description_html ?? '', 3000),
      };
    }),
    khong_thay,
  };
}

/** Lấy slug sản phẩm từ link trên web, vd https://soccerstore.vn/san-pham/abc-xyz/ → "abc-xyz". */
export function slugFromProductUrl(url: string): string | null {
  const m = url.trim().match(/\/san-pham\/([^/?#]+)/);
  if (!m) return null;
  // Trình duyệt có thể hiện "β" thay vì "%ce%b2" — đưa về dạng mã hóa như WordPress lưu
  let seg = m[1]!;
  try {
    seg = decodeURIComponent(seg);
  } catch {}
  return encodeURIComponent(seg).toLowerCase();
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

async function wcRaw<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ data: T; headers: Headers }> {
  const res = await fetch(`${WOO_URL}/wp-json/wc/v3${path}`, {
    method,
    headers: { ...siteHeaders(), Authorization: wcAuth(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text().catch(() => '');
  let data: (T & { message?: string }) | null = null;
  try {
    data = JSON.parse(text) as T & { message?: string };
  } catch {}
  if (!res.ok || data === null) {
    throw new Error(`WooCommerce ${res.status}: ${data?.message ?? 'lỗi không rõ'}${data?.message ? '' : blockedHint(res, text)}`);
  }
  return { data, headers: res.headers };
}

export async function wc<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  return (await wcRaw<T>(method, path, body)).data;
}

/** Như wc() nhưng trả kèm header (tổng số trang / tổng số sản phẩm của danh sách). */
export const wcList = wcRaw;

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
  sale_price?: number | null;
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

/**
 * Ô "Loại Đinh" trên web ghi cả loại sân lẫn mã đinh (vd "Cỏ Nhân Tạo" + "TF") — bộ lọc web dùng loại sân.
 */
export function soleplateOptions(plate?: string): string[] {
  const p = plate?.trim().toUpperCase();
  if (!p) return [];
  const surface: Record<string, string[]> = {
    TF: ['Cỏ Nhân Tạo'],
    AG: ['Cỏ Nhân Tạo'],
    FG: ['Cỏ Tự Nhiên'],
    SG: ['Cỏ Tự Nhiên'],
    MG: ['Cỏ Nhân Tạo', 'Cỏ Tự Nhiên'],
  };
  return [...(surface[p] ?? []), p];
}

export async function createDraftProduct(input: DraftInput): Promise<DraftResult> {
  if (input.sku) {
    const dup = await wc<{ id: number; name: string; status: string }[]>('GET', `/products?sku=${encodeURIComponent(input.sku)}&status=any`);
    if (dup.length) throw new Error(`Mã ${input.sku} đã có trên web: "${decode(dup[0]!.name)}" (${dup[0]!.status}).`);
  }

  // Thuộc tính dùng chung trên web ("Chọn Size", "Loại Đinh") — gắn theo id để dùng đúng bộ lọc sẵn có
  const attributes = await thuocTinh(input);

  const brand = await detectBrand(input.name);

  const created = await wc<{ id: number }>('POST', '/products', {
    ...(await truongNoiDung(input, attributes, brand)),
    status: 'draft', // KHÔNG BAO GIỜ đổi: admin tự kiểm tra và bấm Đăng trên WordPress
    type: 'simple',
    sku: input.sku ?? undefined,
    slug: input.slug,
  });
  return { id: created.id, edit_url: `${WOO_URL}/wp-admin/post.php?post=${created.id}&action=edit`, brand: brand?.name ?? null };
}

/** Thuộc tính "Chọn Size" / "Loại Đinh" theo id có sẵn trên web. */
export async function thuocTinh(input: Pick<DraftInput, 'sizes' | 'soleplate'>): Promise<{ id?: number; name?: string; options: string[]; visible: boolean }[]> {
  const attrs = await wc<{ id: number; name: string }[]>('GET', '/products/attributes');
  const attrId = (name: string) => attrs.find((a) => a.name.toLowerCase() === name.toLowerCase())?.id;
  const plates = soleplateOptions(input.soleplate);
  return [
    input.sizes.length ? { ...(attrId('Chọn Size') ? { id: attrId('Chọn Size') } : { name: 'Chọn Size' }), options: input.sizes, visible: true } : null,
    plates.length ? { ...(attrId('Loại Đinh') ? { id: attrId('Loại Đinh') } : { name: 'Loại Đinh' }), options: plates, visible: true } : null,
  ].filter((x): x is NonNullable<typeof x> => !!x);
}

/** Các ô nội dung chung cho tạo mới lẫn cập nhật (không gồm trạng thái, SKU, slug, ảnh). */
export async function truongNoiDung(input: DraftInput, attributes: unknown[], brand: Brand | null) {
  return {
    name: input.name,
    regular_price: input.price ? String(input.price) : undefined,
    // có giá gốc mà không có giá KM hợp lệ → xóa giá KM cũ trên web (cập nhật)
    sale_price: input.price ? (input.sale_price && input.sale_price < input.price ? String(input.sale_price) : '') : undefined,
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
    ].filter((m) => m.value?.trim()), // ô trống (bài tự dán chưa điền) → để Yoast dùng mặc định
  };
}
