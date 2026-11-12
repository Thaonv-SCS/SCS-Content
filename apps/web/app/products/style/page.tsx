import Link from 'next/link';
import { STYLE_EVERY } from '@app/products';
import { requireAdmin } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';
import { formatDateTime } from '@/lib/format';
import { AddGoldForm, GoldToggle, StyleEditor } from './forms';

type Example = { woo_id: number; name: string; link: string; is_gold: boolean; modified_at: string | null };

export default async function ProductStylePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const { q = '' } = await searchParams;
  const supabase = await supabaseServer();
  const query = q.trim();
  const [{ data: style }, { count: edits }, { data: gold }, { data: found }] = await Promise.all([
    supabase.from('product_style').select('notes,edits_used,job_status,job_error,updated_at').eq('id', 1).maybeSingle(),
    supabase.from('product_revisions').select('*', { count: 'exact', head: true }).eq('kind', 'edit'),
    supabase.from('product_examples').select('woo_id,name,link,is_gold,modified_at').eq('is_gold', true).order('name'),
    query
      ? supabase.from('product_examples').select('woo_id,name,link,is_gold,modified_at').ilike('name', `%${query.replace(/[%_]/g, '')}%`).order('modified_at', { ascending: false }).limit(30)
      : Promise.resolve({ data: [] as Example[] }),
  ]);

  const editCount = edits ?? 0;
  const pending = editCount - (style?.edits_used ?? 0);

  return (
    <>
      <p className="meta">
        <Link href="/products">← Post sản phẩm</Link>
      </p>
      <h1>Mẫu chuẩn & văn phong</h1>
      <p className="muted">Hai thứ AI dựa vào để viết đúng giọng shop: các bài mẫu chuẩn, và các luật rút ra từ những lần admin sửa tay.</p>

      <h2>Ghi chú văn phong</h2>
      {!style ? (
        <div className="card warn">Chưa có bảng product_style — chạy migration 0007 trong Supabase.</div>
      ) : (
        <div className="card settings wide">
          <div className="meta">
            Đã có {editCount} bản sửa tay · lần rút luật gần nhất dùng {style.edits_used} bản ({formatDateTime(style.updated_at)}). Tự rút lại mỗi khi có
            thêm {STYLE_EVERY} bản sửa{pending > 0 ? ` — còn ${Math.max(0, STYLE_EVERY - pending)} bản nữa` : ''}.
            {style.job_status === 'running' && ' · ⏳ Đang rút luật…'}
            {style.job_status === 'failed' && <span className="warn"> · ✗ Lần trước lỗi: {style.job_error}</span>}
          </div>
          <StyleEditor notes={style.notes} canRefresh={editCount > 0} />
        </div>
      )}

      <h2>Mẫu chuẩn ({gold?.length ?? 0})</h2>
      <div className="card settings wide">
        <div className="meta">
          Mẫu chuẩn luôn được ưu tiên khi AI chọn bài mẫu để học bố cục và giọng văn. Bài trong app đã đẩy lên web cũng được ưu tiên tự động.
        </div>
        <ul className="preview">
          {(gold ?? []).map((e) => (
            <li key={e.woo_id}>
              <a href={e.link} target="_blank" rel="noreferrer">{e.name}</a> <GoldToggle wooId={e.woo_id} gold />
            </li>
          ))}
          {!gold?.length && <li className="muted">Chưa có — bấm "Đồng bộ dữ liệu website" ở trang Post sản phẩm, hoặc thêm bằng link bên dưới.</li>}
        </ul>
        <AddGoldForm />
        <form className="inline" method="get">
          <input name="q" defaultValue={query} placeholder="Tìm trong kho mẫu đã đồng bộ, vd Mercurial" />
          <button type="submit" className="ghost">Tìm</button>
        </form>
        {query && (
          <ul className="preview">
            {((found ?? []) as Example[]).map((e) => (
              <li key={e.woo_id}>
                <a href={e.link} target="_blank" rel="noreferrer">{e.name}</a> <GoldToggle wooId={e.woo_id} gold={e.is_gold} />
              </li>
            ))}
            {!found?.length && <li className="muted">Không có mẫu nào khớp "{query}".</li>}
          </ul>
        )}
      </div>
    </>
  );
}
