import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { generateProduct, researchProduct, type ProductRow } from './ai.ts';

export type ProductJob = 'generate' | 'research';

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

/** Chạy một việc (viết / tìm thêm) cho một sản phẩm, ghi trạng thái để giao diện theo dõi. */
export async function runProductJob(db: SupabaseClient, productId: string, job: ProductJob, instruction?: string) {
  const setStatus = (patch: Record<string, unknown>) =>
    db.from('products').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', productId);

  await setStatus({ job, job_status: 'running', job_error: null, job_started_at: new Date().toISOString() });
  try {
    const { data, error } = await db
      .from('products')
      .select('id,type,name,sku,price,sizes,spec,notes,output,category_ids')
      .eq('id', productId)
      .single();
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
  }
}
