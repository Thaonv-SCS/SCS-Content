'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  addGoldExampleByUrl,
  createDraftProduct,
  findBySkus,
  IMPORT_MAX_ROWS,
  parseVariants,
  PRODUCT_TYPE_LABEL,
  type ImportRow,
  runJob,
  SPEC_FIELDS,
  syncFromWebsite,
  userClient,
  variantName,
  type BatchMode,
  type JobRequest,
  type ProductJob,
  type ProductOutput,
  type ProductType,
  type ResearchResult,
} from '@app/products';
import { supabaseServer } from '@/lib/supabase';
import { currentUser } from '@/lib/auth';

/**
 * Giao việc cho hàm chạy nền (viết mất 30–60 giây / sản phẩm, quá giới hạn một yêu cầu thường).
 * - Trên Netlify: gọi Background Function (trả về ngay, chạy tối đa 15 phút).
 * - Trên máy: chạy luôn trong tiến trình dev, không chờ.
 * Hàm nền dùng access token của chính người bấm → quyền như trên web, không cần service key.
 */
async function dispatch(request: JobRequest): Promise<string | null> {
  const supabase = await supabaseServer();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return 'Phiên đăng nhập hết hạn, đăng nhập lại.';

  if (process.env.NETLIFY) {
    const h = await headers();
    const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
    const res = await fetch(`${origin}/.netlify/functions/product-job-background`, {
      method: 'POST',
      body: JSON.stringify({ request, token: session.access_token }),
    });
    if (!res.ok && res.status !== 202) return `Không khởi động được việc chạy nền (HTTP ${res.status}).`;
  } else {
    void runJob(userClient(session.access_token), request);
  }
  return null;
}

const isRunning = (row: { job_status: string; job_started_at: string | null } | null) =>
  !!row && ['queued', 'running'].includes(row.job_status) && !!row.job_started_at && Date.now() - new Date(row.job_started_at).getTime() < 15 * 60_000;

async function startProductJob(productId: string, job: ProductJob, instruction?: string): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data: p } = await supabase.from('products').select('job_status,job_started_at').eq('id', productId).single();
  if (isRunning(p)) return 'Đang có một việc chạy cho sản phẩm này, đợi xong đã.';
  await supabase
    .from('products')
    .update({ job, job_status: 'queued', job_error: null, job_started_at: new Date().toISOString() })
    .eq('id', productId);
  const err = await dispatch({ kind: 'product', id: productId, job, instruction });
  if (err) await supabase.from('products').update({ job_status: 'failed', job_error: err }).eq('id', productId);
  return err;
}

async function startBatchJob(batchId: string, job: ProductJob, mode?: BatchMode): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data: b } = await supabase.from('product_batches').select('job_status,job_started_at').eq('id', batchId).single();
  if (isRunning(b)) return 'Lô này đang chạy một việc, đợi xong đã.';
  await supabase
    .from('product_batches')
    .update({ job, job_status: 'queued', job_error: null, job_started_at: new Date().toISOString() })
    .eq('id', batchId);
  const err = await dispatch({ kind: 'batch', id: batchId, job, mode });
  if (err) await supabase.from('product_batches').update({ job_status: 'failed', job_error: err }).eq('id', batchId);
  return err;
}

// ───────────── Đọc form ─────────────

function readSpec(type: ProductType, form: FormData) {
  return Object.fromEntries(SPEC_FIELDS[type].map((f) => [f.key, String(form.get(`spec.${f.key}`) ?? '').trim()]));
}

