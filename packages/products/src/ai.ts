import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { costOf, WEB_SEARCH_COST_USD, type TokenUsage } from '@app/core';
import { categoryPath, exampleToText, renderParagraphs, renderSpecTable, slugify, type LinkTarget } from './html.ts';
import { SPEC_FIELDS, type ProductOutput, type ProductType, type ResearchFact, type ResearchResult } from './types.ts';
import { fetchBrands, matchBrand, type Brand, type WooCategory } from './woo.ts';

export const PRODUCT_PROMPT_VERSION = 'product-v3';

/** Danh mục dòng: nằm trong cây "Bộ Sưu Tập", hoặc tên chứa tên hãng (vd "Puma Future", "Kamito"). */
export function isLineCategory(c: WooCategory, categories: Map<number, WooCategory>, brands: Brand[]): boolean {
  for (let cur: WooCategory | undefined = c; cur; cur = cur.parent ? categories.get(cur.parent) : undefined) {
    if (cur.slug === 'bo-suu-tap') return cur !== c;
  }
  return matchBrand(c.name, brands) != null;
}

/** Danh mục loại sân theo loại đinh (giày): TF/AG → cỏ nhân tạo, FG/SG → cỏ tự nhiên, MG → cả hai. */
export function surfaceCategories(product: ProductRow, categories: Map<number, WooCategory>): WooCategory[] {
  if (product.type !== 'boots') return [];
  const plate = (product.spec.soleplate?.trim() || product.name.match(/\b(FG|SG|AG|MG|TF|IC)\b/i)?.[1] || '').toUpperCase();
  const slugs = { TF: ['giay-co-nhan-tao'], AG: ['giay-co-nhan-tao'], FG: ['giay-co-tu-nhien'], SG: ['giay-co-tu-nhien'], MG: ['giay-co-nhan-tao', 'giay-co-tu-nhien'] }[plate] ?? [];
  return [...categories.values()].filter((c) => slugs.includes(c.slug));
}
export const WRITE_MODEL = process.env.WRITE_MODEL || 'claude-opus-5-5';
const PARSE_MODEL = process.env.CLASSIFY_MODEL || 'claude-haiku-5-5';
const MAX_LINKS = 4;

export const anthropic = new Anthropic();

export type ProductRow = {
  id: string;
  type: ProductType;
  name: string;
  sku: string | null;
  price: number | null;
  sizes: string[];
  spec: Record<string, string>;
  notes: string | null;
  output: ProductOutput | null;
  category_ids: number[];
  color?: string | null;
  batch_id?: string | null;
};

// ───────────── Chi phí ─────────────

/** Trần chi phí ngày dùng chung với bản tin (đọc qua hàm SQL để nhân viên không cần quyền xem bảng chi phí). */
export async function assertBudget(db: SupabaseClient) {
  const [{ data: spent }, { data: limit }] = await Promise.all([db.rpc('ai_spent_today'), db.rpc('ai_daily_budget')]);
  if (Number(spent) >= Number(limit)) {
    throw new Error(`Đã chạm trần chi phí AI hôm nay ($${Number(limit).toFixed(2)}). Admin có thể nâng trần ở trang Cài đặt.`);
  }
}

export async function recordCall(db: SupabaseClient, purpose: string, model: string, usage: TokenUsage, searches = 0) {
  await db.from('llm_calls').insert({
    purpose,
    model,
    tokens_in: usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
    tokens_out: usage.output_tokens,
    cost_usd: costOf(model, usage) + searches * WEB_SEARCH_COST_USD,
  });
}

// ───────────── Viết nội dung ─────────────

