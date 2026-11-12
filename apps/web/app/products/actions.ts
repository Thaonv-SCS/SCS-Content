'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  createDraftProduct,
  runProductJob,
  SPEC_FIELDS,
  syncFromWebsite,
  userClient,
  type ProductJob,
  type ProductOutput,
  type ProductType,
  type ResearchResult,
} from '@app/products';
import { supabaseServer } from '@/lib/supabase';
import { currentUser } from '@/lib/auth';

/**
 * Giao việc viết / tìm thêm cho hàm chạy nền (mất 30–60 giây, quá giới hạn một yêu cầu thường).
 * - Trên Netlify: gọi Background Function (trả về ngay, chạy tối đa 15 phút).
 * - Trên máy: chạy luôn trong tiến trình dev, không chờ.
 * Hàm nền dùng access token của chính người bấm → quyền như trên web, không cần service key.
 */
async function startJob(productId: string, job: ProductJob, instruction?: string): Promise<string | null> {
  const supabase = await supabaseServer();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return 'Phiên đăng nhập hết hạn, đăng nhập lại.';

  const { data: p } = await supabase.from('products').select('job_status,job_started_at').eq('id', productId).single();
  const running = p && ['queued', 'running'].includes(p.job_status) && Date.now() - new Date(p.job_started_at).getTime() < 10 * 60_000;
  if (running) return 'Đang có một việc chạy cho sản phẩm này, đợi xong đã.';

  await supabase
    .from('products')
    .update({ job, job_status: 'queued', job_error: null, job_started_at: new Date().toISOString() })
    .eq('id', productId);

  if (process.env.NETLIFY) {
    const h = await headers();
    const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
    const res = await fetch(`${origin}/.netlify/functions/product-job-background`, {
      method: 'POST',
      body: JSON.stringify({ productId, job, instruction, token: session.access_token }),
    });
    if (!res.ok && res.status !== 202) {
      await supabase.from('products').update({ job_status: 'failed', job_error: `Không khởi động được việc chạy nền (HTTP ${res.status})` }).eq('id', productId);
      return `Không khởi động được việc chạy nền (HTTP ${res.status}).`;
    }
  } else {
    void runProductJob(userClient(session.access_token), productId, job, instruction);
  }
  return null;
}

function readSpec(type: ProductType, form: FormData) {
  return Object.fromEntries(SPEC_FIELDS[type].map((f) => [f.key, String(form.get(`spec.${f.key}`) ?? '').trim()]));
}

function readBasics(form: FormData) {
  const priceText = String(form.get('price') ?? '').replace(/[^\d]/g, '');
  return {
    name: String(form.get('name') ?? '').trim(),
    sku: String(form.get('sku') ?? '').trim() || null,
    price: priceText ? Number(priceText) : null,
    sizes: String(form.get('sizes') ?? '')
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
    notes: String(form.get('notes') ?? '').trim() || null,
  };
}

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

  const err = await startJob(data.id, 'generate');
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
  const err = form.get('regenerate') ? await startJob(id, 'generate') : null;
  revalidatePath(`/products/${id}`);
  return err;
}

export async function regenerate(id: string, _prev: string | null, form: FormData): Promise<string | null> {
  const instruction = String(form.get('instruction') ?? '').trim() || undefined;
  const err = await startJob(id, 'generate', instruction);
  revalidatePath(`/products/${id}`);
  return err;
}

export async function research(id: string): Promise<string | null> {
  const err = await startJob(id, 'research');
  revalidatePath(`/products/${id}`);
  return err;
}

/** Đưa các thông tin tìm được (đã tick) vào phiếu: điền ô trống, ô đã có thì nối thêm. */
export async function applyFacts(id: string, _prev: string | null, form: FormData): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data: p } = await supabase.from('products').select('type,spec,notes,research').eq('id', id).single();
  if (!p?.research) return 'Chưa có kết quả tìm kiếm.';
  const facts = (p.research as ResearchResult).facts;
  const picked = form.getAll('fact').map(Number).filter((i) => facts[i]);
  if (!picked.length) return 'Chưa tick thông tin nào.';

  const spec = { ...(p.spec as Record<string, string>) };
  const keys = new Set(SPEC_FIELDS[p.type as ProductType].map((f) => f.key));
  let notes = (p.notes as string | null) ?? '';
  for (const i of picked) {
    const f = facts[i]!;
    if (keys.has(f.field)) spec[f.field] = spec[f.field]?.trim() ? `${spec[f.field]}; ${f.value}` : f.value;
    else notes = `${notes}${notes ? '\n' : ''}- ${f.value}`;
  }
  await supabase.from('products').update({ spec, notes: notes || null, updated_at: new Date().toISOString() }).eq('id', id);
  revalidatePath(`/products/${id}`);
  return null;
}

/** Lưu bản người sửa; giữ lịch sử để sau này học văn phong. */
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
    .select('name,sku,price,sizes,spec,output,category_ids,woo_product_id')
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
    return draft.brand
      ? null
      : '⚠ Đã tạo nháp nhưng không nhận ra Hãng từ tên sản phẩm — chọn Hãng trên WordPress trước khi Đăng.';
  } catch (err) {
    return (err as Error).message;
  }
}

export async function deleteProduct(id: string) {
  const supabase = await supabaseServer();
  await supabase.from('products').delete().eq('id', id);
  redirect('/products');
}

/** Admin: đồng bộ danh mục + sản phẩm mẫu từ website (chỉ đọc website). */
export async function syncWebsite(_prev: string | null): Promise<string | null> {
  const me = await currentUser();
  if (me?.role !== 'admin') return 'Chỉ admin được đồng bộ.';
  try {
    const r = await syncFromWebsite(await supabaseServer());
    revalidatePath('/products');
    return `✓ Đã đồng bộ ${r.categories} danh mục, ${r.examples} sản phẩm mẫu.`;
  } catch (err) {
    return `Lỗi: ${(err as Error).message}`;
  }
}
