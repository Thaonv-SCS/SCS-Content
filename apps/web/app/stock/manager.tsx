'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { STOCK_LABEL, VISIBILITY_LABEL, type StockItem, type StockStatus, type Visibility } from '@app/products/src/stock-types.ts';
import { applyStockChunk, getRunChanges, loadStockPage, lookupSkus, markUndone, type Change } from './actions';

export type RunSummary = {
  run_id: string;
  at: string;
  who: string;
  count: number;
  toOut: number;
  toIn: number;
  visibility: Record<string, number>;
  undoOf: string | null;
  undone: boolean;
};

const PAGE = 100;
const CHUNK = 25;
const VIS = Object.keys(VISIBILITY_LABEL) as Visibility[];
const fmt = (iso: string) => new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' });

/** Gửi lần lượt từng phần lên web, báo tiến độ. Trả về số thành công + lỗi. */
async function sendInChunks(
  runId: string,
  changes: Change[],
  onProgress: (done: number) => void,
  undoOf?: string,
): Promise<{ okIds: Set<number>; errors: string[] }> {
  const okIds = new Set<number>();
  const errors: string[] = [];
  for (let i = 0; i < changes.length; i += CHUNK) {
    const part = changes.slice(i, i + CHUNK);
    const res = await applyStockChunk(runId, part, undoOf);
    if (!res.ok) {
      errors.push(res.error);
      break; // lỗi cả phần (mất kết nối, bị chặn…) → dừng, phần đã gửi vẫn được lưu lịch sử
    }
    for (const r of res.data) {
      if (r.error) errors.push(`${part.find((c) => c.id === r.id)?.sku || r.id}: ${r.error}`);
      else okIds.add(r.id);
    }
    // Sản phẩm không cần đổi (đã đúng trạng thái) cũng tính là xong
    part.forEach((c) => !res.data.some((r) => r.id === c.id) && okIds.add(c.id));
    onProgress(Math.min(i + CHUNK, changes.length));
  }
  return { okIds, errors };
}

