'use client';

import { useActionState, useState, useTransition } from 'react';
import type { SourcePreview } from '@app/connectors';
import { createSource, deleteSource, detect, setEnabled, testSource, updateSource } from './actions';

export type Option = { value: string; label: string };

export type SourceRow = {
  id: string;
  name: string;
  kind: string;
  url: string;
  category_hint: string;
  weight: number;
  enabled: boolean;
  note: string | null;
  config: { include?: string; maxNew?: number } | null;
  last_success_at: string | null;
  last_error: string | null;
  fail_count: number;
};

const KIND_LABEL: Record<string, string> = { rss: 'RSS', sitemap: 'Sitemap', html: 'HTML', x: 'X', match_api: 'API trận đấu', manual: 'Dán tay' };

function timeAgo(iso: string | null) {
  if (!iso) return 'chưa chạy';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${mins} phút trước`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} giờ trước`;
  return `${Math.round(mins / 1440)} ngày trước`;
}

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' }) : 'không rõ ngày';
}

function PreviewList({ preview }: { preview: SourcePreview }) {
  if (!preview.count) return <p className="warn">7 ngày qua không lấy được bài nào.</p>;
  return (
    <div>
      <div className="meta">{preview.count} bài trong 7 ngày qua · mới nhất:</div>
      <ul className="preview">
        {preview.samples.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> <span className="meta">· {fmtDate(s.publishedAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Các ô nhập dùng chung cho form thêm và form sửa. */
function SourceFields({
  categories,
  initial,
  lockedKind,
}: {
  categories: Option[];
  initial: Partial<SourceRow>;
  /** Nguồn loại đặc biệt: không cho sửa link / loại. */
  lockedKind?: boolean;
}) {
  const [kind, setKind] = useState(initial.kind ?? 'rss');
  return (
    <div className="source-fields">
      <label>
        Tên nguồn
        <input name="name" defaultValue={initial.name ?? ''} required />
      </label>
      {!lockedKind && (
        <>
          <label>
            Link lấy bài (RSS / sitemap)
            <input name="url" defaultValue={initial.url ?? ''} required />
          </label>
          <label>
            Cách lấy
            <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="rss">RSS / Atom</option>
              <option value="sitemap">Sitemap</option>
            </select>
          </label>
        </>
      )}
      <label>
        Ngăn
        <select name="category_hint" defaultValue={initial.category_hint ?? 'mixed'}>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </label>
      <label>
        Trọng số (0–1)
        <input name="weight" type="number" min={0} max={1} step={0.1} defaultValue={initial.weight ?? 0.5} />
      </label>
      {!lockedKind && kind === 'sitemap' && (
        <>
          <label>
            Chỉ lấy link chứa
            <input name="include" defaultValue={initial.config?.include ?? ''} placeholder="vd /articles/." />
          </label>
          <label>
            Tối đa bài mới / lượt
            <input name="maxNew" type="number" min={1} max={50} defaultValue={initial.config?.maxNew ?? 20} />
          </label>
        </>
      )}
      <label className="wide-field">
        Ghi chú
        <input name="note" defaultValue={initial.note ?? ''} />
      </label>
    </div>
  );
}

export function AddSourceForm({ categories }: { categories: Option[] }) {
  const [detected, runDetect, detecting] = useActionState(detect, null);
  const [saveError, save, saving] = useActionState(createSource, null);
  const [savedFor, setSavedFor] = useState<string | null>(null);
  const done = savedFor && savedFor === detected?.url && !saveError && !saving;

  return (
    <div className="card settings wide">
      <form action={runDetect} className="inline">
        <input name="link" placeholder="Dán link trang web, chuyên mục hoặc RSS — vd https://www.footyheadlines.com" defaultValue={detected?.input} />
        <button type="submit" disabled={detecting}>{detecting ? 'Đang dò…' : 'Dò nguồn'}</button>
      </form>

      {detected && (
        <>
          <p className={detected.ok ? 'on' : 'warn'}>
            {detected.ok ? '✓ ' : '✗ '}
            {detected.message}
          </p>
          {detected.preview && <PreviewList preview={detected.preview} />}
          {detected.ok && !done && (
            <form
              key={detected.url}
              action={(fd) => {
                setSavedFor(detected.url ?? null);
                save(fd);
              }}
              className="settings"
            >
              <SourceFields
                categories={categories}
                initial={{ name: detected.title, url: detected.url, kind: detected.kind, config: detected.config ?? null }}
              />
              <div className="inline">
                <button type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu nguồn'}</button>
                {saveError && <span className="warn">{saveError}</span>}
              </div>
            </form>
          )}
          {done && <p className="on">✓ Đã thêm nguồn. Lượt chạy tới sẽ lấy bài từ nguồn này.</p>}
        </>
      )}
    </div>
  );
}

export function SourceRowView({ s, categories, categoryLabel }: { s: SourceRow; categories: Option[]; categoryLabel: string }) {
  const [editing, setEditing] = useState(false);
  const [test, setTest] = useState<{ preview?: SourcePreview; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const [editError, saveEdit, savingEdit] = useActionState(
    async (prev: string | null, fd: FormData) => {
      const err = await updateSource(s.id, prev, fd);
      if (!err) setEditing(false);
      return err;
    },
    null,
  );
  const locked = s.kind !== 'rss' && s.kind !== 'sitemap';

  return (
    <>
      <tr className={s.enabled ? '' : 'off'}>
        <td>
          <a href={s.url} target="_blank" rel="noreferrer">{s.name}</a>
          {s.note && <div className="meta">{s.note}</div>}
        </td>
        <td><span className="badge">{KIND_LABEL[s.kind] ?? s.kind}</span></td>
        <td>{categoryLabel}</td>
        <td>{s.weight.toFixed(1)}</td>
        <td>
          {s.enabled ? timeAgo(s.last_success_at) : '—'}
          {s.fail_count > 0 && <div className="warn">Lỗi {s.fail_count} lần liên tiếp: {s.last_error}</div>}
        </td>
        <td>
          <div className="row-actions">
            <button className="ghost small" disabled={pending} onClick={() => start(() => setEnabled(s.id, !s.enabled))}>
              {s.enabled ? 'Tắt' : 'Bật'}
            </button>
            <button className="ghost small" onClick={() => setEditing((v) => !v)}>{editing ? 'Đóng' : 'Sửa'}</button>
            {!locked && (
              <button className="ghost small" disabled={pending} onClick={() => start(async () => setTest(await testSource(s.id)))}>
                {pending && !test ? 'Đang thử…' : 'Thử'}
              </button>
            )}
            <button
              className="ghost small danger"
              disabled={pending}
              onClick={() => {
                if (confirm(`Xóa nguồn "${s.name}"? Bài đã lấy từ nguồn này vẫn được giữ lại.`)) start(() => deleteSource(s.id));
              }}
            >
              Xóa
            </button>
          </div>
        </td>
      </tr>
      {(editing || test) && (
        <tr className="detail-row">
          <td colSpan={6}>
            {test && (
              <div className="test-result">
                {test.error ? <p className="warn">✗ {test.error}</p> : test.preview && <PreviewList preview={test.preview} />}
                <button className="link" onClick={() => setTest(null)}>Ẩn kết quả thử</button>
              </div>
            )}
            {editing && (
              <form action={saveEdit} className="settings">
                <SourceFields categories={categories} initial={s} lockedKind={locked} />
                {locked && <p className="meta">Nguồn loại {KIND_LABEL[s.kind] ?? s.kind} cần code riêng nên không đổi được link / cách lấy ở đây.</p>}
                <div className="inline">
                  <button type="submit" disabled={savingEdit}>{savingEdit ? 'Đang lưu…' : 'Lưu'}</button>
                  {editError && <span className="warn">{editError}</span>}
                </div>
              </form>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