const money = (v: FormDataEntryValue | null) => {
  const digits = String(v ?? '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
};
const sizeList = (v: FormDataEntryValue | null) =>
  String(v ?? '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

function readBasics(form: FormData) {
  return {
    name: String(form.get('name') ?? '').trim(),
    sku: String(form.get('sku') ?? '').trim() || null,
    color: String(form.get('color') ?? '').trim() || null,
    price: money(form.get('price')),
    sale_price: money(form.get('sale_price')),
    sizes: sizeList(form.get('sizes')),
    notes: String(form.get('notes') ?? '').trim() || null,
  };
}

// ───────────── Một sản phẩm ─────────────

export async function createProduct(_prev: string | null, form: FormData): Promise<string | null> {
  const type = String(form.get('type') ?? 'boots') as ProductType;
  if (!SPEC_FIELDS[type]) return 'Loại sản phẩm không hợp lệ.';
  const basics = readBasics(form);
  if (!basics.name) return 'Thiếu tên sản phẩm.';

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('products')
    .insert({ type, ...basics, spec: readSpec(type, form) })
    .select('id')
    .single();
  if (error || !data) return `Lỗi lưu sản phẩm: ${error?.message}`;

  const err = await startProductJob(data.id, 'generate');
  if (err) return err;
  redirect(`/products/${data.id}`);
}

/** Lưu phiếu; nếu bấm "Lưu & viết lại" thì viết lại từ phiếu mới. */
export async function updateSpec(id: string, _prev: string | null, form: FormData): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data: p } = await supabase.from('products').select('type').eq('id', id).single();
  if (!p) return 'Không tìm thấy sản phẩm.';
  const basics = readBasics(form);
  if (!basics.name) return 'Thiếu tên sản phẩm.';
  const { error } = await supabase
    .from('products')
    .update({ ...basics, spec: readSpec(p.type, form), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return `Lỗi: ${error.message}`;
  const err = form.get('regenerate') ? await startProductJob(id, 'generate') : null;
  revalidatePath(`/products/${id}`);
  return err;
}

export async function regenerate(id: string, _prev: string | null, form: FormData): Promise<string | null> {
  const instruction = String(form.get('instruction') ?? '').trim() || undefined;
  const err = await startProductJob(id, 'generate', instruction);
  revalidatePath(`/products/${id}`);
  return err;
}

export async function research(id: string): Promise<string | null> {
  const err = await startProductJob(id, 'research');
  revalidatePath(`/products/${id}`);
  return err;
}

/** Thêm thông tin đã tick vào phiếu: ô trống thì điền, ô đã có thì nối thêm; thông tin khác vào "Ý chính khác". */
function mergeFacts(type: ProductType, spec: Record<string, string>, notes: string | null, research: ResearchResult, picked: number[]) {
  const next = { ...spec };
  const keys = new Set(SPEC_FIELDS[type].map((f) => f.key));
  let n = notes ?? '';
  for (const i of picked) {
    const f = research.facts[i];
    if (!f) continue;
    if (keys.has(f.field)) next[f.field] = next[f.field]?.trim() ? `${next[f.field]}; ${f.value}` : f.value;
    else n = `${n}${n ? '\n' : ''}- ${f.value}`;
  }
  return { spec: next, notes: n || null };
}

export async function applyFacts(id: string, _prev: string | null, form: FormData): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data: p } = await supabase.from('products').select('type,spec,notes,research').eq('id', id).single();
  if (!p?.research) return 'Chưa có kết quả tìm kiếm.';
  const picked = form.getAll('fact').map(Number);
  if (!picked.length) return 'Chưa tick thông tin nào.';
  const merged = mergeFacts(p.type, p.spec, p.notes, p.research as ResearchResult, picked);
  await supabase.from('products').update({ ...merged, updated_at: new Date().toISOString() }).eq('id', id);
  revalidatePath(`/products/${id}`);
  return null;
}

/** Lưu bản người sửa; giữ lịch sử để học văn phong. */
export async function saveOutputEdit(id: string, _prev: string | null, form: FormData): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data: p } = await supabase.from('products').select('output').eq('id', id).single();
  if (!p?.output) return 'Chưa có bản viết.';
  const get = (k: string) => String(form.get(k) ?? '').trim();
  const output: ProductOutput = {
    ...(p.output as ProductOutput),
    seo_title: get('seo_title'),
    meta_description: get('meta_description'),
    focus_keyphrase: get('focus_keyphrase'),
    slug: get('slug'),
    short_description_html: get('short_description_html'),
    description_html: get('description_html'),
    tags: get('tags')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  };
  await supabase.from('products').update({ output, updated_at: new Date().toISOString() }).eq('id', id);
  await supabase.from('product_revisions').insert({ product_id: id, kind: 'edit', output });
  revalidatePath(`/products/${id}`);
  return null;
}

export async function setCategories(id: string, ids: number[]) {
  const supabase = await supabaseServer();
  await supabase.from('products').update({ category_ids: ids, updated_at: new Date().toISOString() }).eq('id', id);
  revalidatePath(`/products/${id}`);
}

