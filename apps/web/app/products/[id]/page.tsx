import { notFound } from 'next/navigation';
import { PRODUCT_TYPE_LABEL, SPEC_FIELDS, type ProductOutput, type ProductType, type ResearchResult } from '@app/products';
import { requireTeam } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';
import { Workspace, type CategoryOption, type ProductView } from './workspace';

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requireTeam();
  const { id } = await params;
  const supabase = await supabaseServer();
  const [{ data: p }, { data: cats }] = await Promise.all([
    supabase
      .from('products')
      .select('id,type,name,sku,price,sizes,spec,notes,research,output,category_ids,job,job_status,job_error,woo_edit_url,pushed_at')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('woo_categories').select('id,name,parent'),
  ]);
  if (!p) notFound();

  // Đường dẫn đầy đủ của danh mục để chọn dễ: "Giày Bóng Đá > Giày Cỏ Nhân Tạo"
  const byId = new Map((cats ?? []).map((c) => [c.id as number, c as { id: number; name: string; parent: number }]));
  const path = (c: { id: number; name: string; parent: number }) => {
    const names = [c.name];
    for (let x = byId.get(c.parent); x && names.length < 6; x = byId.get(x.parent)) names.unshift(x.name);
    return names.join(' > ');
  };
  const categories: CategoryOption[] = [...byId.values()].map((c) => ({ id: c.id, path: path(c) })).sort((a, b) => a.path.localeCompare(b.path, 'vi'));

  const product = p as unknown as ProductView & { output: ProductOutput | null; research: ResearchResult | null };
  return (
    <Workspace
      product={product}
      fields={SPEC_FIELDS[product.type as ProductType]}
      typeLabel={PRODUCT_TYPE_LABEL[product.type as ProductType]}
      categories={categories}
    />
  );
}
