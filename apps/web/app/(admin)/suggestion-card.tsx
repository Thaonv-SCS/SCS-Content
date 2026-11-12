'use client';

import { useState, useTransition } from 'react';
import { decide, saveEdit, undo, type EditableFields } from './digest-actions';

export type Suggestion = EditableFields & {
  id: string;
  slot: keyof typeof SLOT_LABEL;
  rank: number;
  is_filler: boolean;
  score: number;
  why: string | null;
  angles: string[] | null;
  to_verify: { claim: string; reason: string }[] | null;
  sources: { name: string; url: string; published_at: string | null }[] | null;
  image_urls: string[];
  status: 'new' | 'picked' | 'skipped';
};

// Giữ đồng bộ với CATEGORY_LABEL trong @app/core (component chạy ở trình duyệt nên không import core được)
const SLOT_LABEL = {
  boots: 'Giày',
  player: 'Cầu thủ',
  event: 'Sự kiện',
  vietnam: 'Việt Nam',
  kits: 'Áo đấu',
  gear: 'Bóng & phụ kiện',
};
const TAGS = ['không hợp gu', 'tin cũ', 'trùng', 'sai thông tin', 'sai mẫu giày', 'góc chưa ổn', 'caption chưa đúng giọng'];

function fmt(iso: string | null) {
  if (!iso) return 'không rõ giờ đăng';
  return new Date(iso).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="ghost small"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? 'Đã copy' : 'Copy'}
    </button>
  );
}

export function SuggestionCard({ s }: { s: Suggestion }) {
  const [editing, setEditing] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [draft, setDraft] = useState<EditableFields>({
    title_vi: s.title_vi,
    summary_vi: s.summary_vi ?? '',
    caption_long: s.caption_long ?? '',
    caption_short: s.caption_short ?? '',
  });
  const [pending, start] = useTransition();
  const toggleTag = (t: string) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  return (
    <article className={`card sug ${s.status}`}>
      {s.image_urls.length > 0 && (
        <div className="thumbs">
          {s.image_urls.slice(0, 3).map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer">
              <img src={u} alt="" loading="lazy" referrerPolicy="no-referrer" />
            </a>
          ))}
        </div>
      )}

      <div className="sug-head">
        <span className={`badge slot-${s.slot}`}>{SLOT_LABEL[s.slot]}</span>
        {s.is_filler && <span className="badge warn">bổ sung</span>}
        <span className="meta">điểm {s.score.toFixed(2)}</span>
        {s.status !== 'new' && (
          <span className={`badge ${s.status === 'picked' ? 'on' : 'off'}`}>{s.status === 'picked' ? '✓ Đã chọn' : 'Đã bỏ qua'}</span>
        )}
      </div>

      {editing ? (
        <input value={draft.title_vi} onChange={(e) => setDraft({ ...draft, title_vi: e.target.value })} />
      ) : (
        <h3>{s.title_vi}</h3>
      )}

      <ul className="sources">
        {(s.sources ?? []).map((src) => (
          <li key={src.url}>
            <a href={src.url} target="_blank" rel="noreferrer">{src.name}</a> · {fmt(src.published_at)}
          </li>
        ))}
      </ul>

      {editing ? (
        <textarea rows={4} value={draft.summary_vi} onChange={(e) => setDraft({ ...draft, summary_vi: e.target.value })} />
      ) : (
        s.summary_vi && <p>{s.summary_vi}</p>
      )}

      {s.why && (
        <p className="why">
          <strong>Vì sao đáng làm:</strong> {s.why}
        </p>
      )}

      {s.angles && s.angles.length > 0 && (
        <>
          <div className="label">Góc khai thác</div>
          <ul>
            {s.angles.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </>
      )}

      {(['caption_long', 'caption_short'] as const).map((key) => (
        <div key={key} className="caption">
          <div className="label">
            {key === 'caption_long' ? 'Caption dài' : 'Caption ngắn'}
            {!editing && s[key] && <CopyButton text={s[key]} />}
          </div>
          {editing ? (
            <textarea rows={key === 'caption_long' ? 7 : 2} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
          ) : (
            <pre>{s[key] || '—'}</pre>
          )}
        </div>
      ))}

      {s.to_verify && s.to_verify.length > 0 && (
        <div className="verify">
          <div className="label">⚠ Cần xác minh</div>
          <ul>
            {s.to_verify.map((v) => (
              <li key={v.claim}>
                <strong>{v.claim}</strong> — {v.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="tags">
        {TAGS.map((t) => (
          <button key={t} type="button" className={`chip ${tags.includes(t) ? 'active' : ''}`} onClick={() => toggleTag(t)}>
            {t}
          </button>
        ))}
      </div>

      <div className="actions">
        {editing ? (
          <>
            <button disabled={pending} onClick={() => start(async () => { await saveEdit(s.id, draft, tags); setEditing(false); })}>
              Lưu bản sửa
            </button>
            <button className="ghost" onClick={() => setEditing(false)}>Hủy</button>
          </>
        ) : s.status === 'new' ? (
          <>
            <button disabled={pending} onClick={() => start(() => decide(s.id, 'pick', tags))}>Chọn</button>
            <button className="ghost" disabled={pending} onClick={() => start(() => decide(s.id, 'skip', tags))}>Bỏ qua</button>
            <button className="ghost" onClick={() => setEditing(true)}>Sửa</button>
          </>
        ) : (
          <>
            <button className="ghost" onClick={() => setEditing(true)}>Sửa</button>
            <button className="ghost" disabled={pending} onClick={() => start(() => undo(s.id))}>Hoàn tác</button>
          </>
        )}
      </div>
    </article>
  );
}
