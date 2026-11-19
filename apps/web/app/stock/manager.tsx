'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  STOCK_LABEL,
  VISIBILITY_LABEL,
  parseMoney,
  parseSaleCell,
  priceWarnings,
  roundTo10k,
  sortSizes,
  type StockItem,
  type StockStatus,
  type Visibility,
} from '@app/products/src/stock-types.ts';
import {
  applyStockChunk,
  getRunChanges,
  loadDuplicate405Page,
  loadSizeTerms,
  loadStockPage,
  lookupSkus,
  markUndone,
  type Change,
} from './actions';
import { SizeEditor } from './size-editor';
import { PriceEditor, type PriceDraft } from './price-editor';

/** Trạng thái lưu của một dòng (giá / size). */
function RowSaveCell({
  dirty,
  status,
  onSave,
}: {
  dirty: boolean;
  status?: { state: 'saving' | 'saved' | 'error'; msg?: string };
  onSave: () => void;
}) {
  if (status?.state === 'saving') return <span className="meta">⏳ Đang lưu…</span>;
  return (
    <>
      {status?.state === 'error' && (
        <div className="warn" style={{ fontSize: 12 }} title={status.msg}>
          ✗ {status.msg}
        </div>
      )}
      {dirty ? (
        <>
          <div className="warn" style={{ fontSize: 12 }}>● Đã thay đổi</div>
          <button className="small" onClick={onSave}>Lưu</button>
        </>
      ) : status?.state === 'saved' ? (
        <span className="on">✓ Đã lưu</span>
      ) : status?.state !== 'error' ? (
        <span className="meta">—</span>
      ) : null}
    </>
  );
}

export type RunSummary = {
  run_id: string;
  kind: string;
  at: string;
  who: string;
  count: number;
  toOut: number;
  toIn: number;
  visibility: Record<string, number>;
  saleOn: number;
  saleOff: number;
  regularChanged: number;
  undoOf: string | null;
  undone: boolean;
};

type Tab = 'stock' | 'price' | 'size';
type PriceOp = 'percent' | 'sale' | 'regular' | 'remove';

const PAGE = 100;
const CHUNK = 25;
const VIS = Object.keys(VISIBILITY_LABEL) as Visibility[];
const fmt = (iso: string) => new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' });
const num = (s: string) => parseMoney(s);

/** Gửi lần lượt từng phần lên web, báo tiến độ. */
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
      break; // lỗi cả phần (mất kết nối, bị chặn, dữ liệu sai…) → dừng; phần đã gửi vẫn có lịch sử
    }
    for (const r of res.data) {
      if (r.error) errors.push(`${part.find((c) => c.id === r.id)?.sku || r.id}: ${r.error}`);
      else okIds.add(r.id);
    }
    part.forEach((c) => !res.data.some((r) => r.id === c.id) && okIds.add(c.id)); // không cần đổi = coi như xong
    onProgress(Math.min(i + CHUNK, changes.length));
  }
  return { okIds, errors };
}

/** Áp kết quả đã gửi thành công vào danh sách đang hiện. */
function applyLocally(p: StockItem, c: Change): StockItem {
  if (c.kind === 'stock')
    return {
      ...p,
      ...(c.new_stock ? { stock_status: c.new_stock } : {}),
      ...(c.new_visibility ? { catalog_visibility: c.new_visibility } : {}),
      ...(c.new_sale !== undefined ? { sale_price: c.new_sale ? String(c.new_sale) : '' } : {}),
    };
  if (c.kind === 'price')
    return {
      ...p,
      ...(c.new_regular != null ? { regular_price: String(c.new_regular) } : {}),
      ...(c.new_sale !== undefined ? { sale_price: c.new_sale ? String(c.new_sale) : '' } : {}),
    };
  return { ...p, sizes: c.new_sizes ?? p.sizes };
}