const SYSTEM = `Mày viết nội dung trang sản phẩm cho website soccerstore.vn (shop giày & phụ kiện bóng đá, WordPress WooCommerce, plugin Yoast SEO).
Kèm theo là vài sản phẩm mẫu đã đăng trên web — học theo đúng bố cục, độ dài, cách in đậm, cách đặt tiêu đề và giọng văn của chúng.

MỤC TIÊU SEO: khách tìm TÊN sản phẩm hoặc MÃ sản phẩm trên Google thì ra trang này.
- seo_title: theo kiểu mẫu "<Tên sản phẩm> <phối màu> <mã>", tối đa ~65 ký tự, có mã.
- meta_description: 140–165 ký tự, có tên sản phẩm và 2–3 điểm nổi bật.
- focus_keyphrase: tên sản phẩm ngắn gọn không kèm màu (vd "Nike Mercurial Vapor 16 Pro TF").
- short_description: 1–2 câu (35–50 chữ), có tên đầy đủ + mã + bộ sưu tập / phân khúc / điểm chính.
- Tên đầy đủ (in đậm) phải xuất hiện ở đầu đoạn văn đầu tiên; mã sản phẩm xuất hiện ít nhất một lần trong bài.

BẢNG THÔNG SỐ (table_values): đúng một giá trị cho mỗi dòng, theo đúng thứ tự dòng được cho.
- Lấy từ phiếu nhập, diễn đạt gọn như mẫu (vd "TF ( turf ), giày đá cỏ nhân tạo, bám sân hoàn hảo.").
- Có thể xuống dòng trong một ô bằng \\n (vd bộ sưu tập + "Phối màu gốc: …").
- Ô Trọng lượng trống → "N/A, tương đối nhẹ".
- Ô Cầu thủ tiêu biểu trống → được gợi ý vài cầu thủ nổi tiếng gắn với dòng sản phẩm này, NHƯNG phải ghi vào to_verify.
- Ô trống khác → "Đang cập nhật" và ghi tên ô vào missing.

ĐOẠN VĂN (paragraphs): 3–4 đoạn, tổng 200–350 chữ, theo trình tự như mẫu: mở bài (tên đầy đủ in đậm, bộ sưu tập, vị trí của sản phẩm) → thiết kế / phối màu → form / phân khúc / chất liệu → đế / công nghệ và kiểu cầu thủ phù hợp. In đậm cụm quan trọng bằng **…**.

QUY TẮC THÔNG TIN:
- Thông số kỹ thuật (chất liệu, đế, công nghệ, trọng lượng, phối màu, bộ sưu tập) CHỈ lấy từ phiếu nhập. Không bịa thông số.
- Được dùng kiến thức chung về DÒNG sản phẩm (định vị của dòng, lối chơi phù hợp) để bài có chiều sâu; điều gì không chắc thì ghi vào to_verify.
- missing: ô phiếu quan trọng còn trống mà admin nên bổ sung.

LINK NỘI BỘ: tổng cộng 2–4 link (tính cả link ở ô đầu bảng, ô này do hệ thống tự gắn). Đích theo thứ tự ưu tiên:
1. Danh mục DÒNG sản phẩm (trong "Danh mục dòng được phép") nếu có danh mục đúng dòng → đặt line_category_id = ID đó, và trong đoạn văn link 1–3 lần về ID đó với chữ gắn link khác nhau.
2. KHÔNG có danh mục đúng dòng → line_category_id = null, link về TRANG HÃNG bằng [[link:brand|…]] (1–2 lần), chữ gắn link kiểu "giày bóng đá Kelme", "Kelme".
3. Danh mục LOẠI SÂN (nếu được cho trong "Đích link cho sản phẩm này") → tối đa 1 link, chữ gắn link kiểu "giày bóng đá sân cỏ nhân tạo", "giày đá sân cỏ tự nhiên".
- Không đoán danh mục dòng gần giống: "Kelme Stazzle" KHÔNG thuộc "Kelme Flash"; "Phantom 6" thuộc "Nike Phantom".
- Cú pháp trong đoạn văn: [[link:KHÓA|chữ gắn link]], KHÓA là ID danh mục hoặc chữ brand. Chỉ dùng khóa được liệt kê; link sai sẽ bị gỡ.
- Chữ gắn link là cụm tự nhiên như "Giày bóng đá adidas F50 Hyperfast", "Vapor 16 Pro TF", đặt rải ở các đoạn khác nhau.

DANH MỤC SẢN PHẨM (suggested_category_ids): các danh mục sản phẩm này nên thuộc, theo cách các mẫu được xếp (vd Giày Bóng Đá + loại sân + hãng/dòng).
TAGS: 3–6 tag theo kiểu mẫu — bắt buộc có mã sản phẩm, thêm tên rút gọn + năm / phối màu và các biến thể người dùng hay tìm.`;

