import { notFound } from 'next/navigation';
import { PRODUCT_TYPE_LABEL, SPEC_FIELDS, type ProductOutput, type ProductType, type ResearchResult } from '@app/products';
import { requireQuyen } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';
import { loadCategoryOptions } from '@/lib/categories';
import { goTreo } from '@/lib/treo';
import { Workspace, type ProductView } from './workspace';

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requireQuyen('san-pham');
  const { id } = await params;
  const supabase = await supabaseServer();
  const [{ data: p }, categories, { data: vd }] = await Promise.all([
    supabase
      .from('products')
      .select(
        'id,type,name,sku,price,sale_price,color,batch_id,sizes,spec,notes,research,output,category_ids,job,job_status,job_error,job_started_at,woo_edit_url,pushed_at,product_batches(base_name)',
      )
      .eq('id', id)
      .maybeSingle(),
    loadCategoryOptions(supabase),
    // đọc riêng để trang vẫn mở được khi chưa chạy migration 0024
    supabase.from('products').select('video_links').eq('id', id).maybeSingle(),
  ]);
  if (!p) notFound();

  const batch = (p as unknown as { product_batches?: { base_name: string } | null }).product_batches;
  const product = { ...goTreo(p, p.job_started_at), video_links: (vd?.video_links as string[] | null) ?? [], batch_name: batch?.base_name ?? null } as unknown as ProductView & {
    output: ProductOutput | null;
    research: ResearchResult | null;
  };
  return (
    <Workspace
      product={product}
      fields={SPEC_FIELDS[product.type as ProductType]}
      typeLabel={PRODUCT_TYPE_LABEL[product.type as ProductType]}
      categories={categories}
    />
  );
}
