'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { matchThumbs, setThumb, type ThumbMatch } from './actions';

type Row = { file: File; ten: string; product: ThumbMatch['product']; trung: boolean };
type St = { status: 'uploading' | 'done' | 'error'; message?: string };

const IMAGE_RE = /\.(jpe?g|png|webp)$/i;
const GIOI_HAN = 3.8 * 1024 * 1024; // máy chủ nhận tối đa ~4MB mỗi lần gửi
const tenKhongDuoi = (f: File) => f.name.replace(/\.[^.]+$/, '');

/** Ảnh quá nặng (> 3.8MB): thu về tối đa 2000px, lưu WebP (giữ nền trong suốt, nhẹ hơn PNG nhiều). Còn lại giữ nguyên file gốc. */
async function vuaCo(file: File): Promise<{ blob: Blob; ten: string }> {
  if (file.size <= GIOI_HAN) return { blob: file, ten: file.name };
  const bm = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, 2000 / Math.max(bm.width, bm.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bm.width * k);
  c.height = Math.round(bm.height * k);
  c.getContext('2d')!.drawImage(bm, 0, 0, c.width, c.height);
  bm.close();
  for (const q of [0.92, 0.85, 0.75]) {
    const b = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', q));
    if (b && b.size <= GIOI_HAN) return { blob: b, ten: `${tenKhongDuoi(file)}.webp` };
  }
  throw new Error('Ảnh quá nặng, nén vẫn > 4MB');
}