const OutputSchema = z.object({
  seo_title: z.string(),
  meta_description: z.string(),
  focus_keyphrase: z.string(),
  short_description: z.string(),
  table_values: z.array(z.string()),
  line_category_id: z.number().int().nullable(),
  paragraphs: z.array(z.string()),
  tags: z.array(z.string()),
  suggested_category_ids: z.array(z.number().int()),
  missing: z.array(z.string()),
  to_verify: z.array(z.object({ claim: z.string(), reason: z.string() })),
});

type ExampleRow = {
  name: string;
  sku: string | null;
  short_description: string | null;
  description_html: string | null;
  yoast_title: string | null;
  yoast_meta: string | null;
  tags: string[];
  is_gold: boolean;
  modified_at: string | null;
  /** Bài viết trong app đã được duyệt và đẩy lên web (văn phong mới nhất của shop). */
  approved?: boolean;
};

const GENERIC = new Set(['giay', 'bong', 'da', 'tf', 'fg', 'ag', 'ic', 'sg', 'mg', 'mau', 'pack', 'the', 'and', 'phoi']);
const words = (s: string) =>
  new Set(
    slugify(s)
      .split('-')
      .filter((w) => w.length >= 2 && !GENERIC.has(w) && !/^\d{4,}$/.test(w)),
  );