export function StockManager({ history }: { history: RunSummary[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<'list' | 'sku'>('list');
  const [listFilter, setListFilter] = useState<StockStatus | 'all'>('outofstock');
  const [skuText, setSkuText] = useState('');
  const [items, setItems] = useState<StockItem[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [visFilter, setVisFilter] = useState<Visibility | ''>('');
  const [stockFilter, setStockFilter] = useState<string>('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [newStock, setNewStock] = useState<StockStatus | ''>('');
  const [newVis, setNewVis] = useState<Visibility | ''>('');
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const busy = !!loading || !!progress || pending;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (p) =>
        (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) &&
        (!visFilter || p.catalog_visibility === visFilter) &&
        (!stockFilter || p.stock_status === stockFilter),
    );
  }, [items, search, visFilter, stockFilter]);
  const shown = filtered.slice(page * PAGE, (page + 1) * PAGE);
  const pages = Math.ceil(filtered.length / PAGE);
  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));

  const reset = (list: StockItem[], miss: string[] = [], selectAll = false) => {
    setItems(list);
    setMissing(miss);
    setSelected(new Set(selectAll ? list.map((p) => p.id) : []));
    setPage(0);
    setReport(null);
  };

  const loadList = () =>
    start(async () => {
      setError(null);
      const first = await loadStockPage(listFilter, 1);
      if (!first.ok) return setError(first.error);
      const all = [...first.data.items];
      setLoading({ done: all.length, total: first.data.total });
      // Tải các trang còn lại, 3 trang cùng lúc
      for (let p = 2; p <= first.data.totalPages; p += 3) {
        const batch = await Promise.all(
          [p, p + 1, p + 2].filter((x) => x <= first.data.totalPages).map((x) => loadStockPage(listFilter, x)),
        );
        for (const r of batch) {
          if (!r.ok) {
            setLoading(null);
            return setError(r.error);
          }
          all.push(...r.data.items);
        }
        setLoading({ done: all.length, total: first.data.total });
      }
      setLoading(null);
      reset(all);
    });

  const findSkus = () =>
    start(async () => {
      setError(null);
      const r = await lookupSkus(skuText);
      if (!r.ok) return setError(r.error);
      reset(r.data.items, r.data.missing, true); // tìm theo mã thì chọn sẵn tất cả
    });

  const apply = () => {
    const chosen = items.filter((p) => selected.has(p.id));
    const changes: Change[] = chosen
      .map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        old_stock: p.stock_status,
        old_visibility: p.catalog_visibility,
        ...(newStock ? { new_stock: newStock } : {}),
        ...(newVis ? { new_visibility: newVis } : {}),
      }))
      .filter((c) => (c.new_stock && c.new_stock !== c.old_stock) || (c.new_visibility && c.new_visibility !== c.old_visibility));
    if (!changes.length) return setReport('Các sản phẩm đã chọn đều đã đúng trạng thái này — không có gì để đổi.');
    const what = [newStock && `→ ${STOCK_LABEL[newStock]}`, newVis && `hiển thị: ${VISIBILITY_LABEL[newVis]}`].filter(Boolean).join(', ');
    if (!confirm(`Đổi ${changes.length} sản phẩm trên web (${what})?\nThay đổi có hiệu lực ngay; hoàn tác được trong mục Lịch sử.`)) return;

    start(async () => {
      const runId = crypto.randomUUID();
      setProgress({ done: 0, total: changes.length, label: 'Đang cập nhật' });
      const { okIds, errors } = await sendInChunks(runId, changes, (done) => setProgress({ done, total: changes.length, label: 'Đang cập nhật' }));
      setItems((prev) =>
        prev.map((p) =>
          okIds.has(p.id)
            ? { ...p, ...(newStock ? { stock_status: newStock } : {}), ...(newVis ? { catalog_visibility: newVis } : {}) }
            : p,
        ),
      );
      setProgress(null);
      setReport(`✓ Đã cập nhật ${okIds.size}/${changes.length} sản phẩm.${errors.length ? `\n✗ Lỗi:\n${errors.join('\n')}` : ''}`);
      router.refresh();
    });
  };

  const undo = (run: RunSummary) => {
    if (!confirm(`Hoàn tác lần cập nhật ${run.count} sản phẩm lúc ${fmt(run.at)}? Các sản phẩm sẽ trở về trạng thái trước đó.`)) return;
    start(async () => {
      const r = await getRunChanges(run.run_id);
      if (!r.ok) return setReport(`✗ ${r.error}`);
      setProgress({ done: 0, total: r.data.length, label: 'Đang hoàn tác' });
      const { okIds, errors } = await sendInChunks(
        crypto.randomUUID(),
        r.data,
        (done) => setProgress({ done, total: r.data.length, label: 'Đang hoàn tác' }),
        run.run_id,
      );
      if (!errors.length) await markUndone(run.run_id);
      const back = new Map(r.data.map((c) => [c.id, c]));
      setItems((prev) =>
        prev.map((p) => (okIds.has(p.id) ? { ...p, stock_status: back.get(p.id)!.new_stock!, catalog_visibility: back.get(p.id)!.new_visibility! } : p)),
      );
      setProgress(null);
      setReport(`✓ Đã hoàn tác ${okIds.size}/${r.data.length} sản phẩm.${errors.length ? `\n✗ Lỗi (lần này chưa đánh dấu đã hoàn tác, bấm lại để thử tiếp):\n${errors.join('\n')}` : ''}`);
      router.refresh();
    });
  };

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      {/* ───────── Chọn nguồn sản phẩm ───────── */}
      <div className="card settings wide">
        <div className="inline">
          <button className={mode === 'list' ? '' : 'ghost'} onClick={() => setMode('list')} disabled={busy}>Xem danh sách</button>
          <button className={mode === 'sku' ? '' : 'ghost'} onClick={() => setMode('sku')} disabled={busy}>Theo danh sách mã</button>
        </div>
        {mode === 'list' ? (
          <div className="inline">
            <select value={listFilter} onChange={(e) => setListFilter(e.target.value as StockStatus | 'all')} style={{ width: 'auto', marginTop: 0 }}>
              <option value="outofstock">Sản phẩm đang hết hàng</option>
              <option value="instock">Sản phẩm đang còn hàng</option>
              <option value="all">Tất cả sản phẩm đang bán</option>
            </select>
            <button onClick={loadList} disabled={busy}>Tải danh sách</button>
            <span className="meta">Lấy trực tiếp từ web (~5–10 giây cho 1.000 sản phẩm).</span>
          </div>
        ) : (
          <>
            <textarea
              rows={5}
              value={skuText}
              onChange={(e) => setSkuText(e.target.value)}
              placeholder={'Mỗi dòng một mã (dán thẳng cột mã từ Excel được), vd:\nFQ8687-446\nDV4342-401'}
            />
            <div className="inline">
              <button onClick={findSkus} disabled={busy || !skuText.trim()}>Kiểm tra</button>
              <span className="meta">Tối đa 500 mã mỗi lần.</span>
            </div>
          </>
        )}
        {loading && (
          <div className="meta">
            ⏳ Đang tải {loading.done}/{loading.total} sản phẩm…
          </div>
        )}
        {error && <div className="warn">✗ {error}</div>}
        {missing.length > 0 && (
          <div className="verify">
            <div className="label">Không tìm thấy {missing.length} mã trên web</div>
            {missing.join(', ')}
          </div>
        )}
      </div>

      {/* ───────── Danh sách + thao tác ───────── */}
      {items.length > 0 && (
        <>
          <div className="card settings wide stock-actions">
            <div className="inline wrap">
              <strong>Đã chọn {selected.size}</strong>
              <span className="meta">→ đổi thành:</span>
              <select value={newStock} onChange={(e) => setNewStock(e.target.value as StockStatus | '')} style={{ width: 'auto', marginTop: 0 }}>
                <option value="">Tình trạng: giữ nguyên</option>
                <option value="outofstock">Hết hàng</option>
                <option value="instock">Còn hàng</option>
              </select>
              <select value={newVis} onChange={(e) => setNewVis(e.target.value as Visibility | '')} style={{ width: 'auto', marginTop: 0 }}>
                <option value="">Hiển thị: giữ nguyên</option>
                {VIS.map((v) => (
                  <option key={v} value={v}>{VISIBILITY_LABEL[v]}</option>
                ))}
              </select>
              <button onClick={apply} disabled={busy || !selected.size || (!newStock && !newVis)}>Cập nhật lên web</button>
            </div>
            <div className="meta">
              Hiển thị: <strong>Cửa hàng & tìm kiếm</strong> = hiện bình thường · <strong>Chỉ khi tìm kiếm</strong> = không hiện trong danh mục nhưng khách
              vẫn tìm thấy · <strong>Ẩn</strong> = không hiện ở đâu (vẫn mở được bằng link trực tiếp).
            </div>
            {progress && (
              <div className="meta">
                ⏳ {progress.label} {progress.done}/{progress.total}…
                <progress value={progress.done} max={progress.total} style={{ width: 200, marginLeft: 8 }} />
              </div>
            )}
            {report && <pre className="run-log">{report}</pre>}
          </div>

          <div className="card">
            <div className="inline wrap" style={{ marginBottom: 10 }}>
              <input value={search} onChange={(e) => (setSearch(e.target.value), setPage(0))} placeholder="Lọc theo tên hoặc mã…" style={{ maxWidth: 280, marginTop: 0 }} />
              <select value={stockFilter} onChange={(e) => (setStockFilter(e.target.value), setPage(0))} style={{ width: 'auto', marginTop: 0 }}>
                <option value="">Mọi tình trạng</option>
                <option value="outofstock">Hết hàng</option>
                <option value="instock">Còn hàng</option>
              </select>
              <select value={visFilter} onChange={(e) => (setVisFilter(e.target.value as Visibility | ''), setPage(0))} style={{ width: 'auto', marginTop: 0 }}>
                <option value="">Mọi chế độ hiển thị</option>
                {VIS.map((v) => (
                  <option key={v} value={v}>{VISIBILITY_LABEL[v]} ({items.filter((p) => p.catalog_visibility === v).length})</option>
                ))}
              </select>
              <span className="meta">{filtered.length} sản phẩm</span>
              {selected.size > 0 && (
                <button className="link" onClick={() => setSelected(new Set())}>Bỏ chọn tất cả</button>
              )}
            </div>
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>
                      <input
                        type="checkbox"
                        title="Chọn tất cả sản phẩm đang lọc (mọi trang)"
                        checked={allFilteredSelected}
                        onChange={(e) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            filtered.forEach((p) => (e.target.checked ? next.add(p.id) : next.delete(p.id)));
                            return next;
                          })
                        }
                        style={{ width: 16, margin: 0 }}
                      />
                    </th>
                    <th>Sản phẩm ({allFilteredSelected ? `đã chọn cả ${filtered.length}` : 'ô trên cùng = chọn tất cả đang lọc'})</th>
                    <th>Tình trạng</th>
                    <th>Hiển thị</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.id} onClick={() => toggle(p.id)} style={{ cursor: 'pointer' }}>
                      <td>
                        <input type="checkbox" checked={selected.has(p.id)} readOnly style={{ width: 16, margin: 0 }} />
                      </td>
                      <td>
                        <a href={p.permalink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{p.name}</a>
                        <div className="meta">
                          {p.sku || 'không có mã'}
                          {p.status !== 'publish' && ` · ${p.status === 'draft' ? 'nháp' : p.status}`}
                        </div>
                      </td>
                      <td className={p.stock_status === 'outofstock' ? 'warn' : 'on'}>{STOCK_LABEL[p.stock_status] ?? p.stock_status}</td>
                      <td>{VISIBILITY_LABEL[p.catalog_visibility] ?? p.catalog_visibility}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="inline" style={{ marginTop: 10 }}>
                <button className="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Trước</button>
                <span className="meta">Trang {page + 1}/{pages}</span>
                <button className="ghost" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Sau ›</button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ───────── Lịch sử ───────── */}
      <h2>Lịch sử cập nhật</h2>
      <div className="card scroll">
        <table>
          <thead>
            <tr>
              <th>Lúc</th>
              <th>Ai</th>
              <th>Thay đổi</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {history.map((r) => (
              <tr key={r.run_id} className={r.undone ? 'off' : ''}>
                <td>{fmt(r.at)}</td>
                <td>{r.who}</td>
                <td>
                  {r.undoOf ? 'Hoàn tác: ' : ''}
                  {r.count} sản phẩm
                  {r.toOut > 0 && ` · ${r.toOut} → hết hàng`}
                  {r.toIn > 0 && ` · ${r.toIn} → còn hàng`}
                  {Object.entries(r.visibility).map(([v, n]) => ` · ${n} → ${VISIBILITY_LABEL[v as Visibility] ?? v}`)}
                  {r.undone && ' (đã hoàn tác)'}
                </td>
                <td>
                  {!r.undone && !r.undoOf && (
                    <button className="ghost small" disabled={busy} onClick={() => undo(r)}>Hoàn tác</button>
                  )}
                </td>
              </tr>
            ))}
            {!history.length && (
              <tr>
                <td colSpan={4} className="muted">Chưa có lần cập nhật nào.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
