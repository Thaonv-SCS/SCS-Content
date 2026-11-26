'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { applyVideos, matchVideos, type VideoRow } from './actions';

type St = { status: 'dang' | 'xong' | 'loi'; message?: string };

const loaiLink = (url: string) => (/tiktok/i.test(url) ? 'TikTok' : /shorts/i.test(url) ? 'YouTube Shorts' : 'YouTube');

export function VideoUploader() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [kieu, setKieu] = useState<'them' | 'thay'>('them');
  const [rows, setRows] = useState<VideoRow[]>([]);
  const [loiDong, setLoiDong] = useState<string[]>([]);
  const [bo, setBo] = useState<Set<string>>(new Set());
  const [st, setSt] = useState<Record<string, St>>({});
  const [loi, setLoi] = useState<string | null>(null);
  const [dangKhop, setDangKhop] = useState(false);
  const [chay, start] = useTransition();

  const linkDung = (r: VideoRow) => r.links.filter((l) => l.ok && (kieu === 'thay' || !l.coSan));
  const dung = (r: VideoRow) => !!r.product && linkDung(r).length > 0;
  const san = rows.filter((r) => dung(r) && !bo.has(r.sku) && st[r.sku]?.status !== 'xong');
  const tongVideo = san.reduce((n, r) => n + linkDung(r).length, 0);

  const kiemTra = async () => {
    setLoi(null);
    setSt({});
    setDangKhop(true);
    const r = await matchVideos(text);
    setDangKhop(false);
    if (!r.ok) return setLoi(r.error);
    if (!r.data.rows.length) return setLoi('Không đọc được dòng nào. Mỗi dòng: SKU rồi link video.');
    setRows(r.data.rows);
    setLoiDong(r.data.loi);
    setBo(new Set());
  };

  const chen = () => {
    const thayCu = kieu === 'thay' ? san.filter((r) => r.product!.soVideo > 0).length : 0;
    if (!confirm(`Chèn ${tongVideo} video cho ${san.length} sản phẩm${thayCu ? ` (BỎ video cũ của ${thayCu} sản phẩm)` : ''}?\nHiện ngay trên web.`)) return;
    start(async () => {
      for (const r of san) {
        const p = r.product!;
        setSt((s) => ({ ...s, [r.sku]: { status: 'dang' } }));
        const kq = await applyVideos({ id: p.id, sku: p.sku, name: p.name }, linkDung(r).map((l) => l.url), kieu);
        setSt((s) => ({
          ...s,
          [r.sku]: kq.ok
            ? { status: 'xong', message: kq.data.them ? `đã chèn ${kq.data.them}${kq.data.bo ? `, bỏ ${kq.data.bo} cũ` : ''}` : 'đã có sẵn, không đổi' }
            : { status: 'loi', message: kq.error },
        }));
      }
      router.refresh();
    });
  };

  return (
    <>
      <div className="card settings wide">
        <label>
          <strong>Dán danh sách SKU + link video</strong>
          <span className="meta">
            Mỗi dòng: <code>SKU | link</code> (hoặc copy 2 cột SKU, link từ Excel dán vào). Một SKU nhiều video thì viết nhiều dòng. Nhận YouTube, YouTube Shorts, TikTok (kể cả link
            rút gọn vt.tiktok.com).
          </span>
          <textarea
            rows={6}
            value={text}
            disabled={chay}
            onChange={(e) => setText(e.target.value)}
            placeholder={`IV2368-800 | https://www.youtube.com/watch?v=...\nFW5835\thttps://www.tiktok.com/@soccerstore.vn/video/...`}
          />
        </label>
        <div className="inline wrap">
          <label className="inline">
            <input type="radio" checked={kieu === 'them'} onChange={() => setKieu('them')} style={{ width: 'auto', margin: 0 }} />
            Thêm (giữ video đang có, bỏ qua video trùng)
          </label>
          <label className="inline">
            <input type="radio" checked={kieu === 'thay'} onChange={() => setKieu('thay')} style={{ width: 'auto', margin: 0 }} />
            Thay toàn bộ video cũ trong mô tả
          </label>
        </div>
        <div className="inline">
          <button type="button" className="ghost" disabled={chay || dangKhop || !text.trim()} onClick={() => void kiemTra()}>
            {dangKhop ? 'Đang khớp SKU…' : 'Kiểm tra'}
          </button>
          <span className="meta">Video chèn ngay dưới bảng thông số (không có bảng thì ở đầu mô tả), căn giữa. Sản phẩm cùng SKU trong app (Post sản phẩm) cũng được lưu link để đẩy lại không mất video.</span>
        </div>
        {loi && <div className="warn">✗ {loi}</div>}
        {loiDong.length > 0 && <div className="warn">Bỏ qua {loiDong.length} dòng không đọc được: {loiDong.slice(0, 3).join(' · ')}{loiDong.length > 3 ? '…' : ''}</div>}
      </div>

      {rows.length > 0 && !dangKhop && (
        <div className="card settings wide">
          <div className="scroll">
            <table>
              <thead>
                <tr><th></th><th>Sản phẩm</th><th>Video</th><th>Trạng thái</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = r.product;
                  const s = st[r.sku];
                  const on = dung(r) && !bo.has(r.sku);
                  return (
                    <tr key={r.sku} className={on ? '' : 'off'}>
                      <td>
                        <input
                          type="checkbox"
                          disabled={!dung(r) || chay}
                          checked={on}
                          onChange={(e) =>
                            setBo((prev) => {
                              const n = new Set(prev);
                              if (e.target.checked) n.delete(r.sku);
                              else n.add(r.sku);
                              return n;
                            })
                          }
                          style={{ width: 16, margin: 0 }}
                        />
                      </td>
                      <td>
                        {p ? (
                          <>
                            <a href={p.permalink} target="_blank" rel="noreferrer">{p.name}</a>
                            <div className="meta">
                              {p.sku} · đang có {p.soVideo} video
                              {p.status !== 'publish' && ` · ${p.status === 'draft' ? 'bản nháp' : p.status}`}
                            </div>
                          </>
                        ) : (
                          <span className="warn">Không có SKU "{r.sku}" trên web</span>
                        )}
                      </td>
                      <td>
                        {r.links.map((l) => (
                          <div key={l.url} className={l.ok ? (l.coSan && kieu === 'them' ? 'meta' : '') : 'warn'}>
                            <a href={l.url} target="_blank" rel="noreferrer">{l.ok ? loaiLink(l.url) : 'Link không nhận ra'}</a>
                            {l.ok && l.coSan && kieu === 'them' && ' · đã có, bỏ qua'}
                          </div>
                        ))}
                      </td>
                      <td>
                        {!s ? '—' : s.status === 'dang' ? '⏳ đang chèn…' : s.status === 'xong' ? <span className="on">✓ {s.message}</span> : <span className="warn">✗ {s.message}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="inline wrap">
            <button onClick={chen} disabled={chay || !san.length}>
              {chay ? 'Đang chèn…' : `▶ Chèn ${tongVideo} video cho ${san.length} sản phẩm`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