/** Chọn mẫu gần nhất: trùng nhiều chữ trong tên (hãng, dòng, phân khúc), ưu tiên mẫu chuẩn, bài đã duyệt và bài mới. */
function pickExamples(examples: ExampleRow[], product: ProductRow, n = 4): ExampleRow[] {
  const target = words(product.name);
  const ownSku = product.sku?.toLowerCase();
  return examples
    .filter((e) => e.description_html && e.description_html.length > 500)
    .filter((e) => !ownSku || e.sku?.toLowerCase() !== ownSku) // không lấy chính sản phẩm này làm mẫu
    .map((e) => {
      const shared = [...words(e.name)].filter((w) => target.has(w)).length;
      const ageDays = e.modified_at ? (Date.now() - new Date(e.modified_at).getTime()) / 86400_000 : 999;
      return { e, score: shared * 2 + (e.is_gold ? 3 : 0) + (e.approved ? 2 : 0) + Math.max(0, 1 - ageDays / 365) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.e);
}

/**
 * Kho mẫu = sản phẩm trên web + bài trong app đã đẩy lên web. Bài đã đẩy mà web cũng có (trùng mã)
 * thì dùng bản trên web (có thể đã được sửa thêm trên WordPress) nhưng vẫn tính là "đã duyệt".
 */
async function loadExamples(db: SupabaseClient): Promise<ExampleRow[]> {
  const [{ data: web }, { data: pushed }] = await Promise.all([
    db
      .from('product_examples')
      .select('name,sku,short_description,description_html,yoast_title,yoast_meta,tags,is_gold,modified_at')
      .order('modified_at', { ascending: false })
      .limit(400),
    db.from('products').select('name,sku,output,pushed_at').not('pushed_at', 'is', null).order('pushed_at', { ascending: false }).limit(60),
  ]);
  const webRows = (web as ExampleRow[] | null) ?? [];
  const pushedRows = (pushed ?? []) as { name: string; sku: string | null; output: ProductOutput | null; pushed_at: string }[];
  const approvedSkus = new Set(pushedRows.flatMap((p) => (p.sku ? [p.sku.toLowerCase()] : [])));
  const webSkus = new Set(webRows.flatMap((e) => (e.sku ? [e.sku.toLowerCase()] : [])));
  return [
    ...webRows.map((e) => ({ ...e, approved: !!e.sku && approvedSkus.has(e.sku.toLowerCase()) })),
    ...pushedRows
      .filter((p) => p.output && !(p.sku && webSkus.has(p.sku.toLowerCase())))
      .map((p) => ({
        name: p.name,
        sku: p.sku,
        short_description: p.output!.short_description_html,
        description_html: p.output!.description_html,
        yoast_title: p.output!.seo_title,
        yoast_meta: p.output!.meta_description,
        tags: p.output!.tags,
        is_gold: false,
        modified_at: p.pushed_at,
        approved: true,
      })),
  ];
}

/** Bài các màu khác trong cùng lô đã viết — đưa cho AI để tránh lặp câu chữ (Google không thích nội dung trùng). */
async function loadSiblings(db: SupabaseClient, product: ProductRow): Promise<{ name: string; text: string }[]> {
  if (!product.batch_id) return [];
  // Lô nhập Excel = các sản phẩm khác nhau, không phải các màu của cùng mẫu
  const { data: batch } = await db.from('product_batches').select('kind').eq('id', product.batch_id).maybeSingle();
  if (batch?.kind === 'import') return [];
  const { data } = await db
    .from('products')
    .select('id,name,output')
    .eq('batch_id', product.batch_id)
    .neq('id', product.id)
    .not('output', 'is', null)
    .order('created_at')
    .limit(6);
  return ((data ?? []) as { name: string; output: ProductOutput }[]).map((s) => ({
    name: s.name,
    text: exampleToText(`${s.output.short_description_html}\n${s.output.description_html.replace(/<table[\s\S]*?<\/table>/i, '')}`, 1500),
  }));
}

export async function loadStyleNotes(db: SupabaseClient): Promise<string> {
  const { data } = await db.from('product_style').select('notes').eq('id', 1).maybeSingle();
  return (data?.notes as string | undefined)?.trim() ?? '';
}

export async function generateProduct(db: SupabaseClient, product: ProductRow, instruction?: string): Promise<ProductOutput> {
  await assertBudget(db);

  const [{ data: cats }, examples, siblings, styleNotes] = await Promise.all([
    db.from('woo_categories').select('id,name,slug,parent,link,count'),
    loadExamples(db),
    loadSiblings(db, product),
    loadStyleNotes(db),
  ]);
  const categories = new Map((cats as WooCategory[] | null ?? []).map((c) => [c.id, c]));
  if (!categories.size) throw new Error('Chưa có danh mục từ website — admin bấm "Đồng bộ dữ liệu website" trước.');

  const fields = SPEC_FIELDS[product.type];
  const picked = pickExamples(examples, product);

  // Đích link do code quyết định; AI chỉ chọn chữ gắn link
  const brands = await fetchBrands().catch(() => [] as Brand[]);
  const brand = matchBrand(product.name, brands);
  const lineCats = [...categories.values()].filter((c) => isLineCategory(c, categories, brands));
  const surfaces = surfaceCategories(product, categories);

  const body =
    `## Sản phẩm mẫu đã đăng trên web (học bố cục và giọng văn)\n` +
    picked
      .map(
        (e, i) =>
          `### Mẫu ${i + 1}: ${e.name}\nTiêu đề SEO: ${e.yoast_title ?? '—'}\nMeta: ${e.yoast_meta ?? '—'}\nMô tả ngắn: ${exampleToText(e.short_description ?? '', 400)}\nTags: ${e.tags.join(', ')}\nMô tả:\n${exampleToText(e.description_html ?? '')}`,
      )
      .join('\n\n') +
    `\n\n## Danh mục trên web (ID | đường dẫn danh mục)\n` +
    [...categories.values()].map((c) => `${c.id} | ${categoryPath(c, categories)}`).join('\n') +
    `\n\n## Đích link cho sản phẩm này\nDanh mục dòng được phép (ID | đường dẫn):\n` +
    lineCats.map((c) => `${c.id} | ${categoryPath(c, categories)}`).join('\n') +
    `\nTrang hãng (khóa brand): ${brand ? `${brand.name} — chỉ dùng khi không có danh mục đúng dòng` : 'không có — không dùng brand'}` +
    `\nDanh mục loại sân: ${surfaces.length ? surfaces.map((c) => `${c.id} | ${c.name}`).join('; ') : 'không có — không link loại sân'}` +
    (siblings.length
      ? `\n\n## Bài của các màu khác trong cùng lô (đã viết)\nSản phẩm cần viết là một MÀU KHÁC của cùng mẫu. Bảng thông số được phép giống, nhưng mô tả ngắn, câu mở bài và các đoạn văn phải viết KHÁC: đổi cách mở bài, nhấn vào phối màu riêng của màu này, không chép lại câu nào dưới đây.\n` +
        siblings.map((s) => `### ${s.name}\n${s.text}`).join('\n\n')
      : '') +
    `\n\n## Phiếu nhập sản phẩm cần viết\nLoại: ${product.type}\nTên sản phẩm: ${product.name}\nMã: ${product.sku ?? '(không có)'}\nPhối màu: ${product.color?.trim() || '(xem trong tên)'}\nGiá: ${product.price ?? '—'}\n` +
    `Các dòng bảng thông số (theo thứ tự):\n` +
    fields.map((f, i) => `${i + 1}. ${f.label}: ${product.spec[f.key]?.trim() || '(trống)'}`).join('\n') +
    `\nÝ chính khác: ${product.notes?.trim() || '(không có)'}` +
    (instruction && product.output
      ? `\n\n## Bản đang có\nTiêu đề SEO: ${product.output.seo_title}\nMô tả ngắn: ${exampleToText(product.output.short_description_html, 600)}\nMô tả:\n${exampleToText(product.output.description_html, 3000)}\n\n## Yêu cầu viết lại\n${instruction}`
      : '');

  const res = await anthropic.beta.messages.parse({
    model: WRITE_MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [
      { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
      ...(styleNotes
        ? [
            {
              type: 'text' as const,
              text: `GHI CHÚ VĂN PHONG — rút ra từ các bài admin đã sửa tay. Ưu tiên tuân theo các luật này hơn cả mẫu:\n${styleNotes}`,
              cache_control: { type: 'ephemeral' as const },
            },
          ]
        : []),
    ],
    output_config: { format: betaZodOutputFormat(OutputSchema), effort: 'medium' },
    messages: [{ role: 'user', content: body }],
  });
  await recordCall(db, 'product-write', res.model, res.usage);
  if (res.stop_reason === 'refusal') throw new Error('AI từ chối viết nội dung này.');
  const o = res.parsed_output;
  if (!o) throw new Error('AI trả về sai định dạng — thử lại.');

  // Dựng HTML bằng code: bảng đúng khung web, link chỉ về đích được phép, tối đa 4 link.
  // Ưu tiên: 1) danh mục dòng  2) trang hãng (khi không có dòng)  3) loại sân (link phụ, 1 lần)
  const lineCat = lineCats.find((c) => c.id === o.line_category_id);
  const targets = new Map<string, LinkTarget>();
  if (lineCat) targets.set(String(lineCat.id), { link: lineCat.link, max: 3 });
  else if (brand) targets.set('brand', { link: brand.link, max: 2 });
  surfaces.forEach((c) => targets.set(String(c.id), { link: c.link, max: 1 }));
  // Ô đầu bảng (Dòng giày / Dòng bóng / Dòng găng) gắn link về dòng, không có dòng thì về trang hãng
  const tableLink = fields[0]?.key === 'line' ? (lineCat?.link ?? brand?.link) : undefined;
  const table = renderSpecTable(
    fields.map((f, i) => ({ label: f.label, value: o.table_values[i]?.trim() || product.spec[f.key]?.trim() || 'Đang cập nhật' })),
    tableLink,
  );
  const paragraphs = renderParagraphs(o.paragraphs, targets, MAX_LINKS - (tableLink ? 1 : 0));

  const skuInName = product.sku && product.name.toLowerCase().includes(product.sku.toLowerCase());
  const fullName = skuInName || !product.sku ? product.name : `${product.name} ${product.sku}`;
  const suggested = [...new Set([...o.suggested_category_ids, ...(lineCat ? [lineCat.id] : [])])].filter((id) =>
    categories.has(id),
  );

  return {
    seo_title: o.seo_title,
    meta_description: o.meta_description,
    focus_keyphrase: o.focus_keyphrase,
    short_description_html: `<p>${o.short_description.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>`,
    description_html: `${table}\n${paragraphs.html}`,
    tags: [...new Set([...(product.sku ? [product.sku] : []), ...o.tags])],
    slug: slugify(fullName),
    image_alt: fullName,
    suggested_category_ids: suggested,
    missing: o.missing,
    to_verify: o.to_verify,
    model: res.model,
    generated_at: new Date().toISOString(),
  };
}

// ───────────── Tìm thêm thông tin trên web ─────────────

const FactsSchema = z.object({
  facts: z.array(z.object({ field: z.string(), value: z.string(), source_url: z.string(), source_title: z.string() })),
});

export async function researchProduct(db: SupabaseClient, product: ProductRow): Promise<ResearchResult> {
  await assertBudget(db);
  const fields = SPEC_FIELDS[product.type];

  // Bước 1: AI tìm trên web, ghi lại thông tin kèm nguồn
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: 'user',
      content:
        `Tìm thông số chính thức của sản phẩm bóng đá: "${product.name}"${product.sku ? `, mã ${product.sku}` : ''}.\n` +
        `Cần các thông tin: ${fields.map((f) => f.label).join(', ')}.\n` +
        `Ưu tiên trang chính hãng (nike.com, adidas.com, puma.com, mizuno…), nhà bán lẻ lớn và trang tin giày uy tín (Footy Headlines…).\n` +
        `Liệt kê từng thông tin tìm được kèm URL nguồn. KHÔNG đoán — không tìm thấy thì nói không tìm thấy.`,
    },
  ];
  let text = '';
  let searches = 0;
  for (let turn = 0; turn < 3; turn++) {
    const res = await anthropic.beta.messages.create({
      model: WRITE_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // 3 lượt tìm là đủ cho thông số một sản phẩm; mỗi lượt kéo theo nhiều chữ AI phải đọc (chi phí chính)
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
      output_config: { effort: 'low' },
      messages,
    });
    searches += res.usage.server_tool_use?.web_search_requests ?? 0;
    await recordCall(db, 'product-research', res.model, res.usage);
    if (res.stop_reason === 'refusal') throw new Error('AI từ chối tìm kiếm.');
    text += res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    if (res.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: res.content });
  }
  if (searches) await recordCall(db, 'product-research-search', 'web_search', { input_tokens: 0, output_tokens: 0 }, searches);

  // Bước 2: model rẻ tách thành từng dòng thông tin có nguồn, gắn vào ô phiếu tương ứng
  const parsed = await anthropic.messages.parse({
    model: PARSE_MODEL,
    max_tokens: 8000,
    output_config: { format: zodOutputFormat(FactsSchema), effort: 'low' },
    messages: [
      {
        role: 'user',
        content:
          `Tách đoạn sau thành từng thông tin có nguồn. field là một trong: ${fields.map((f) => `${f.key} (${f.label})`).join(', ')}, hoặc "other".\n` +
          `value viết tiếng Việt ngắn gọn. Bỏ thông tin không có URL nguồn.\n\n${text}`,
      },
    ],
  });
  await recordCall(db, 'product-research-parse', parsed.model, parsed.usage);

  const facts: ResearchFact[] = (parsed.parsed_output?.facts ?? []).filter((f) => /^https?:\/\//.test(f.source_url));
  return { facts, at: new Date().toISOString() };
}
