import { requireTeam } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';
import { StockManager, type RunSummary } from './manager';

export default async function StockPage() {
  const me = await requireTeam();
  const supabase = await supabaseServer();
  const [{ data: changes }, { data: people }] = await Promise.all([
    supabase
      .from('stock_changes')
      .select('run_id,created_by,created_at,old_stock,new_stock,old_visibility,new_visibility,undo_of,undone_at')
      .order('created_at', { ascending: false })
      .limit(3000),
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
        at: c.created_at,
        who: c.created_by === me.id ? 'mày' : (names.get(c.created_by) || 'tài khoản khác'),
        count: 0,
        toOut: 0,
        toIn: 0,
        visibility: {},
        undoOf: c.undo_of,
        undone: !!c.undone_at,
      };
      runs.set(c.run_id, r);
    }
    r.count++;
    if (c.new_stock !== c.old_stock) c.new_stock === 'outofstock' ? r.toOut++ : r.toIn++;
    if (c.new_visibility !== c.old_visibility) r.visibility[c.new_visibility] = (r.visibility[c.new_visibility] ?? 0) + 1;
  }

  return (
    <>
      <h1>Tình trạng hàng</h1>
      <p className="muted">
        Đổi <strong>Còn hàng / Hết hàng</strong> và <strong>chế độ hiển thị</strong> của sản phẩm trên web — theo danh sách mã, hoặc chọn trong danh sách.
        Chỉ đổi 2 ô này, không chạm giá hay nội dung. Mỗi lần đổi đều lưu lịch sử và hoàn tác được.
      </p>
      <StockManager history={[...runs.values()].slice(0, 20)} />
    </>
  );
}
