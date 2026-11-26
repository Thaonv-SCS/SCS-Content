'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { attachToProduct, matchFolders, uploadOne, type FolderMatch } from './actions';

type UploadedImage = { id: number; url: string; width: number; height: number };
type Group = { folder: string; files: File[]; skipped: string[] };
type RowState = { status: 'waiting' | 'uploading' | 'done' | 'error'; done: number; message?: string };

const MAX_WIDTH = 1024; // như ảnh trên web
const IMAGE_RE = /\.(jpe?g|png|webp)$/i;
const naturalSort = (a: File, b: File) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

/** Thu nhỏ ảnh ngay trên máy (giữ đúng chiều xoay của ảnh điện thoại) → JPEG ~150–300KB. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // ảnh PNG nền trong suốt → nền trắng
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không nén được ảnh'))), 'image/jpeg', 0.85));
}

/** Gom file theo thư mục chứa trực tiếp (thư mục mã). */
function groupByFolder(files: FileList): Group[] {
  const groups = new Map<string, Group>();
  for (const f of Array.from(files)) {
    const parts = (f.webkitRelativePath || f.name).split('/');
    if (parts.length < 2) continue;
    const folder = parts[parts.length - 2]!;
    if (f.name.startsWith('.')) continue; // file ẩn của hệ điều hành
    const g = groups.get(folder) ?? { folder, files: [], skipped: [] };
    if (IMAGE_RE.test(f.name)) g.files.push(f);
    else if (!/\.(db|ini|ds_store)$/i.test(f.name)) g.skipped.push(f.name);
    groups.set(folder, g);
  }
  return [...groups.values()]
    .filter((g) => g.files.length || g.skipped.length)
    .map((g) => ({ ...g, files: g.files.sort(naturalSort) }))
    .sort((a, b) => a.folder.localeCompare(b.folder, undefined, { numeric: true }));
}

