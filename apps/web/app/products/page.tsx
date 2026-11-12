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
  batch_id: string | null;
  product_batches: { base_name: string } | null;
};

/** Đầu tháng theo giờ Việt Nam (UTC+7), dạng ISO. */
function monthStartVN(): string {
  const vn = new Date(Date.now() + 7 * 3600_000);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), 1) - 7 * 3600_000).toISOString();
}

async function costByPerson(supabase: Awaited<ReturnType<typeof supabaseServer>>) {
  const [{ data: calls }, { data: people }] = await Promise.all([
    supabase.from('llm_calls').select('created_by,cost_usd').like('purpose', 'product%').gte('created_at', monthStartVN()).limit(5000),
    supabase.from('profiles').select('user_id,display_name,role'),
  ]);
  const names = new Map((people ?? []).map((p) => [p.user_id as string, `${p.display_name ?? p.user_id} (${p.role === 'admin' ? 'admin' : 'nhân viên'})`]));
  const sums = new Map<string, number>();
  for (const c of calls ?? []) {
    const who = c.created_by ? (names.get(c.created_by) ?? 'tài khoản đã xóa') : 'chạy bằng script';
    sums.set(who, (sums.get(who) ?? 0) + Number(c.cost_usd));
  }
  return [...sums.entries()].sort((a, b) => b[1] - a[1]);
}

export default async function ProductsPage() {
  const me = await requireTeam();
  const supabase = await supabaseServer();
  const isAdmin = me.role === 'admin';
  const [{ data }, { count: catCount }, { count: exCount }, costs] = await Promise.all([
    supabase
      .from('products')
      .select('id,type,name,sku,job_status,output,woo_edit_url,updated_at,batch_id,product_batches(base_name)')
      .order('created_at', { ascending: false })
      .limit(150),
    supabase.from('woo_categories').select('*', { count: 'exact', head: true }),
    supabase.from('product_examples').select('*', { count: 'exact', head: true }),
    isAdmin ? costByPerson(supabase) : Promise.resolve([] as [string, number][]),
  ]);
  const rows = (data ?? []) as unknown as Row[];

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
        <span className="spacer" />
        <Link href="/products/import" className="button ghost-button">⬆ Nhập từ Excel</Link>
        <Link href="/products/batch/new" className="button ghost-button">＋ Nhập nhiều màu</Link>
        <Link href="/products/new" className="button">＋ Sản phẩm mới</Link>
      </div>
      <p className="muted">
        Nhập phiếu thông số → AI viết mô tả chuẩn SEO theo văn phong web → kiểm tra, chỉnh → tạo bản nháp trên WooCommerce.
      </p>

      {isAdmin && (
        <div className="card settings wide">
          <div className="meta">
            Dữ liệu từ website: {catCount ?? 0} danh mục · {exCount ?? 0} sản phẩm mẫu. Đồng bộ lại khi web có danh mục mới hoặc muốn cập nhật mẫu văn
            phong. · <Link href="/products/style">Mẫu chuẩn & ghi chú văn phong →</Link>
          </div>
          <SyncWebsiteButton />
          <div className="meta">
            Chi phí AI viết sản phẩm tháng này:{' '}
            {costs.length
              ? costs.map(([who, usd]) => `${who}: $${usd.toFixed(2)}`).join(' · ')
              : 'chưa có'}
          </div>
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
                  <div className="meta">
                    {r.sku}
                    {r.batch_id && (
                      <>
                        {r.sku && ' · '}
                        lô <Link href={`/products/batch/${r.batch_id}`}>{r.product_batches?.base_name ?? 'nhiều màu'}</Link>
                      </>
                    )}
                  </div>
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