function Xem({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={file.name} title={file.name} style={{ width: 72, height: 72, objectFit: 'contain', background: 'var(--bg)', borderRadius: 4 }} />;
}

/** Ảnh đại diện đang dùng (bản 150px); không tải được bản nhỏ thì chỉ ghi "có ảnh". */
function AnhCu({ src }: { src: string }) {
  const [hong, setHong] = useState(false);
  if (hong) return <span className="meta">có ảnh</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" onError={() => setHong(true)} style={{ width: 72, height: 72, objectFit: 'contain', background: 'var(--bg)', borderRadius: 4 }} />;
}

export function ThumbUploader() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [bo, setBo] = useState<Set<string>>(new Set());
  const [st, setSt] = useState<Record<string, St>>({});
  const [loi, setLoi] = useState<string | null>(null);
  const [dangKhop, setDangKhop] = useState(false);
  const [pending, start] = useTransition();

  const dung = (r: Row) => !!r.product && !r.trung;
  const san = rows.filter((r) => dung(r) && !bo.has(r.ten) && st[r.ten]?.status !== 'done');
  const soThay = san.filter((r) => r.product?.thumb).length;
  const chay = pending;

  const chon = async (list: FileList | null) => {
    if (!list?.length) return;
    setLoi(null);
    setSt({});
    const files = Array.from(list)
      .filter((f) => IMAGE_RE.test(f.name) && !f.name.startsWith('.'))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (!files.length) return setLoi('Không có ảnh .jpg / .png / .webp nào.');
    setDangKhop(true);
    const res = await matchThumbs(files.map(tenKhongDuoi));
    setDangKhop(false);
    if (!res.ok) return setLoi(res.error);
    // Hai ảnh cùng trỏ vào một sản phẩm: giữ ảnh đặt tên ĐÚNG bằng SKU, ảnh kia đánh dấu trùng
    const ra: Row[] = res.data.map((m, i) => ({ file: files[i]!, ten: m.file, product: m.product, trung: false }));
    const theoSp = new Map<number, Row[]>();
    ra.forEach((r) => r.product && theoSp.set(r.product.id, [...(theoSp.get(r.product.id) ?? []), r]));
    for (const ds of theoSp.values()) {
      if (ds.length < 2) continue;
      const giu = ds.find((r) => r.ten.toLowerCase() === r.product!.sku.toLowerCase()) ?? ds[0]!;
      ds.forEach((r) => (r.trung = r !== giu));
    }
    setRows(ra);
    setBo(new Set());
  };

  const up = () => {
    if (!confirm(`Đặt ${san.length} ảnh làm ảnh đại diện${soThay ? ` (thay ảnh cũ của ${soThay} sản phẩm)` : ''}?\nHiện ngay trên web. Ảnh cũ vẫn nằm trong Thư viện Media.`)) return;
    start(async () => {
      const hang = [...san];
      const lam = async () => {
        for (let r = hang.shift(); r; r = hang.shift()) {
          const p = r.product!;
          const ten = r.ten;
          setSt((s) => ({ ...s, [ten]: { status: 'uploading' } }));
          try {
            const { blob, ten: tenFile } = await vuaCo(r.file);
            const fd = new FormData();
            fd.append('file', blob, tenFile);
            fd.append('filename', tenFile);
            fd.append('productId', String(p.id));
            fd.append('sku', p.sku);
            fd.append('name', p.name);
            fd.append('alt', p.alt);
            const kq = await setThumb(fd);
            setSt((s) => ({ ...s, [ten]: kq.ok ? { status: 'done', message: kq.data.cu ? 'đã thay ảnh cũ' : 'đã đặt ảnh' } : { status: 'error', message: kq.error } }));
          } catch (err) {
            setSt((s) => ({ ...s, [ten]: { status: 'error', message: (err as Error).message } }));
          }
        }
      };
      await Promise.all([lam(), lam()]); // 2 ảnh cùng lúc
      router.refresh();
    });
  };

  const xong = Object.values(st).filter((s) => s.status === 'done').length;
  const hong = Object.values(st).filter((s) => s.status === 'error').length;

  return (
    <>
      <div className="card settings wide">
        <div className="inline wrap">
          <label>
            <strong>Chọn ảnh</strong> (chọn nhiều file một lúc)
            <input type="file" multiple accept=".jpg,.jpeg,.png,.webp" disabled={chay} onChange={(e) => (void chon(e.target.files), (e.target.value = ''))} />
          </label>
          <label>
            <strong>hoặc chọn cả thư mục</strong>
            <input
              type="file"
              multiple
              disabled={chay}
              {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
              onChange={(e) => (void chon(e.target.files), (e.target.value = ''))}
            />
          </label>
        </div>
        <div className="meta">
          Tên file = <strong>SKU</strong> sản phẩm, vd <code>IV2368-800.png</code> (có đuôi <code>-1</code>, <code>(1)</code> cũng nhận). Ảnh up{' '}
          <strong>nguyên bản</strong>, không nén — ảnh nặng hơn 3,8MB mới tự thu về 2000px. Ảnh khác của sản phẩm giữ nguyên.
        </div>
        {dangKhop && <div className="meta">⏳ Đang khớp SKU với sản phẩm trên web…</div>}
        {loi && <div className="warn">✗ {loi}</div>}
      </div>

      {rows.length > 0 && !dangKhop && (
        <div className="card settings wide">
          <div className="scroll">
            <table>
              <thead>
                <tr><th></th><th>Ảnh mới</th><th>Sản phẩm</th><th>Ảnh đang dùng</th><th>Trạng thái</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = r.product;
                  const s = st[r.ten];
                  const on = dung(r) && !bo.has(r.ten);
                  return (
                    <tr key={r.ten} className={on ? '' : 'off'}>
                      <td>
                        <input
                          type="checkbox"
                          disabled={!dung(r) || chay}
                          checked={on}
                          onChange={(e) =>
                            setBo((prev) => {
                              const n = new Set(prev);
                              if (e.target.checked) n.delete(r.ten);
                              else n.add(r.ten);
                              return n;
                            })
                          }
                          style={{ width: 16, margin: 0 }}
                        />
                      </td>
                      <td>
                        <Xem file={r.file} />
                        <div className="meta">{r.file.name} · {(r.file.size / 1024 / 1024).toFixed(1)}MB</div>
                      </td>
                      <td>
                        {p ? (
                          <>
                            <a href={p.permalink} target="_blank" rel="noreferrer">{p.name}</a>
                            <div className="meta">
                              {p.sku} · alt: {p.altApp ? <span className="on" title={p.alt}>theo app</span> : 'tên sản phẩm'}
                              {p.status !== 'publish' && ` · ${p.status === 'draft' ? 'bản nháp' : p.status}`}
                            </div>
                            {r.trung && <div className="warn">Trùng sản phẩm với ảnh khác — bỏ qua</div>}
                          </>
                        ) : (
                          <span className="warn">Không có SKU "{r.ten}" trên web</span>
                        )}
                      </td>
                      <td>
                        {p?.thumb ? (
                          <AnhCu src={p.thumb} />
                        ) : p ? (
                          <span className="meta">chưa có</span>
                        ) : null}
                      </td>
                      <td>
                        {!s ? '—' : s.status === 'uploading' ? '⏳ đang up…' : s.status === 'done' ? <span className="on">✓ {s.message}</span> : <span className="warn">✗ {s.message}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="inline wrap">
            <button onClick={up} disabled={chay || !san.length}>
              {chay ? `Đang up… ${xong}/${xong + san.length}` : `⬆ Đặt ${san.length} ảnh đại diện`}
            </button>
            {soThay > 0 && !chay && <span className="meta">{soThay} sản phẩm đang có ảnh sẽ bị thay — bỏ tích nếu không muốn thay.</span>}
            {!chay && (xong > 0 || hong > 0) && (
              <span className={hong ? 'warn' : 'on'}>Xong {xong}{hong ? ` · lỗi ${hong} (bấm lại để up lại ảnh lỗi)` : ''}</span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
