import { notFound } from 'next/navigation';
import { PRODUCT_TYPE_LABEL, SPEC_FIELDS, type ProductType } from '@app/products';
import { requireTeam } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';
import { loadCategoryOptions } from '@/lib/categories';
import { BatchWorkspace, type BatchView, type VariantRow } from './workspace';

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  await requireTeam();
  const { id } = await params;
  const supabase = await supabaseServer();
  const [{ data: b }, { data: rows }, categories] = await Promise.all([
    supabase
      .from('product_batches')
      .select('id,kind,type,base_name,price,sale_price,sizes,spec,notes,research,job,job_status,job_error')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('products')
      .select('id,name,sku,color,price,sale_price,sizes,category_ids,job_status,job_error,output,woo_edit_url')
      .eq('batch_id', id)
      .order('created_at'),
    loadCategoryOptions(supabase),
  ]);
  if (!b) notFound();

  const variants: VariantRow[] = (rows ?? []).map((r) => ({
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
      batch={b as BatchView}
      variants={variants}
      fields={SPEC_FIELDS[b.type as ProductType]}
      typeLabel={PRODUCT_TYPE_LABEL[b.type as ProductType]}
      categories={categories}
    />
  );
}
