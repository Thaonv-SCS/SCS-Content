import type { SupabaseClient } from '@supabase/supabase-js';
import { isLineCategory, surfaceCategories, type ProductRow } from './ai.ts';
import { esc, slugify } from './html.ts';
import type { ProductOutput } from './types.ts';
import { fetchBrands, matchBrand, type Brand, type WooCategory } from './woo.ts';

/**
 * "Dán nội dung soạn sẵn": KHÔNG gọi AI. Mô tả lấy nguyên bài dán, app chỉ tự gắn link nội bộ
 * theo đúng thứ tự như bài AI viết: danh mục dòng → (không có thì) trang hãng → loại sân.
 * Không có AI nên app tự dò chữ trong bài để gắn link; không thấy chữ hợp thì bỏ qua và báo lại.
 */

const WORD = '[\\p{L}\\p{N}]';
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phraseRe = (p: string) => new RegExp(`(?<!${WORD})${escRe(p.normalize('NFC'))}(?!${WORD})`, 'iu');

/** Bài dán là chữ thường → mỗi dòng một đoạn <p>, dòng bắt đầu bằng "-", "•", "+" gom thành danh sách. Bài đã là HTML thì giữ nguyên. */
export function pastedToHtml(text: string): string {
  const t = text.replace(/\r\n?/g, '\n').trim().normalize('NFC');
  if (/<\/?(p|div|table|tr|td|h[1-6]|ul|ol|li|br|strong|em|b|i|a|span|img)\b/i.test(t)) return t;
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(`<ul>${list.map((li) => `<li>${esc(li)}</li>`).join('')}</ul>`);
    list = [];
  };
  for (const raw of t.split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const bullet = line.match(/^[-•+*]\s+(.*)$/);
    if (bullet) list.push(bullet[1]!);
    else {
      flush();
      out.push(`<p>${esc(line)}</p>`);
    }
  }
  flush();
  return out.join('\n');
}

/** Gắn link vào lần xuất hiện ĐẦU TIÊN của cụm chữ (thử lần lượt các cụm), bỏ qua chữ đã nằm trong link khác. */
function linkFirst(html: string, phrases: string[], href: string): { html: string; anchor: string } | null {
  for (const phrase of phrases) {
    if (!phrase.trim()) continue;
    const re = phraseRe(phrase);
    const parts = html.split(/(<[^>]*>)/);
    let inLink = 0;
    let anchor: string | null = null;
    for (let i = 0; i < parts.length && !anchor; i++) {
      const s = parts[i]!;
      if (s.startsWith('<')) {
        if (/^<a[\s>]/i.test(s)) inLink++;
        else if (/^<\/a\s*>/i.test(s)) inLink = Math.max(0, inLink - 1);
        continue;
      }
      if (inLink) continue;
      const m = re.exec(s);
      if (!m) continue;
      anchor = m[0];
      parts[i] = `${s.slice(0, m.index)}<a href="${esc(href)}">${m[0]}</a>${s.slice(m.index + m[0].length)}`;
    }
    if (anchor) return { html: parts.join(''), anchor };
  }
  return null;
}

/** Tên danh mục bỏ chữ hãng ở đầu: "Nike Mercurial Vapor" → "Mercurial Vapor". */
function modelPart(cat: WooCategory, brands: Brand[]): string {
  const b = matchBrand(cat.name, brands);
  return b ? cat.name.replace(new RegExp(`^\\s*${escRe(b.name)}\\s*`, 'i'), '').trim() : cat.name.trim();
}

/** Danh mục dòng khớp tên sản phẩm (cùng hãng, tên dòng có trong tên sản phẩm), ưu tiên tên dòng dài nhất. */
function pickLineCategory(product: ProductRow, lineCats: WooCategory[], brands: Brand[], brand: Brand | null): WooCategory | null {
  const name = product.name.normalize('NFC');
  const hits = lineCats
    .map((c) => ({ c, model: modelPart(c, brands), cb: matchBrand(c.name, brands) }))
    .filter(({ model, cb }) => model && (!brand || !cb || cb.id === brand.id) && phraseRe(model).test(name))
    .sort((a, b) => b.model.length - a.model.length);
  return hits[0]?.c ?? null;
}