/** Tạo sản phẩm ở trạng thái NHÁP trên WooCommerce. Admin tự thêm ảnh, kiểm tra và bấm Đăng trên WordPress. */
export async function pushDraft(id: string): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data: p } = await supabase
    .from('products')
    .select('name,sku,price,sale_price,sizes,spec,output,category_ids,woo_product_id,batch_id')
    .eq('id', id)
    .single();
  if (!p?.output) return 'Chưa có bản viết.';
  if (p.woo_product_id) return 'Sản phẩm này đã được tạo nháp trên web.';
  if (!p.category_ids.length) return 'Chọn ít nhất một danh mục trước.';
  const o = p.output as ProductOutput;
  try {
    const draft = await createDraftProduct({
      name: p.name,
      sku: p.sku,
      price: p.price,
      sale_price: p.sale_price,
      slug: o.slug,
      description_html: o.description_html,
      short_description_html: o.short_description_html,
      category_ids: p.category_ids,
      tags: o.tags,
      sizes: p.sizes,
      soleplate: (p.spec as Record<string, string>).soleplate || undefined,
      seo_title: o.seo_title,
      meta_description: o.meta_description,
      focus_keyphrase: o.focus_keyphrase,
    });
    await supabase
      .from('products')
      .update({ woo_product_id: draft.id, woo_edit_url: draft.edit_url, pushed_at: new Date().toISOString() })
      .eq('id', id);
    revalidatePath(`/products/${id}`);
    if (p.batch_id) revalidatePath(`/products/batch/${p.batch_id}`);
    return draft.brand
      ? null
      : '⚠ Đã tạo nháp nhưng không nhận ra Hãng từ tên sản phẩm — chọn Hãng trên WordPress trước khi Đăng.';
  } catch (err) {
    return (err as Error).message;
  }
}

export async function deleteProduct(id: string) {
  const supabase = await supabaseServer();
  const { data: p } = await supabase.from('products').select('batch_id').eq('id', id).single();
  await supabase.from('products').delete().eq('id', id);
  redirect(p?.batch_id ? `/products/batch/${p.batch_id}` : '/products');
}

// ───────────── Lô nhiều màu ─────────────

async function insertVariants(
  batch: { id: string; type: ProductType; base_name: string; price: number | null; sale_price: number | null; sizes: string[]; spec: unknown; notes: string | null },
  text: string,
): Promise<string | null> {
  const { variants, errors } = parseVariants(text);
  if (errors.length) return errors.join(' · ');
  if (!variants.length) return 'Chưa có màu nào (mỗi dòng: màu | mã | size | giá).';
  const supabase = await supabaseServer();
  const { error } = await supabase.from('products').insert(
    variants.map((v) => ({
      batch_id: batch.id,
      type: batch.type,
      name: variantName(batch.base_name, v),
      sku: v.sku,
      color: v.color,
      price: v.price ?? batch.price,
      sale_price: v.sale_price ?? batch.sale_price,
      sizes: v.sizes ?? batch.sizes,
      spec: batch.spec,
      notes: batch.notes,
    })),
  );
  return error ? `Lỗi lưu màu: ${error.message}` : null;
}

export async function createBatch(_prev: string | null, form: FormData): Promise<string | null> {
  const type = String(form.get('type') ?? 'boots') as ProductType;
  if (!SPEC_FIELDS[type]) return 'Loại sản phẩm không hợp lệ.';
  const base_name = String(form.get('base_name') ?? '').trim();
  if (!base_name) return 'Thiếu tên chung của mẫu.';
  const variantsText = String(form.get('variants') ?? '');
  const { variants, errors } = parseVariants(variantsText);
  if (errors.length) return errors.join(' · ');
  if (!variants.length) return 'Chưa có màu nào (mỗi dòng: màu | mã | size | giá).';
  if (variants.length > 15) return 'Tối đa 15 màu một lô (giới hạn thời gian chạy nền).';

  const supabase = await supabaseServer();
  const batchRow = {
    type,
    base_name,
    price: money(form.get('price')),
    sale_price: money(form.get('sale_price')),
    sizes: sizeList(form.get('sizes')),
    spec: readSpec(type, form),
    notes: String(form.get('notes') ?? '').trim() || null,
  };
  const { data: batch, error } = await supabase.from('product_batches').insert(batchRow).select('id').single();
  if (error || !batch) return `Lỗi lưu lô: ${error?.message}`;
  const vErr = await insertVariants({ id: batch.id, ...batchRow }, variantsText);
  if (vErr) {
    await supabase.from('product_batches').delete().eq('id', batch.id);
    return vErr;
  }
  if (form.get('write')) {
    const err = await startBatchJob(batch.id, 'generate', 'missing');
    if (err) return err;
  }
  redirect(`/products/batch/${batch.id}`);
}

