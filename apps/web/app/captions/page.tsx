import { CATEGORY_LABEL, isRunActive, STYLE_NOTES_REFRESH_EVERY, type RunStatus, type StyleNotes } from '@app/core';
import { supabaseServer } from '@/lib/supabase';
import { formatDateTime } from '@/lib/format';
import { deleteCaption, saveStyleNotes } from './actions';
import { AddCaptionsForm, RefreshStyleButton } from './forms';

type CaptionRow = {
  id: string;
  text: string;
  source: 'page' | 'edited';
  kind: 'long' | 'short';
  category: string | null;
  brands: string[];
  players: string[];
  boot_lines: string[];
  tagged_at: string | null;
  created_at: string;
};

const LABEL: Record<string, string> = { ...CATEGORY_LABEL, other: 'Khác' };

export default async function CaptionsPage() {
  const supabase = await supabaseServer();
  const [{ data, error, count }, { data: settings }] = await Promise.all([
    supabase
      .from('captions')
      .select('id,text,source,kind,category,brands,players,boot_lines,tagged_at,created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(60),
    supabase.from('settings').select('key,value').in('key', ['style_notes', 'last_run']),
  ]);
  if (error) return <p className="warn">Chưa có kho caption — cần chạy migration 0004 trên Supabase.</p>;

  const captions = (data ?? []) as CaptionRow[];
  const total = count ?? captions.length;
  const notes = settings?.find((s) => s.key === 'style_notes')?.value as StyleNotes | undefined;
  const lastRun = settings?.find((s) => s.key === 'last_run')?.value as RunStatus | undefined;
  const styleRunActive = isRunActive(lastRun) && lastRun?.task === 'style';
  const untagged = captions.filter((c) => !c.tagged_at).length;
  const sinceNotes = total - (notes?.caption_count ?? 0);

  const runStatus = styleRunActive
    ? `⏳ ${lastRun?.step ?? 'Đang chạy'}`
    : lastRun?.task === 'style' && lastRun.status === 'failed'
      ? `✗ Lỗi: ${lastRun.message ?? ''}`
      : null;

  return (
    <>
      <h1>Kho caption</h1>
      <p className="muted">
        {total} caption · {captions.filter((c) => c.source === 'page').length} đã đăng, {captions.filter((c) => c.source === 'edited').length} mày sửa từ
        bản tin (trong {captions.length} mới nhất){untagged ? ` · ${untagged} chờ AI gắn nhãn ở lượt chạy sau` : ''}
      </p>
      <p className="meta">
        Mỗi lần viết gợi ý, AI lấy ~8 caption gần nhất với tin đó (cùng ngăn, hãng, dòng giày, cầu thủ) làm mẫu giọng văn. Khoảng 50 caption là
        AI bắt giọng khá ổn, 100+ là tốt.
      </p>

      <AddCaptionsForm />

      <h2>Ghi chú văn phong</h2>
      <div className="card settings wide">
        <div className="meta">
          {notes
            ? `Cập nhật ${formatDateTime(notes.updated_at)} từ ${notes.caption_count} caption${notes.edited_by_admin ? ' · mày đã sửa tay' : ''}. `
            : 'Chưa có. '}
          Tự cập nhật khi kho có thêm {STYLE_NOTES_REFRESH_EVERY} caption{notes ? ` (hiện thêm ${Math.max(0, sinceNotes)})` : ''}. Quy tắc mày tự viết sẽ
          được giữ lại.
        </div>
        <form action={saveStyleNotes} className="settings">
          <textarea name="notes" rows={14} defaultValue={notes?.text ?? ''} placeholder="AI sẽ viết ghi chú khi kho có từ 5 caption. Mày cũng có thể tự viết quy tắc ở đây." />
          <div className="inline">
            <button type="submit">Lưu ghi chú</button>
          </div>
        </form>
        <RefreshStyleButton active={styleRunActive} status={runStatus} />
      </div>

      <h2>Caption trong kho</h2>
      <div className="feed">
        {captions.map((c) => (
          <article key={c.id} className="card caption-item">
            <div className="sug-head">
              <span className="badge">{c.source === 'edited' ? 'Mày sửa' : 'Đã đăng'}</span>
              <span className="badge">{c.kind === 'short' ? 'Ngắn' : 'Dài'}</span>
              {c.category && <span className="badge">{LABEL[c.category] ?? c.category}</span>}
              <span className="meta">{[...c.brands, ...c.boot_lines, ...c.players].join(' · ')}</span>
              <form action={deleteCaption.bind(null, c.id)} className="spacer">
                <button type="submit" className="link">Xóa</button>
              </form>
            </div>
            <pre>{c.text}</pre>
          </article>
        ))}
      </div>
    </>
  );
}
