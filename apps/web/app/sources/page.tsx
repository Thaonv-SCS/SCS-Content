import { CATEGORY_LABEL, type CategoryHint, type SourceKind } from '@app/core';
import { supabaseServer } from '@/lib/supabase';
import { timeAgo } from '@/lib/format';
import { setEnabled, setWeight } from './actions';

const HINT_LABEL: Record<CategoryHint, string> = { ...CATEGORY_LABEL, match: 'Trận đấu', mixed: 'Tổng hợp' };

type SourceRow = {
  id: string;
  name: string;
  kind: SourceKind;
  url: string;
  category_hint: CategoryHint;
  weight: number;
  enabled: boolean;
  note: string | null;
  last_success_at: string | null;
  last_error: string | null;
  fail_count: number;
};

export default async function SourcesPage() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('sources')
    .select('id,name,kind,url,category_hint,weight,enabled,note,last_success_at,last_error,fail_count')
    .order('enabled', { ascending: false })
    .order('name');
  if (error) return <p className="warn">Không đọc được danh sách nguồn: {error.message}</p>;
  const sources = data as SourceRow[];

  return (
    <>
      <h1>Nguồn</h1>
      <p className="muted">
        {sources.filter((s) => s.enabled).length}/{sources.length} nguồn đang bật
      </p>
      <div className="card scroll">
        <table>
          <thead>
            <tr>
              <th>Nguồn</th>
              <th>Loại</th>
              <th>Ngăn</th>
              <th>Trọng số</th>
              <th>Lần lấy thành công</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className={s.enabled ? '' : 'off'}>
                <td>
                  <a href={s.url} target="_blank" rel="noreferrer">{s.name}</a>
                  {s.note && <div className="meta">{s.note}</div>}
                </td>
                <td><span className="badge">{s.kind}</span></td>
                <td>{HINT_LABEL[s.category_hint]}</td>
                <td>
                  <form action={setWeight} className="inline">
                    <input type="hidden" name="id" value={s.id} />
                    <input type="number" name="weight" min={0} max={1} step={0.1} defaultValue={s.weight} />
                    <button type="submit" className="ghost">Lưu</button>
                  </form>
                </td>
                <td>
                  {s.enabled ? timeAgo(s.last_success_at) : '—'}
                  {s.fail_count > 0 && (
                    <div className="warn">
                      Lỗi {s.fail_count} lần liên tiếp: {s.last_error}
                    </div>
                  )}
                </td>
                <td>
                  <form action={setEnabled.bind(null, s.id, !s.enabled)}>
                    <button type="submit" className="ghost">{s.enabled ? 'Tắt' : 'Bật'}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
