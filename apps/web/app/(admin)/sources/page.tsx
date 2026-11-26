import { CATEGORY_LABEL, type CategoryHint } from '@app/core';
import { requireQuyen } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';
import { AddSourceForm, SourceRowView, type Option, type SourceRow } from './source-forms';

const HINT_LABEL: Record<CategoryHint, string> = { ...CATEGORY_LABEL, match: 'Trận đấu', mixed: 'Tổng hợp (AI tự chia ngăn)' };
const CATEGORY_OPTIONS: Option[] = (['mixed', ...Object.keys(CATEGORY_LABEL), 'match'] as CategoryHint[]).map((value) => ({
  value,
  label: HINT_LABEL[value],
}));

export default async function SourcesPage() {
  await requireQuyen('ban-tin-ql');
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('sources')
    .select('id,name,kind,url,category_hint,weight,enabled,note,config,last_success_at,last_error,fail_count')
    .order('enabled', { ascending: false })
    .order('name');
  if (error) return <p className="warn">Không đọc được danh sách nguồn: {error.message}</p>;
  const sources = data as SourceRow[];

  return (
    <>
      <h1>Nguồn</h1>
      <p className="muted">
        {sources.filter((s) => s.enabled).length}/{sources.length} nguồn đang bật · ngăn của nguồn chỉ là gợi ý, AI vẫn tự chia từng bài vào ngăn
        phù hợp
      </p>

      <h2>Thêm nguồn</h2>
      <AddSourceForm categories={CATEGORY_OPTIONS} />

      <h2>Danh sách nguồn</h2>
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
              <SourceRowView key={s.id} s={s} categories={CATEGORY_OPTIONS} categoryLabel={HINT_LABEL[s.category_hint as CategoryHint] ?? s.category_hint} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