const SURFACE_PHRASES: Record<string, string[]> = {
  'giay-co-nhan-tao': ['giày bóng đá sân cỏ nhân tạo', 'giày đá bóng sân cỏ nhân tạo', 'giày cỏ nhân tạo', 'sân cỏ nhân tạo', 'cỏ nhân tạo', 'sân nhân tạo'],
  'giay-co-tu-nhien': ['giày bóng đá sân cỏ tự nhiên', 'giày đá bóng sân cỏ tự nhiên', 'giày cỏ tự nhiên', 'sân cỏ tự nhiên', 'cỏ tự nhiên', 'sân tự nhiên'],
};

export async function buildPastedOutput(db: SupabaseClient, product: ProductRow, pasted: string): Promise<ProductOutput> {
  const { data: cats } = await db.from('woo_categories').select('id,name,slug,parent,link,count');
  const categories = new Map((cats as WooCategory[] | null ?? []).map((c) => [c.id, c]));
  const brands = await fetchBrands().catch(() => [] as Brand[]);
  const brand = matchBrand(product.name, brands);
  const lineCats = [...categories.values()].filter((c) => isLineCategory(c, categories, brands));
  const lineCat = pickLineCategory(product, lineCats, brands, brand);
  const surfaces = surfaceCategories(product, categories);

  let html = pastedToHtml(pasted);
  const report: string[] = [];
  const already = (href: string) => html.includes(`href="${href}"`) || html.includes(`href='${href}'`);
  const tryLink = (label: string, phrases: string[], href: string): boolean => {
    if (already(href)) {
      report.push(`✓ ${label}: bài đã có sẵn link này`);
      return true;
    }
    const r = linkFirst(html, phrases, href);
    if (!r) return false;
    html = r.html;
    report.push(`✓ ${label}: gắn vào chữ "${r.anchor}"`);
    return true;
  };

  // 1) Danh mục dòng → 2) không gắn được thì trang hãng
  const lineDone = lineCat ? tryLink(`Danh mục dòng ${lineCat.name}`, [lineCat.name, modelPart(lineCat, brands)], lineCat.link) : false;
  if (lineCat && !lineDone) report.push(`✗ Danh mục dòng ${lineCat.name}: không thấy chữ "${modelPart(lineCat, brands)}" trong bài`);
  if (!lineDone) {
    if (brand) {
      const ok = tryLink(`Trang hãng ${brand.name}`, [`giày bóng đá ${brand.name}`, `giày đá bóng ${brand.name}`, brand.name], brand.link);
      if (!ok) report.push(`✗ Trang hãng ${brand.name}: không thấy chữ "${brand.name}" trong bài`);
    } else if (!lineCat) report.push('✗ Không nhận ra dòng / hãng từ tên sản phẩm — không gắn link dòng / hãng');
  }
  // 3) Loại sân (chỉ giày, theo loại đinh)
  for (const s of surfaces) {
    const ok = tryLink(s.name, SURFACE_PHRASES[s.slug] ?? [s.name], s.link);
    if (!ok) report.push(`✗ ${s.name}: không thấy chữ "${SURFACE_PHRASES[s.slug]?.[3] ?? s.name}" trong bài`);
  }
  if (product.type === 'boots' && !surfaces.length) report.push('ℹ Chưa chọn Loại đinh nên không gắn link loại sân');

  const skuInName = product.sku && product.name.toLowerCase().includes(product.sku.toLowerCase());
  const fullName = skuInName || !product.sku ? product.name : `${product.name} ${product.sku}`;

  return {
    seo_title: '',
    meta_description: '',
    focus_keyphrase: '',
    short_description_html: '',
    description_html: html,
    tags: product.sku ? [product.sku] : [],
    slug: slugify(fullName),
    image_alt: fullName,
    suggested_category_ids: [...(lineCat ? [lineCat.id] : []), ...surfaces.map((c) => c.id)],
    missing: [],
    to_verify: [],
    manual: true,
    link_report: report,
    generated_at: new Date().toISOString(),
  };
}