export function StockManager({ history }: { history: RunSummary[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('stock');
  const [mode, setMode] = useState<'list' | 'sku'>('sku');
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

  // Tình trạng & hiển thị
  const [newStock, setNewStock] = useState<StockStatus | ''>('');
  const [newVis, setNewVis] = useState<Visibility | ''>('');
  // Giá
  const [priceOp, setPriceOp] = useState<PriceOp>('percent');
  const [priceValue, setPriceValue] = useState('');
  const [priceTable, setPriceTable] = useState('');
  // Size
  const [sizeTerms, setSizeTerms] = useState<string[] | null>(null);
  /** Giá đang sửa của từng mã (chưa lưu) và trạng thái lưu */
  const [priceDraft, setPriceDraft] = useState<Map<number, PriceDraft>>(new Map());
  const [priceStatus, setPriceStatus] = useState<Map<number, { state: 'saving' | 'saved' | 'error'; msg?: string }>>(new Map());
  /** Size đang sửa của từng mã (chưa lưu) và trạng thái lưu */
  const [sizeDraft, setSizeDraft] = useState<Map<number, string[]>>(new Map());
  const [sizeStatus, setSizeStatus] = useState<Map<number, { state: 'saving' | 'saved' | 'error'; msg?: string }>>(new Map());
  // Xem trước (giá / size / gộp size): id → thay đổi
  const [pending, setPending] = useState<Map<number, Change>>(new Map());
  const [pendingNote, setPendingNote] = useState<string | null>(null);

  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [pending_, start] = useTransition();
  const busy = !!loading || !!progress || pending_;

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
  const chosen = items.filter((p) => selected.has(p.id));

  const reset = (list: StockItem[], miss: string[] = [], selectAll = false) => {
    setItems(list);
    setMissing(miss);
    setSelected(new Set(selectAll ? list.map((p) => p.id) : []));
    setPage(0);
    setReport(null);
    setPending(new Map());
    setPendingNote(null);
    setSizeDraft(new Map());
    setSizeStatus(new Map());
    setPriceDraft(new Map());
    setPriceStatus(new Map());
  };

  /** Tải nhiều trang (3 trang cùng lúc) với thanh tiến độ. */
  const loadPages = async (loader: (page: number) => ReturnType<typeof loadStockPage>) => {
    setError(null);
    const first = await loader(1);
    if (!first.ok) return setError(first.error), null;
    const all = [...first.data.items];
    setLoading({ done: all.length, total: first.data.total });
    for (let p = 2; p <= first.data.totalPages; p += 3) {
      const batch = await Promise.all([p, p + 1, p + 2].filter((x) => x <= first.data.totalPages).map((x) => loader(x)));
      for (const r of batch) {
        if (!r.ok) {
          setLoading(null);
          return setError(r.error), null;
        }
        all.push(...r.data.items);
      }
      setLoading({ done: all.length, total: first.data.total });
    }
    setLoading(null);
    return all;
  };

  const loadList = () =>
    start(async () => {
      const all = await loadPages((p) => loadStockPage(listFilter, p));
      if (all) reset(all);
    });

  const findSkus = () =>
    start(async () => {
      setError(null);
      const r = await lookupSkus(skuText);
      if (!r.ok) return setError(r.error);
      reset(r.data.items, r.data.missing, true);
    });

  const openTab = (t: Tab) => {
    setTab(t);
    setPending(new Map());
    setPendingNote(null);
    setReport(null);
    if (t === 'size' && !sizeTerms)
      start(async () => {
        const r = await loadSizeTerms();
        if (r.ok) setSizeTerms(r.data);
        else setError(r.error);
      });
  };

  // ───────────── Giá: sửa trên từng dòng ─────────────

  const originalPrice = (p: StockItem): PriceDraft => ({ regular: num(p.regular_price), sale: num(p.sale_price) });
  const priceOf = (p: StockItem): PriceDraft => priceDraft.get(p.id) ?? originalPrice(p);
  const isPriceDirty = (p: StockItem) => {
    const d = priceDraft.get(p.id);
    const o = originalPrice(p);
    return !!d && (d.regular !== o.regular || d.sale !== o.sale);
  };
  const dirtyPriceItems = items.filter(isPriceDirty);

  const editPrice = (id: number, v: PriceDraft) => {
    setPriceDraft((prev) => new Map(prev).set(id, v));
    setPriceStatus((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  /** Lưu giá của một mã lên web (mỗi lần lưu là một dòng lịch sử, hoàn tác được). */
  const savePrice = async (p: StockItem) => {
    const d = priceDraft.get(p.id);
    if (!d) return;
    const o = originalPrice(p);
    if (!d.regular) return setPriceStatus((prev) => new Map(prev).set(p.id, { state: 'error', msg: 'Thiếu giá niêm yết' }));
    if (d.sale && d.sale >= d.regular)
      return setPriceStatus((prev) => new Map(prev).set(p.id, { state: 'error', msg: 'Giá sale phải nhỏ hơn giá niêm yết' }));
    setPriceStatus((prev) => new Map(prev).set(p.id, { state: 'saving' }));
    const change: Change = {
      id: p.id,
      sku: p.sku,
      name: p.name,
      kind: 'price',
      old_regular: o.regular,
      old_sale: o.sale,
      ...(d.regular !== o.regular ? { new_regular: d.regular } : {}),
      ...(d.sale !== o.sale ? { new_sale: d.sale } : {}),
    };
    const { okIds, errors } = await sendInChunks(crypto.randomUUID(), [change], () => {});
    if (okIds.has(p.id) && !errors.length) {
      setItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, regular_price: String(d.regular), sale_price: d.sale ? String(d.sale) : '' } : x)));
      setPriceDraft((prev) => {
        const next = new Map(prev);
        next.delete(p.id);
        return next;
      });
      setPriceStatus((prev) => new Map(prev).set(p.id, { state: 'saved' }));
    } else {
      setPriceStatus((prev) => new Map(prev).set(p.id, { state: 'error', msg: errors.join('; ') || 'Lỗi không rõ' }));
    }
  };

  /** Lưu mọi dòng đã sửa giá trong MỘT lần cập nhật (gửi theo lô 25, có thanh tiến độ, 1 dòng lịch sử, hoàn tác cả lần). */
  const saveAllPrices = () => {
    const bad = new Map<number, string>();
    const changes: Change[] = [];
    for (const p of dirtyPriceItems) {
      const d = priceOf(p);
      const o = originalPrice(p);
      if (!d.regular) bad.set(p.id, 'Thiếu giá niêm yết');
      else if (d.sale && d.sale >= d.regular) bad.set(p.id, 'Giá sale phải nhỏ hơn giá niêm yết');
      else
        changes.push({
          id: p.id,
          sku: p.sku,
          name: p.name,
          kind: 'price',
          old_regular: o.regular,
          old_sale: o.sale,
          ...(d.regular !== o.regular ? { new_regular: d.regular } : {}),
          ...(d.sale !== o.sale ? { new_sale: d.sale } : {}),
        });
    }
    if (bad.size) setPriceStatus((prev) => {
        const next = new Map(prev);
        bad.forEach((msg, id) => next.set(id, { state: 'error', msg }));
        return next;
      });
    if (!changes.length) return setReport(`✗ ${bad.size} dòng có lỗi giá (xem cột Lưu) — chưa lưu gì.`);
    const warned = changes.filter((c) => priceWarnings(c.new_regular ?? c.old_regular ?? null, c.new_sale !== undefined ? c.new_sale : (c.old_sale ?? null), c.old_regular ?? null).length).length;
    run(
      changes,
      `Lưu giá cho ${changes.length} sản phẩm lên web?${bad.size ? `\n(${bad.size} dòng có lỗi giá sẽ bỏ qua)` : ''}${warned ? `\n⚠ ${warned} sản phẩm có cảnh báo giá — xem lại các dòng có ⚠.` : ''}`,
      (ok) => {
        setPriceDraft((prev) => new Map([...prev].filter(([id]) => !ok.has(id))));
        setPriceStatus((prev) => {
          const next = new Map(prev);
          ok.forEach((id) => next.set(id, { state: 'saved' }));
          return next;
        });
      },
    );
  };

  /** Cách B: áp chung cho các mã đang chọn → điền vào ô giá từng dòng (chưa lưu). */
  const fillPriceForSelected = () => {
    const value = parseMoney(priceValue);
    if (priceOp !== 'remove' && !value) return setPendingNote('✗ Nhập số (% hoặc giá) trước.');
    if (priceOp === 'percent' && (value! <= 0 || value! >= 90)) return setPendingNote('✗ % giảm phải từ 1 đến 89.');
    const next = new Map(priceDraft);
    let filled = 0;
    let skipped = 0;
    for (const p of chosen) {
      const cur = priceOf(p);
      let v: PriceDraft;
      if (priceOp === 'percent') {
        if (!cur.regular) {
          skipped++;
          continue;
        }
        v = { ...cur, sale: roundTo10k(cur.regular * (1 - value! / 100)) };
      } else if (priceOp === 'sale') v = { ...cur, sale: value };
      else if (priceOp === 'regular') v = { ...cur, regular: value };
      else v = { ...cur, sale: null };
      next.set(p.id, v);
      filled++;
    }
    setPriceDraft(next);
    setPendingNote(
      `Đã điền giá mới vào ${filled} dòng${skipped ? ` · ${skipped} bỏ qua (chưa có giá niêm yết)` : ''}. Xem lại từng dòng rồi bấm Lưu (hoặc "Lưu tất cả").`,
    );
  };

  /** Cách A: dán bảng "mã | giá niêm yết | giá sale" → tìm mã chưa có, rồi điền vào ô giá từng dòng (chưa lưu). */
  const fillPriceTable = () =>
    start(async () => {
      const rows = priceTable
        .split(/\r?\n/)
        .map((l) => (l.includes('\t') ? l.split('\t') : l.split('|')).map((c) => c.trim()))
        .filter((c) => c[0] && !/^m[aã]/i.test(c[0]));
      if (!rows.length) return setPendingNote('✗ Chưa có dòng nào (mỗi dòng: mã | giá niêm yết | giá sale).');
      let list = items;
      const have = new Set(items.map((p) => p.sku.toLowerCase()));
      const need = rows.map((r) => r[0]!).filter((s) => !have.has(s.toLowerCase()));
      let miss: string[] = [];
      if (need.length) {
        const r = await lookupSkus(need.join('\n'));
        if (!r.ok) return setError(r.error);
        list = [...items, ...r.data.items];
        miss = r.data.missing;
        setItems(list);
      }
      const bySku = new Map(list.map((p) => [p.sku.toLowerCase(), p]));
      const next = new Map(priceDraft);
      const touched = new Set<number>();
      const errs: string[] = [];
      for (const [sku, regularCell = '', saleCell = ''] of rows) {
        const p = bySku.get(sku!.toLowerCase());
        if (!p) continue;
        const cur = next.get(p.id) ?? originalPrice(p);
        const v: PriceDraft = { ...cur };
        if (regularCell) {
          const r = parseMoney(regularCell);
          if (!r) {
            errs.push(`${sku}: giá niêm yết "${regularCell}" không hợp lệ`);
            continue;
          }
          v.regular = r;
        }
        const s = parseSaleCell(saleCell);
        if ('error' in s) {
          errs.push(`${sku}: ${s.error}`);
          continue;
        }
        if ('remove' in s) v.sale = null;
        if ('price' in s) v.sale = s.price;
        next.set(p.id, v);
        touched.add(p.id);
      }
      setPriceDraft(next);
      setSelected(touched);
      setMissing(miss);
      setPage(0);
      setPendingNote(
        `Đã điền giá vào ${touched.size} dòng — xem lại rồi bấm Lưu từng dòng hoặc "Lưu tất cả".${miss.length ? ` Không tìm thấy ${miss.length} mã.` : ''}${errs.length ? `\n✗ ${errs.join('\n✗ ')}` : ''}`,
      );
    });

  // ───────────── Xem trước: size ─────────────

  const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((s, i) => s === b[i]);
  const isDirty = (p: StockItem) => {
    const d = sizeDraft.get(p.id);
    return !!d && !sameList(sortSizes(d), sortSizes(p.sizes));
  };
  const dirtyItems = items.filter(isDirty);

  const editSize = (id: number, sizes: string[]) => {
    setSizeDraft((prev) => new Map(prev).set(id, sizes));
    setSizeStatus((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  /** Lưu size của một mã lên web (mỗi lần lưu là một dòng lịch sử, hoàn tác được). */
  const saveSize = async (p: StockItem) => {
    const draft = sizeDraft.get(p.id);
    if (!draft) return;
    setSizeStatus((prev) => new Map(prev).set(p.id, { state: 'saving' }));
    const change: Change = { id: p.id, sku: p.sku, name: p.name, kind: 'size', old_sizes: p.sizes, new_sizes: sortSizes(draft) };
    const { okIds, errors } = await sendInChunks(crypto.randomUUID(), [change], () => {});
    if (okIds.has(p.id) && !errors.length) {
      setItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, sizes: change.new_sizes! } : x)));
      setSizeDraft((prev) => {
        const next = new Map(prev);
        next.delete(p.id);
        return next;
      });
      setSizeStatus((prev) => new Map(prev).set(p.id, { state: 'saved' }));
    } else {
      setSizeStatus((prev) => new Map(prev).set(p.id, { state: 'error', msg: errors.join('; ') || 'Lỗi không rõ' }));
    }
  };

  /** Lưu mọi dòng đã sửa size trong MỘT lần cập nhật (gửi theo lô 25, có thanh tiến độ, hoàn tác cả lần). */
  const saveAllSizes = () =>
    run(
      dirtyItems.map((p) => ({ id: p.id, sku: p.sku, name: p.name, kind: 'size', old_sizes: p.sizes, new_sizes: sortSizes(sizeDraft.get(p.id)!) })),
      `Lưu size cho ${dirtyItems.length} sản phẩm lên web?`,
      (ok) => {
        setSizeDraft((prev) => new Map([...prev].filter(([id]) => !ok.has(id))));
        setSizeStatus((prev) => {
          const next = new Map(prev);
          ok.forEach((id) => next.set(id, { state: 'saved' }));
          return next;
        });
      },
    );

  const loadMerge405 = () =>
    start(async () => {
      const all = await loadPages((p) => loadDuplicate405Page(p));
      if (!all) return;
      reset(all, [], true);
      setPending(new Map(all.map((p) => [p.id, { id: p.id, sku: p.sku, name: p.name, kind: 'merge_size', old_sizes: p.sizes, new_sizes: p.sizes }])));
      setPendingNote(
        all.length
          ? `${all.length} sản phẩm đang dùng bản "40.5" trùng. Bấm Cập nhật để chuyển hết về một bản — size hiển thị không đổi, chỉ bộ lọc 40.5 trên web gom đủ sản phẩm.`
          : '✓ Không còn sản phẩm nào dùng bản 40.5 trùng.',
      );
    });

  // ───────────── Gửi lên web ─────────────

  const run = (changes: Change[], confirmText: string, onDone: (ok: Set<number>) => void) => {
    if (!changes.length) return setReport('Không có gì để đổi.');
    if (!confirm(`${confirmText}\nThay đổi có hiệu lực ngay trên web; hoàn tác được trong mục Lịch sử.`)) return;
    // Đặt ngoài start(): cập nhật trong transition bị hoãn tới lúc xong → thanh tiến độ phải hiện ngay khi bấm
    setProgress({ done: 0, total: changes.length, label: 'Đang cập nhật' });
    start(async () => {
      const runId = crypto.randomUUID();
      const { okIds, errors } = await sendInChunks(runId, changes, (done) => setProgress({ done, total: changes.length, label: 'Đang cập nhật' }));
      const byId = new Map(changes.map((c) => [c.id, c]));
      setItems((prev) => prev.map((p) => (okIds.has(p.id) && byId.has(p.id) ? applyLocally(p, byId.get(p.id)!) : p)));
      setProgress(null);
      setReport(`✓ Đã cập nhật ${okIds.size}/${changes.length} sản phẩm.${errors.length ? `\n✗ Lỗi:\n${errors.join('\n')}` : ''}`);
      onDone(okIds);
      router.refresh();
    });
  };

  const applyStock = () => {
    const changes: Change[] = chosen
      .map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        kind: 'stock' as const,
        old_stock: p.stock_status,
        old_visibility: p.catalog_visibility,
        ...(newStock ? { new_stock: newStock } : {}),
        ...(newVis ? { new_visibility: newVis } : {}),
        // Hết hàng → bỏ giá sale, về giá gốc (lưu giá sale cũ để Hoàn tác trả lại)
        ...(newStock === 'outofstock' && parseMoney(p.sale_price) ? { old_sale: parseMoney(p.sale_price), new_sale: null } : {}),
      }))
      .filter(
        (c) =>
          (c.new_stock && c.new_stock !== c.old_stock) ||
          (c.new_visibility && c.new_visibility !== c.old_visibility) ||
          c.new_sale === null,
      );
    if (!changes.length) return setReport('Các sản phẩm đã chọn đều đã đúng trạng thái này — không có gì để đổi.');
    const dropSale = changes.filter((c) => c.new_sale === null).length;
    const what = [
      newStock && `→ ${STOCK_LABEL[newStock]}`,
      newVis && `hiển thị: ${VISIBILITY_LABEL[newVis]}`,
      dropSale && `bỏ giá sale ${dropSale} sản phẩm, về giá gốc`,
    ]
      .filter(Boolean)
      .join(', ');
    run(changes, `Đổi ${changes.length} sản phẩm (${what})?`, () => {});
  };

  const applyPending = () => {
    const changes = [...pending.values()].filter((c) => selected.has(c.id));
    const warned = changes.filter(
      (c) => c.kind === 'price' && priceWarnings(c.new_regular ?? c.old_regular ?? null, c.new_sale !== undefined ? c.new_sale : (c.old_sale ?? null), c.old_regular ?? null).length,
    ).length;
    const label = changes[0]?.kind === 'merge_size' ? 'Gộp size 40.5 cho' : changes[0]?.kind === 'size' ? 'Đổi size' : 'Đổi giá';
    run(changes, `${label} ${changes.length} sản phẩm?${warned ? `\n⚠ ${warned} sản phẩm có cảnh báo giá — xem lại cột "Giá mới".` : ''}`, (ok) => {
      setPending((prev) => new Map([...prev].filter(([id]) => !ok.has(id))));
      setPendingNote(null);
    });
  };

  const undo = (r: RunSummary) => {
    if (!confirm(`Hoàn tác lần cập nhật ${r.count} sản phẩm lúc ${fmt(r.at)}? Các sản phẩm sẽ trở về như trước đó.`)) return;
    start(async () => {
      const res = await getRunChanges(r.run_id);
      if (!res.ok) return setReport(`✗ ${res.error}`);
      setProgress({ done: 0, total: res.data.length, label: 'Đang hoàn tác' });
      const { okIds, errors } = await sendInChunks(
        crypto.randomUUID(),
        res.data,
        (done) => setProgress({ done, total: res.data.length, label: 'Đang hoàn tác' }),
        r.run_id,
      );
      if (!errors.length) await markUndone(r.run_id);
      const back = new Map(res.data.map((c) => [c.id, c]));
      setItems((prev) => prev.map((p) => (okIds.has(p.id) && back.has(p.id) ? applyLocally(p, back.get(p.id)!) : p)));
      setProgress(null);
      setReport(`✓ Đã hoàn tác ${okIds.size}/${res.data.length} sản phẩm.${errors.length ? `\n✗ Lỗi (chưa đánh dấu đã hoàn tác, bấm lại để thử tiếp):\n${errors.join('\n')}` : ''}`);
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

  const pendingCount = [...pending.keys()].filter((id) => selected.has(id)).length;

  // ───────────── Giao diện ─────────────

  return (
    <>
      <div className="inline wrap" style={{ marginBottom: 12 }}>
        {(
          [
            ['stock', 'Tình trạng & hiển thị'],
            ['price', 'Giá'],
            ['size', 'Size'],
          ] as const
        ).map(([t, label]) => (
          <button key={t} className={tab === t ? '' : 'ghost'} onClick={() => openTab(t)} disabled={busy}>
            {label}
          </button>
        ))}
      </div>

      {/* ───────── Chọn sản phẩm ───────── */}
      <div className="card settings wide">
        <div className="inline">
          <button className={mode === 'sku' ? '' : 'ghost'} onClick={() => setMode('sku')} disabled={busy}>Theo danh sách mã</button>
          <button className={mode === 'list' ? '' : 'ghost'} onClick={() => setMode('list')} disabled={busy}>Xem danh sách</button>
        </div>
        {mode === 'list' ? (
          <div className="inline wrap">
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
              rows={4}
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
        {loading && <div className="meta">⏳ Đang tải {loading.done}/{loading.total} sản phẩm…</div>}
        {error && <div className="warn">✗ {error}</div>}
        {missing.length > 0 && (
          <div className="verify">
            <div className="label">Không tìm thấy {missing.length} mã trên web</div>
            {missing.join(', ')}
          </div>
        )}
      </div>

      {/* ───────── Thao tác theo mục ───────── */}
      {tab === 'price' && (
        <div className="card settings wide">
          <div className="label">Cách A — dán bảng giá từ Excel</div>
          <textarea
            rows={4}
            value={priceTable}
            onChange={(e) => setPriceTable(e.target.value)}
            placeholder={'mã | giá niêm yết | giá sale — mỗi dòng một mã, vd:\nFQ8687-446 | 2950000 | 2500000\nDV4342-401 |  | 1990000      (giá niêm yết trống = giữ nguyên)\nIV2368-800 | 4200000 | 0      (giá sale 0 hoặc - = bỏ giảm giá)'}
          />
          <div className="inline">
            <button className="ghost" onClick={fillPriceTable} disabled={busy || !priceTable.trim()}>Điền vào bảng</button>
            <span className="meta">Ô trống = giữ nguyên giá đang có. Mã chưa có trong danh sách sẽ tự tìm trên web.</span>
          </div>
          <div className="label">Cách B — áp chung cho các mã đang chọn ({selected.size})</div>
          <div className="inline wrap">
            <select value={priceOp} onChange={(e) => setPriceOp(e.target.value as PriceOp)} style={{ width: 'auto', marginTop: 0 }}>
              <option value="percent">Giảm % so với giá niêm yết</option>
              <option value="sale">Đặt giá sale bằng</option>
              <option value="regular">Đặt giá niêm yết bằng</option>
              <option value="remove">Bỏ giảm giá (bán giá niêm yết)</option>
            </select>
            {priceOp !== 'remove' && (
              <input
                value={priceValue}
                onChange={(e) => setPriceValue(e.target.value)}
                placeholder={priceOp === 'percent' ? 'vd 15' : 'vd 990000'}
                style={{ width: 140, marginTop: 0 }}
              />
            )}
            <button className="ghost" onClick={fillPriceForSelected} disabled={busy || !selected.size}>Điền vào các dòng đã chọn</button>
            {priceOp === 'percent' && <span className="meta">Giá sale làm tròn đến 10.000đ.</span>}
          </div>
          <div className="meta">
            Hoặc sửa thẳng ô giá trên từng dòng bên dưới (giá sale để trống = không giảm giá) → bấm <strong>Lưu</strong> cuối dòng. Cách A / B chỉ điền sẵn
            giá vào các dòng, chưa lưu lên web.
          </div>
        </div>
      )}

      {tab === 'size' && (
        <div className="card settings wide">
          <div className="meta">
            Dán mã ở trên → <strong>Kiểm tra</strong> → bấm vào <strong>ô size</strong> của từng sản phẩm để bỏ size (nút ×) hoặc thêm size từ danh sách →
            bấm <strong>Lưu</strong> ở cuối dòng. Chỉ chọn được size có sẵn trên web; gõ "40,5" hay "40½" đều tìm ra 40.5.
          </div>
          {sizeTerms && (
            <details>
              <summary className="meta">Danh sách {sizeTerms.length} size có trên web</summary>
              <div className="meta">{sortSizes(sizeTerms).join(' · ')}</div>
            </details>
          )}
          <div className="verify">
            <div className="label">Gộp size 40.5 bị trùng</div>
            Web đang có 2 bản "40.5" khác nhau nên bộ lọc size 40.5 chỉ ra khoảng một nửa số giày. Bấm để tải các sản phẩm đang dùng bản trùng rồi
            chuyển hết về một bản (size hiển thị không đổi).
            <div className="inline" style={{ marginTop: 6 }}>
              <button className="ghost" onClick={loadMerge405} disabled={busy}>Tải danh sách cần gộp 40.5</button>
            </div>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="card settings wide stock-actions">
            {tab === 'stock' ? (
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
                <button onClick={applyStock} disabled={busy || !selected.size || (!newStock && !newVis)}>Cập nhật lên web</button>
              </div>
            ) : (
              <div className="inline wrap">
                {tab === 'size' && dirtyItems.length > 0 && (
                  <button onClick={saveAllSizes} disabled={busy}>Lưu tất cả {dirtyItems.length} mã đã sửa size</button>
                )}
                {tab === 'price' && dirtyPriceItems.length > 0 && (
                  <button onClick={saveAllPrices} disabled={busy}>Lưu tất cả {dirtyPriceItems.length} mã đã sửa giá</button>
                )}
                {pending.size > 0 && (
                  <button onClick={applyPending} disabled={busy || !pendingCount}>Cập nhật {pendingCount || ''} sản phẩm lên web</button>
                )}
                {pending.size > 0 && (
                  <button className="link" onClick={() => (setPending(new Map()), setPendingNote(null))} disabled={busy}>Xóa xem trước</button>
                )}
              </div>
            )}
            {tab === 'stock' && (
              <div className="meta">
                Hiển thị: <strong>Cửa hàng & tìm kiếm</strong> = hiện bình thường · <strong>Chỉ khi tìm kiếm</strong> = không hiện trong danh mục nhưng khách vẫn tìm
                thấy · <strong>Ẩn</strong> = không hiện ở đâu (vẫn mở được bằng link trực tiếp).
              </div>
            )}
            {pendingNote && tab !== 'stock' && <pre className="run-log">{pendingNote}</pre>}
            {progress && (
              <div className="meta">
                ⏳ {progress.label} {progress.done}/{progress.total}…
                <progress value={progress.done} max={progress.total} style={{ width: 200, marginLeft: 8 }} />
              </div>
            )}
            {report && <pre className="run-log">{report}</pre>}
          </div>

          {/* Thanh lưu nổi ở đáy màn hình: luôn thấy dù đã kéo xuống cuối bảng */}
          {((tab === 'price' && dirtyPriceItems.length > 0) || (tab === 'size' && dirtyItems.length > 0) || progress) && (
            <div className="save-bar">
              {progress ? (
                <span>
                  ⏳ {progress.label} {progress.done}/{progress.total}…
                  <progress value={progress.done} max={progress.total} style={{ width: 160, marginLeft: 8 }} />
                </span>
              ) : (
                <>
                  <span>
                    ● {tab === 'price' ? dirtyPriceItems.length : dirtyItems.length} mã đã sửa {tab === 'price' ? 'giá' : 'size'}, chưa lưu
                  </span>
                  <button onClick={tab === 'price' ? saveAllPrices : saveAllSizes} disabled={busy}>
                    Lưu tất cả
                  </button>
                </>
              )}
            </div>
          )}

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
              {selected.size > 0 && <button className="link" onClick={() => setSelected(new Set())}>Bỏ chọn tất cả</button>}
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
                    {tab === 'stock' && (
                      <>
                        <th>Tình trạng</th>
                        <th>Hiển thị</th>
                      </>
                    )}
                    {tab === 'price' && (
                      <>
                        <th>Giá (sửa trực tiếp)</th>
                        <th>Lưu</th>
                      </>
                    )}
                    {tab === 'size' && (
                      <>
                        <th>Size (bấm để sửa)</th>
                        <th>Lưu</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => {
                    const c = pending.get(p.id);
                    const reg = num(p.regular_price);
                    const sale = num(p.sale_price);
                    return (
                      <tr
                        key={p.id}
                        onClick={tab === 'stock' ? () => toggle(p.id) : undefined}
                        style={{ cursor: tab === 'stock' ? 'pointer' : 'default' }}
                        className={(tab === 'size' && isDirty(p)) || (tab === 'price' && isPriceDirty(p)) ? 'row-dirty' : ''}
                      >
                        <td onClick={tab === 'stock' ? undefined : () => toggle(p.id)} style={{ cursor: 'pointer' }}>
                          <input type="checkbox" checked={selected.has(p.id)} readOnly style={{ width: 16, margin: 0 }} />
                        </td>
                        <td>
                          <a href={p.permalink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{p.name}</a>
                          <div className="meta">
                            {p.sku || 'không có mã'}
                            {p.status !== 'publish' && ` · ${p.status === 'draft' ? 'nháp' : p.status}`}
                          </div>
                        </td>
                        {tab === 'stock' && (
                          <>
                            <td className={p.stock_status === 'outofstock' ? 'warn' : 'on'}>{STOCK_LABEL[p.stock_status] ?? p.stock_status}</td>
                            <td>{VISIBILITY_LABEL[p.catalog_visibility] ?? p.catalog_visibility}</td>
                          </>
                        )}
                        {tab === 'price' && (
                          <>
                            <td>
                              <PriceEditor
                                value={priceOf(p)}
                                original={{ regular: reg, sale }}
                                disabled={priceStatus.get(p.id)?.state === 'saving'}
                                onChange={(v) => editPrice(p.id, v)}
                              />
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <RowSaveCell
                                dirty={isPriceDirty(p)}
                                status={priceStatus.get(p.id)}
                                onSave={() => void savePrice(p).then(() => router.refresh())}
                              />
                            </td>
                          </>
                        )}
                        {tab === 'size' && (
                          <>
                            <td>
                              {c?.kind === 'merge_size' ? (
                                <span className="meta">{p.sizes.join(', ')} · chờ gộp 40.5</span>
                              ) : (
                                <SizeEditor
                                  value={sizeDraft.get(p.id) ?? p.sizes}
                                  original={p.sizes}
                                  terms={sizeTerms}
                                  disabled={sizeStatus.get(p.id)?.state === 'saving'}
                                  onChange={(v) => editSize(p.id, v)}
                                />
                              )}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <RowSaveCell
                                dirty={isDirty(p)}
                                status={sizeStatus.get(p.id)}
                                onSave={() => void saveSize(p).then(() => router.refresh())}
                              />
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
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
                  {r.kind === 'price' ? 'Giá · ' : r.kind === 'size' ? 'Size · ' : r.kind === 'merge_size' ? 'Gộp size 40.5 · ' : ''}
                  {r.count} sản phẩm
                  {r.toOut > 0 && ` · ${r.toOut} → hết hàng`}
                  {r.toIn > 0 && ` · ${r.toIn} → còn hàng`}
                  {Object.entries(r.visibility).map(([v, n]) => ` · ${n} → ${VISIBILITY_LABEL[v as Visibility] ?? v}`)}
                  {r.regularChanged > 0 && ` · ${r.regularChanged} đổi giá niêm yết`}
                  {r.saleOn > 0 && ` · ${r.saleOn} đặt giá sale`}
                  {r.saleOff > 0 && ` · ${r.saleOff} bỏ giảm giá`}
                  {r.undone && ' (đã hoàn tác)'}
                </td>
                <td>
                  {!r.undone && !r.undoOf && r.kind !== 'merge_size' && (
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
