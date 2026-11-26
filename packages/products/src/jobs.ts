import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { generateProduct, researchProduct, type ProductRow } from './ai.ts';
import { refreshProductStyle } from './style.ts';

export type ProductJob = 'generate' | 'research';
/** Viết cả lô: chỉ những cái chưa có bài, viết lại tất cả cái chưa đẩy lên web, hoặc viết tiếp những cái đang chờ (lượt sau của hàm nền). */
export type BatchMode = 'missing' | 'all' | 'continue';

/** Yêu cầu gửi cho hàm chạy nền. */
export type JobRequest =
  | { kind: 'product'; id: string; job: ProductJob; instruction?: string }
  | { kind: 'batch'; id: string; job: ProductJob; mode?: BatchMode }
  | { kind: 'style' };

/**
 * Client Supabase mang quyền của chính người bấm (RLS áp dụng như trên web) — không cần service key.
 * Dùng cho việc chạy nền: hàm nền nhận access token của người dùng.
 */
export function userClient(accessToken: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('Thiếu NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Trả về true nếu việc còn dang dở do hết thời gian (hàm nền cần gọi lượt tiếp). */
export async function runJob(db: SupabaseClient, req: JobRequest): Promise<boolean> {
  if (req.kind === 'product') await runProductJob(db, req.id, req.job, req.instruction);
  else if (req.kind === 'batch') return runBatchJob(db, req.id, req.job, req.mode ?? 'missing');
  else await refreshProductStyle(db, true).catch(() => {}); // lỗi đã ghi vào product_style.job_error
  return false;
}

/** Hàm nền Netlify chạy tối đa 15 phút: dừng sớm để còn thời gian lưu và gọi lượt tiếp. */
const BATCH_TIME_BUDGET_MS = 12 * 60_000;

const PRODUCT_COLS = 'id,type,name,sku,price,sizes,spec,notes,output,category_ids,color,batch_id';

/** Chạy một việc (viết / tìm thêm) cho một sản phẩm, ghi trạng thái để giao diện theo dõi. */
export async function runProductJob(db: SupabaseClient, productId: string, job: ProductJob, instruction?: string, learn = true) {
  const setStatus = (patch: Record<string, unknown>) =>
    db.from('products').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', productId);

  await setStatus({ job, job_status: 'running', job_error: null, job_started_at: new Date().toISOString() });
  try {
    const { data, error } = await db.from('products').select(PRODUCT_COLS).eq('id', productId).single();
    if (error || !data) throw new Error(error?.message ?? 'Không tìm thấy sản phẩm');
    const product = data as ProductRow;

    if (job === 'generate') {
      const output = await generateProduct(db, product, instruction);
      await db.from('product_revisions').insert({ product_id: productId, kind: 'ai', output, instruction: instruction ?? null });
      await setStatus({
        output,
        // Lần viết đầu: lấy danh mục AI gợi ý làm mặc định, người dùng chỉnh lại được
        ...(product.category_ids.length ? {} : { category_ids: output.suggested_category_ids }),
        job_status: 'done',
      });
    } else {
      const research = await researchProduct(db, product);
      await setStatus({ research, job_status: 'done' });
    }
  } catch (err) {
    await setStatus({ job_status: 'failed', job_error: (err as Error).message.slice(0, 500) });
    return;
  }
  // Đủ bản sửa mới thì tự rút lại luật văn phong (sau khi việc chính đã xong, không bắt người dùng chờ)
  if (learn) await refreshProductStyle(db).catch(() => {});
}

/** Việc cho cả lô: viết lần lượt từng màu (màu sau đọc bài màu trước để không lặp), hoặc tìm thêm 1 lần cho cả lô. */
export async function runBatchJob(db: SupabaseClient, batchId: string, job: ProductJob, mode: BatchMode = 'missing'): Promise<boolean> {
  const deadline = process.env.NETLIFY ? Date.now() + BATCH_TIME_BUDGET_MS : Infinity;
  const setBatch = (patch: Record<string, unknown>) =>
    db.from('product_batches').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', batchId);

  await setBatch({ job, job_status: 'running', job_error: null, job_started_at: new Date().toISOString() });
  try {
    const { data: batch, error } = await db.from('product_batches').select('*').eq('id', batchId).single();
    if (error || !batch) throw new Error(error?.message ?? 'Không tìm thấy lô');

    const { data: rows } = await db
      .from('products')
      .select('id,sku,output,woo_product_id,job_status')
      .eq('batch_id', batchId)
      .order('created_at');
    const products = (rows ?? []) as { id: string; sku: string | null; output: unknown; woo_product_id: number | null; job_status: string }[];

    if (job === 'research') {
      const research = await researchProduct(db, {
        id: batchId,
        type: batch.type,
        name: batch.base_name,
        sku: products.find((p) => p.sku)?.sku ?? null,
        price: batch.price,
        sizes: batch.sizes,
        spec: batch.spec,
        notes: batch.notes,
        output: null,
        category_ids: [],
      }, { batch_id: batchId });
      await setBatch({ research, job_status: 'done' });
      return false;
    }

    const todo = products.filter(
      (p) => !p.woo_product_id && (mode === 'all' || (mode === 'continue' ? p.job_status === 'queued' : !p.output)),
    );
    // Đánh dấu chờ để giao diện hiện ngay
    if (todo.length && mode !== 'continue') {
      await db.from('products').update({ job: 'generate', job_status: 'queued', job_error: null, job_started_at: new Date().toISOString() }).in('id', todo.map((p) => p.id));
    }
    let failed = 0;
    for (const p of todo) {
      if (Date.now() > deadline) {
        // Sắp hết 15 phút: phần còn lại để lượt sau (hàm nền tự gọi tiếp, chế độ "missing")
        await setBatch({ job_status: 'running' });
        return true;
      }
      await runProductJob(db, p.id, 'generate', undefined, false);
      const { data: s } = await db.from('products').select('job_status,job_error').eq('id', p.id).single();
      if (s?.job_status === 'failed') {
        failed++;
        if (/trần chi phí/.test(s.job_error ?? '')) {
          // Chạm trần ngân sách: dừng cả lô, các màu còn lại về trạng thái chưa viết
          await db.from('products').update({ job_status: 'idle' }).in('id', todo.map((x) => x.id)).eq('job_status', 'queued');
          throw new Error(s.job_error!);
        }
      }
    }
    await setBatch({ job_status: failed ? 'failed' : 'done', job_error: failed ? `${failed}/${todo.length} sản phẩm viết lỗi — mở từng cái để xem.` : null });
    await refreshProductStyle(db).catch(() => {});
  } catch (err) {
    await setBatch({ job_status: 'failed', job_error: (err as Error).message.slice(0, 500) });
  }
  return false;
}
