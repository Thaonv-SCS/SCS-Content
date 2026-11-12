import Link from 'next/link';
import { PRODUCT_TYPE_LABEL, type ProductType } from '@app/products';
import { requireTeam } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';
import { formatDateTime } from '@/lib/format';
import { SyncWebsiteButton } from './sync-button';

type Row = {
  id: string;
  type: ProductType;
  name: string;
  sku: string | null;
  job_status: string;
  output: unknown;
  woo_edit_url: string | null;
  updated_at: string;
};

export default async function ProductsPage() {
  const me = await requireTeam();
  const supabase = await supabaseServer();
  const [{ data }, { count: catCount }, { count: exCount }] = await Promise.all([
    supabase.from('products').select('id,type,name,sku,job_status,output,woo_edit_url,updated_at').order('created_at', { ascending: false }).limit(100),
    supabase.from('woo_categories').select('*', { count: 'exact', head: true }),
    supabase.from('product_examples').select('*', { count: 'exact', head: true }),
  ]);
  const rows = (data ?? []) as Row[];

  const status = (r: Row) =>
    r.woo_edit_url ? (
      <a href={r.woo_edit_url} target="_blank" rel="noreferrer">✓ Đã tạo nháp</a>
    ) : ['queued', 'running'].includes(r.job_status) ? (
      '⏳ Đang xử lý'
    ) : r.job_status === 'failed' ? (
      <span className="warn">✗ Lỗi</span>
    ) : r.output ? (
      'Đã viết'
    ) : (
      'Chưa viết'
    );

  return (
    <>
      <div className="inline title-row">
        <h1>Post sản phẩm</h1>
        <Link href="/products/new" className="button">＋ Sản phẩm mới</Link>
      </div>
      <p className="muted">
        Nhập phiếu thông số → AI viết mô tả chuẩn SEO theo văn phong web → kiểm tra, chỉnh → tạo bản nháp trên WooCommerce.
      </p>

      {me.role === 'admin' && (
        <div className="card settings wide">
          <div className="meta">
            Dữ liệu từ website: {catCount ?? 0} danh mục · {exCount ?? 0} sản phẩm mẫu. Đồng bộ lại khi web có danh mục mới hoặc muốn cập nhật mẫu văn
            phong.
          </div>
          <SyncWebsiteButton />
        </div>
      )}

      <div className="card scroll">
        <table>
          <thead>
            <tr>
              <th>Sản phẩm</th>
              <th>Loại</th>
              <th>Trạng thái</th>
              <th>Cập nhật</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/products/${r.id}`}>{r.name}</Link>
                  {r.sku && <div className="meta">{r.sku}</div>}
                </td>
                <td>{PRODUCT_TYPE_LABEL[r.type]}</td>
                <td>{status(r)}</td>
                <td>{formatDateTime(r.updated_at)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={4} className="muted">Chưa có sản phẩm nào.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