/** Lưu phiếu chung của lô và áp xuống mọi màu chưa đẩy lên web (thông số, ý chính). */
export async function updateBatchSpec(batchId: string, _prev: string | null, form: FormData): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data: b } = await supabase.from('product_batches').select('type').eq('id', batchId).single();
  if (!b) return 'Không tìm thấy lô.';
  const base_name = String(form.get('base_name') ?? '').trim();
  if (!base_name) return 'Thiếu tên chung.';
  const spec = readSpec(b.type, form);
  const notes = String(form.get('notes') ?? '').trim() || null;
  const { error } = await supabase
    .from('product_batches')
    .update({
      base_name,
      price: money(form.get('price')),
      sale_price: money(form.get('sale_price')),
      sizes: sizeList(form.get('sizes')),
      spec,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', batchId);
  if (error) return `Lỗi: ${error.message}`;
  await supabase
    .from('products')
    .update({ spec, notes, updated_at: new Date().toISOString() })
    .eq('batch_id', batchId)
    .is('woo_product_id', null);
  const err = form.get('regenerate') ? await startBatchJob(batchId, 'generate', 'all') : null;
  revalidatePath(`/products/batch/${batchId}`);
  return err;
}

export async function addVariants(batchId: string, _prev: string | null, form: FormData): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data: b } = await supabase.from('product_batches').select('id,type,base_name,price,sale_price,sizes,spec,notes').eq('id', batchId).single();
  if (!b) return 'Không tìm thấy lô.';
  const err = await insertVariants(b, String(form.get('variants') ?? ''));
  revalidatePath(`/products/batch/${batchId}`);
  return err;
}

export async function writeBatch(batchId: string, mode: BatchMode): Promise<string | null> {
  const err = await startBatchJob(batchId, 'generate', mode);
  revalidatePath(`/products/batch/${batchId}`);
  return err;
}

export async function researchBatch(batchId: string): Promise<string | null> {
  const err = await startBatchJob(batchId, 'research');
  revalidatePath(`/products/batch/${batchId}`);
  return err;
}

export async function applyBatchFacts(batchId: string, _prev: string | null, form: FormData): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data: b } = await supabase.from('product_batches').select('type,spec,notes,research').eq('id', batchId).single();
  if (!b?.research) return 'Chưa có kết quả tìm kiếm.';
  const picked = form.getAll('fact').map(Number);
  if (!picked.length) return 'Chưa tick thông tin nào.';
  const merged = mergeFacts(b.type, b.spec, b.notes, b.research as ResearchResult, picked);
  await supabase.from('product_batches').update({ ...merged, updated_at: new Date().toISOString() }).eq('id', batchId);
  await supabase.from('products').update({ ...merged, updated_at: new Date().toISOString() }).eq('batch_id', batchId).is('woo_product_id', null);
  revalidatePath(`/products/batch/${batchId}`);
  return null;
}

/** Áp một bộ danh mục cho mọi màu chưa đẩy lên web. */
export async function setBatchCategories(batchId: string, ids: number[]) {
  const supabase = await supabaseServer();
  await supabase
    .from('products')
    .update({ category_ids: ids, updated_at: new Date().toISOString() })
    .eq('batch_id', batchId)
    .is('woo_product_id', null);
  revalidatePath(`/products/batch/${batchId}`);
}

export async function deleteBatch(batchId: string, withProducts: boolean) {
  const supabase = await supabaseServer();
  if (withProducts) await supabase.from('products').delete().eq('batch_id', batchId);
  await supabase.from('product_batches').delete().eq('id', batchId);
  redirect('/products');
}

// ───────────── Nhập Excel: nhiều sản phẩm khác nhau ─────────────

/** Kiểm tra mã đã có trên web / trong app chưa (trước khi nhập). */
export async function checkImportSkus(
  skus: string[],
): Promise<{ ok: true; onWeb: { sku: string; name: string; status: string }[]; inApp: string[] } | { ok: false; error: string }> {
  const me = await currentUser();
  if (me?.role !== 'admin' && me?.role !== 'staff') return { ok: false, error: 'Tài khoản chưa được cấp quyền.' };
  const list = [...new Set(skus.map((s) => s.trim()).filter(Boolean))].slice(0, IMPORT_MAX_ROWS);
  try {
    const supabase = await supabaseServer();
    const [web, { data: app }] = await Promise.all([findBySkus(list), supabase.from('products').select('sku').in('sku', list)]);
    return {
      ok: true,
      onWeb: web.items.map((p) => ({ sku: p.sku, name: p.name, status: p.status })),
      inApp: (app ?? []).map((p) => p.sku as string),
    };
  } catch (err) {
    return { ok: false, error: `Không kiểm tra được trên web: ${(err as Error).message}` };
  }
}

