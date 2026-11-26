import { notFound } from 'next/navigation';
import { PRODUCT_TYPE_LABEL, SPEC_FIELDS, type ProductType } from '@app/products';
import { requireTeam } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';
import { loadCategoryOptions } from '@/lib/categories';
import { goTreo } from '@/lib/treo';
import { BatchWorkspace, type BatchView, type VariantRow } from './workspace';

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  await requireTeam();
  const { id } = await params;
  const supabase = await supabaseServer();
  const [{ data: b }, { data: rows }, categories] = await Promise.all([
    supabase
      .from('product_batches')
      .select('id,kind,type,base_name,price,sale_price,sizes,spec,notes,research,job,job_status,job_error,job_started_at')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('products')
      .select('id,name,sku,color,price,sale_price,sizes,category_ids,job_status,job_error,job_started_at,output,woo_edit_url')
      .eq('batch_id', id)
      .order('created_at'),
    loadCategoryOptions(supabase),
  ]);
  if (!b) notFound();
  const lo = goTreo(b, b.job_started_at);
  const loDangChay = ['queued', 'running'].includes(lo.job_status);

  // màu đang chờ trong lô: lô còn chạy thì tính theo giờ bắt đầu của lô; lô đã dừng / treo mà màu vẫn "đang" → treo
  const variants: VariantRow[] = (rows ?? []).map((r0) => goTreo(r0, loDangChay ? (r0.job_started_at ?? b.job_started_at) : r0.job_started_at)).map((r) => ({
    id: r.id,
    name: r.name,
    sku: r.sku,
    price: r.price,
    sale_price: r.sale_price,
    sizes: r.sizes,
    category_ids: r.category_ids,
    suggested: (r.output as { suggested_category_ids?: number[] } | null)?.suggested_category_ids ?? [],
    job_status: r.job_status,
    job_error: r.job_error,
    written: !!r.output,
    woo_edit_url: r.woo_edit_url,
  }));

  return (
    <BatchWorkspace
      batch={lo as BatchView}
      variants={variants}
      fields={SPEC_FIELDS[b.type as ProductType]}
      typeLabel={PRODUCT_TYPE_LABEL[b.type as ProductType]}
      categories={categories}
    />
  );
}
