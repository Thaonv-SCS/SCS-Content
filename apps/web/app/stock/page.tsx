import { requireTeam } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';
import { StockManager, type RunSummary } from './manager';

export default async function StockPage() {
  const me = await requireTeam();
  const supabase = await supabaseServer();
  const [{ data: changes }, { data: people }] = await Promise.all([
    supabase
      .from('stock_changes')
      .select('run_id,kind,created_by,created_at,old_stock,new_stock,old_visibility,new_visibility,old_regular,new_regular,old_sale,new_sale,undo_of,undone_at')
      .order('created_at', { ascending: false })
      .limit(5000),
    supabase.from('profiles').select('user_id,display_name'),
  ]);
  const names = new Map((people ?? []).map((p) => [p.user_id as string, (p.display_name as string | null) ?? '']));

  // Gom theo lần cập nhật
  const runs = new Map<string, RunSummary>();
  for (const c of changes ?? []) {
    let r = runs.get(c.run_id);
    if (!r) {
      r = {
        run_id: c.run_id,
        kind: c.kind,
        at: c.created_at,
        who: c.created_by === me.id ? 'mày' : (names.get(c.created_by) || 'tài khoản khác'),
        count: 0,
        toOut: 0,
        toIn: 0,
        visibility: {},
        saleOn: 0,
        saleOff: 0,
        regularChanged: 0,
        undoOf: c.undo_of,
        undone: !!c.undone_at,
      };
      runs.set(c.run_id, r);
    }
    r.count++;
    if (c.kind === 'stock') {
      if (c.new_stock !== c.old_stock) c.new_stock === 'outofstock' ? r.toOut++ : r.toIn++;
      if (c.new_visibility !== c.old_visibility) r.visibility[c.new_visibility] = (r.visibility[c.new_visibility] ?? 0) + 1;
    } else if (c.kind === 'price') {
      if (Number(c.new_regular) !== Number(c.old_regular)) r.regularChanged++;
      if (c.new_sale && Number(c.new_sale) !== Number(c.old_sale)) r.saleOn++;
      if (!c.new_sale && c.old_sale) r.saleOff++;
    }
  }

  return (
    <>
      <h1>Cập nhật sản phẩm</h1>
      <p className="muted">
        Sửa hàng loạt trên web: <strong>tình trạng hàng & hiển thị</strong>, <strong>giá</strong>, <strong>size</strong> — theo danh sách mã, hoặc chọn trong
        danh sách. Không chạm nội dung hay ảnh. Mỗi lần đổi đều xem trước, lưu lịch sử và hoàn tác được.
      </p>
      <StockManager history={[...runs.values()].slice(0, 25)} />
    </>
  );
}