function Thumbs({ files }: { files: File[] }) {
  const urls = useMemo(() => files.slice(0, 8).map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return (
    <div className="img-strip">
      {urls.map((u, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={u} src={u} alt={files[i]!.name} title={files[i]!.name} />
      ))}
      {files.length > 8 && <span className="meta">+{files.length - 8}</span>}
    </div>
  );
}

export function ImageUploader() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [matches, setMatches] = useState<Map<string, FolderMatch['product']>>(new Map());
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [pending, start] = useTransition();

  const ready = groups.filter((g) => matches.get(g.folder) && g.files.length && !excluded.has(g.folder));
  const totalImages = ready.reduce((n, g) => n + g.files.length, 0);
  const running = pending || Object.values(rows).some((r) => r.status === 'uploading');

  const onPick = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setRows({});
    const gs = groupByFolder(files);
    setGroups(gs);
    if (!gs.length) return setError('Không thấy thư mục con nào có ảnh. Chọn thư mục MẸ chứa các thư mục theo mã.');
    setChecking(true);
    const res = await matchFolders(gs.map((g) => g.folder));
    setChecking(false);
    if (!res.ok) return setError(res.error);
    setMatches(new Map(res.data.map((m) => [m.folder, m.product])));
    setExcluded(new Set());
  };

  const run = () => {
    const warn =
      mode === 'replace'
        ? `THAY TOÀN BỘ ảnh cũ trong mô tả của ${ready.length} sản phẩm bằng ${totalImages} ảnh mới?`
        : `Thêm ${totalImages} ảnh vào cuối mô tả của ${ready.length} sản phẩm?`;
    if (!confirm(`${warn}\nThay đổi hiện ngay trên web (sản phẩm đang bán vẫn bán bình thường).`)) return;

    start(async () => {
      for (const g of ready) {
        const p = matches.get(g.folder)!;
        const set = (s: RowState) => setRows((prev) => ({ ...prev, [g.folder]: s }));
        set({ status: 'uploading', done: 0 });
        const uploaded: UploadedImage[] = [];
        let failed: string | undefined;
        // Up 3 ảnh cùng lúc, giữ đúng thứ tự theo tên file
        const results: (UploadedImage | null)[] = new Array(g.files.length).fill(null);
        for (let i = 0; i < g.files.length && !failed; i += 3) {
          await Promise.all(
            g.files.slice(i, i + 3).map(async (f, k) => {
              try {
                const fd = new FormData();
                fd.append('file', await shrink(f), `${p.sku}-${i + k + 1}.jpg`);
                fd.append('filename', `${p.sku}-${i + k + 1}.jpg`);
                fd.append('alt', p.alt);
                fd.append('productId', String(p.id));
                const r = await uploadOne(fd);
                if (r.ok) results[i + k] = r.data;
                else failed ??= `${f.name}: ${r.error}`;
              } catch (err) {
                failed ??= `${f.name}: ${(err as Error).message}`;
              }
            }),
          );
          set({ status: 'uploading', done: results.filter(Boolean).length });
        }
        uploaded.push(...results.filter((x): x is UploadedImage => !!x));
        if (failed) {
          // Không chèn nửa vời: báo lỗi, ảnh đã up nằm trong Thư viện Media (chưa gắn vào bài)
          set({ status: 'error', done: uploaded.length, message: `${failed} — chưa chèn vào mô tả, up lại mã này.` });
          continue;
        }
        const att = await attachToProduct({ id: p.id, sku: p.sku, name: p.name, alt: p.alt }, uploaded, mode);
        set(
          att.ok
            ? { status: 'done', done: uploaded.length, message: `mô tả: ${att.data.before} → ${att.data.after} ảnh` }
            : { status: 'error', done: uploaded.length, message: att.error },
        );
      }
      router.refresh();
    });
  };

  return (
    <>
      <div className="card settings wide">
        <label>
          <strong>Chọn thư mục ảnh</strong> (thư mục mẹ chứa các thư mục con theo mã)
          <input
            type="file"
            multiple
            disabled={running}
            {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
            onChange={(e) => {
              void onPick(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        <div className="inline wrap">
          <label className="inline">
            <input type="radio" name="mode" checked={mode === 'append'} onChange={() => setMode('append')} style={{ width: 'auto', margin: 0 }} />
            Thêm vào cuối mô tả (giữ ảnh cũ)
          </label>
          <label className="inline">
            <input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} style={{ width: 'auto', margin: 0 }} />
            Thay toàn bộ ảnh cũ trong mô tả
          </label>
        </div>
        <div className="meta">
          Ảnh xếp theo tên file (1, 2, … 10). Nhận .jpg / .png / .webp — ảnh HEIC của iPhone thì xuất sang JPG trước. Ảnh được thu nhỏ về{' '}
          {MAX_WIDTH}px ngay trên máy nên up nhanh và web nhẹ.
        </div>
        {checking && <div className="meta">⏳ Đang khớp mã với sản phẩm trên web…</div>}
        {error && <div className="warn">✗ {error}</div>}
      </div>

      {groups.length > 0 && !checking && (
        <div className="card settings wide">
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Thư mục → sản phẩm</th>
                  <th>Ảnh mới</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const p = matches.get(g.folder);
                  const r = rows[g.folder];
                  const usable = !!p && g.files.length > 0;
                  return (
                    <tr key={g.folder} className={usable && !excluded.has(g.folder) ? '' : 'off'}>
                      <td>
                        <input
                          type="checkbox"
                          disabled={!usable || running}
                          checked={usable && !excluded.has(g.folder)}
                          onChange={(e) =>
                            setExcluded((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.delete(g.folder);
                              else next.add(g.folder);
                              return next;
                            })
                          }
                          style={{ width: 16, margin: 0 }}
                        />
                      </td>
                      <td>
                        <div className="meta">📁 {g.folder}</div>
                        {p ? (
                          <>
                            <a href={p.permalink} target="_blank" rel="noreferrer">{p.name}</a>
                            <div className="meta">
                              {p.sku} · đang có {p.images} ảnh trong mô tả · alt: {p.altApp ? <span className="on">theo app</span> : 'tên sản phẩm'}
                              {p.status !== 'publish' && ` · ${p.status === 'draft' ? 'bản nháp' : p.status}`}
                            </div>
                          </>
                        ) : (
                          <span className="warn">Không tìm thấy mã này trên web — kiểm tra tên thư mục</span>
                        )}
                      </td>
                      <td>
                        <Thumbs files={g.files} />
                        <div className="meta">
                          {g.files.length} ảnh
                          {g.skipped.length > 0 && ` · bỏ qua ${g.skipped.length} file không phải ảnh (${g.skipped.slice(0, 2).join(', ')}…)`}
                        </div>
                      </td>
                      <td>
                        {!r ? (
                          '—'
                        ) : r.status === 'uploading' ? (
                          <>⏳ {r.done}/{g.files.length}</>
                        ) : r.status === 'done' ? (
                          <span className="on">✓ {r.message}</span>
                        ) : (
                          <span className="warn">✗ {r.message}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="inline wrap">
            <button onClick={run} disabled={running || !ready.length}>
              {running ? 'Đang up…' : `⬆ Up ${totalImages} ảnh cho ${ready.length} sản phẩm`}
            </button>
            {ready.length > 0 && <span className="meta">~{Math.ceil((totalImages * 1.5) / 60)} phút · giữ trang mở đến khi xong</span>}
          </div>
        </div>
      )}
    </>
  );
}