export async function createImport(type: ProductType, rows: ImportRow[], write: boolean): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!SPEC_FIELDS[type]) return { ok: false, error: 'Loại sản phẩm không hợp lệ.' };
  const valid = rows.filter((r) => r.name.trim() && r.sku.trim() && r.price);
  if (!valid.length) return { ok: false, error: 'Không có dòng hợp lệ nào.' };
  if (valid.length > IMPORT_MAX_ROWS) return { ok: false, error: `Tối đa ${IMPORT_MAX_ROWS} sản phẩm mỗi lần nhập.` };

  const supabase = await supabaseServer();
  const today = new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' });
  const { data: batch, error } = await supabase
    .from('product_batches')
    .insert({ kind: 'import', type, base_name: `Nhập Excel ${today} · ${valid.length} ${PRODUCT_TYPE_LABEL[type].toLowerCase()}`, spec: {} })
    .select('id')
    .single();
  if (error || !batch) return { ok: false, error: `Lỗi lưu: ${error?.message}` };

  const keys = SPEC_FIELDS[type].map((f) => f.key);
  const { error: pErr } = await supabase.from('products').insert(
    valid.map((r) => ({
      batch_id: batch.id,
      type,
      name: r.name.trim(),
      sku: r.sku.trim(),
      price: r.price,
      sale_price: r.sale_price,
      sizes: r.sizes,
      color: r.color,
      spec: Object.fromEntries(keys.map((k) => [k, r.spec[k] ?? ''])),
      notes: r.notes,
    })),
  );
  if (pErr) {
    await supabase.from('product_batches').delete().eq('id', batch.id);
    return { ok: false, error: `Lỗi lưu sản phẩm: ${pErr.message}` };
  }
  if (write) {
    const err = await startBatchJob(batch.id, 'generate', 'missing');
    if (err) return { ok: false, error: err };
  }
  return { ok: true, id: batch.id };
}

// ───────────── Admin: đồng bộ, mẫu chuẩn, văn phong ─────────────

async function adminOnly(): Promise<string | null> {
  const me = await currentUser();
  return me?.role === 'admin' ? null : 'Chỉ admin được làm việc này.';
}

/** Admin: đồng bộ danh mục + sản phẩm mẫu từ website (chỉ đọc website). */
export async function syncWebsite(_prev: string | null): Promise<string | null> {
  const denied = await adminOnly();
  if (denied) return denied;
  try {
    const r = await syncFromWebsite(await supabaseServer());
    revalidatePath('/products');
    return `✓ Đã đồng bộ ${r.categories} danh mục, ${r.examples} sản phẩm mẫu (${r.gold} mẫu chuẩn).`;
  } catch (err) {
    return `Lỗi: ${(err as Error).message}`;
  }
}

export async function toggleGold(wooId: number, gold: boolean) {
  if (await adminOnly()) return;
  const supabase = await supabaseServer();
  await supabase.from('product_examples').update({ is_gold: gold }).eq('woo_id', wooId);
  revalidatePath('/products/style');
}

export async function addGoldByUrl(_prev: string | null, form: FormData): Promise<string | null> {
  const denied = await adminOnly();
  if (denied) return denied;
  try {
    const name = await addGoldExampleByUrl(await supabaseServer(), String(form.get('url') ?? ''));
    revalidatePath('/products/style');
    return `✓ Đã thêm mẫu chuẩn: ${name}`;
  } catch (err) {
    return `Lỗi: ${(err as Error).message}`;
  }
}

export async function saveStyleNotes(_prev: string | null, form: FormData): Promise<string | null> {
  const denied = await adminOnly();
  if (denied) return denied;
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from('product_style')
    .update({ notes: String(form.get('notes') ?? '').trim(), updated_at: new Date().toISOString() })
    .eq('id', 1);
  revalidatePath('/products/style');
  return error ? `Lỗi: ${error.message}` : '✓ Đã lưu.';
}

export async function refreshStyleNow(): Promise<string | null> {
  const denied = await adminOnly();
  if (denied) return denied;
  const err = await dispatch({ kind: 'style' });
  revalidatePath('/products/style');
  return err ?? '✓ Đang rút luật từ các bản sửa (khoảng 30–60 giây) — tải lại trang để xem.';
}
