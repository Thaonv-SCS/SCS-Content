'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { readSheet } from 'read-excel-file/browser';
import writeExcelFile from 'write-excel-file/browser';
import type { ProductType } from '@app/products/src/types.ts';
import { SPEC_FIELDS } from '@app/products/src/types.ts';
import { IMPORT_MAX_ROWS, importColumns, parseImport, rowsFromPaste, type ImportRow } from '@app/products/src/import.ts';
import { checkImportSkus, createImport } from '../actions';

const vnd = (n: number | null) => (n ? n.toLocaleString('vi-VN') : '');

/** Dòng ví dụ trong file mẫu, theo loại sản phẩm. */
const EXAMPLE: Record<ProductType, Record<string, string | number>> = {
  boots: {
    name: 'Nike Mercurial Vapor 16 Pro TF – Racer Blue',
    sku: 'FQ8687-446',
    price: 2900000,
    sizes: '39, 40, 40.5, 41, 42',
    color: 'xanh Racer Blue',
    'spec.line': 'Nike Mercurial Vapor 16',
    'spec.tier': 'Pro, phân khúc cao cấp',
    'spec.soleplate': 'TF',
    'spec.upper': 'sợi dệt Flyknit, phủ da tổng hợp',
  },
  ball: { name: 'Bóng adidas Trionda League', sku: 'JD8045', price: 990000, 'spec.line': 'adidas Trionda', 'spec.size': '5' },
  gloves: { name: 'Găng tay thủ môn Nike Vapor Grip3', sku: 'FB2999-100', price: 2500000, sizes: '8, 9, 10', 'spec.line': 'Nike Vapor Grip3' },
  accessory: { name: 'Tất chống trượt Kelme', sku: '8101WZ5001', price: 120000, 'spec.kind': 'tất chống trượt' },
};

type Mark = { onWeb?: string; inApp?: boolean };

export function ImportForm({ typeLabels }: { typeLabels: Record<ProductType, string> }) {
  const router = useRouter();
  const [type, setType] = useState<ProductType>('boots');
  const [table, setTable] = useState<unknown[][] | null>(null);
  const [source, setSource] = useState('');
  const [paste, setPaste] = useState('');
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [pending, start] = useTransition();

  const parsed = useMemo(() => (table ? parseImport(table, type) : null), [table, type]);
  const rows = parsed?.rows ?? [];
  const usable = (r: ImportRow) => !r.errors.length && !excluded.has(r.line);
  const chosen = rows.filter(usable);
  const tooMany = chosen.length > IMPORT_MAX_ROWS;

  /** Có bảng mới → kiểm tra mã trên web; mã đã có trên web / trong app thì bỏ chọn sẵn. */
  const loadTable = async (t: unknown[][], label: string) => {
    setError(null);
    setTable(t);
    setSource(label);
    setMarks({});
    const result = parseImport(t, type);
    if (result.error) return;
    const skus = result.rows.filter((r) => r.sku).map((r) => r.sku);
    if (!skus.length) return;
    setChecking(true);
    const res = await checkImportSkus(skus);
    setChecking(false);
    if (!res.ok) return setError(res.error);
    const m: Record<string, Mark> = {};
    res.onWeb.forEach((p) => (m[p.sku.toLowerCase()] = { ...m[p.sku.toLowerCase()], onWeb: `${p.name}${p.status !== 'publish' ? ` (${p.status === 'draft' ? 'nháp' : p.status})` : ''}` }));
    res.inApp.forEach((s) => (m[s.toLowerCase()] = { ...m[s.toLowerCase()], inApp: true }));
    setMarks(m);
    setExcluded(new Set(result.rows.filter((r) => m[r.sku.toLowerCase()]).map((r) => r.line)));
  };

  const downloadTemplate = () =>
    start(async () => {
      const cols = importColumns(type);
      const header = cols.map((c) => ({ value: c.required ? `${c.label} *` : c.label, fontWeight: 'bold' as const, backgroundColor: c.required ? '#FFE699' : '#E2EFDA' }));
      const example = cols.map((c) => EXAMPLE[type][c.key] ?? null);
      const hints = cols.map((c) => (c.hint ? `(${c.hint})` : null));
      await writeExcelFile([header, example, hints], { columns: cols.map((c) => ({ width: c.key === 'name' || c.key === 'notes' ? 40 : 22 })) }).toFile(
        `mau-nhap-${type}.xlsx`,
      );
    });

  const submit = (write: boolean) =>
    start(async () => {
      const res = await createImport(type, chosen, write);
      if (!res.ok) return setError(res.error);
      router.push(`/products/batch/${res.id}`);
    });

  const specCount = SPEC_FIELDS[type].length;

  return (
    <>
      <div className="card settings wide">
        <div className="inline wrap">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <strong>Loại sản phẩm</strong>
            <select value={type} onChange={(e) => setType(e.target.value as ProductType)} style={{ width: 'auto', marginTop: 0 }}>
              {(Object.keys(typeLabels) as ProductType[]).map((t) => (
                <option key={t} value={t}>{typeLabels[t]}</option>
              ))}
            </select>
          </label>
          <button type="button" className="ghost" onClick={downloadTemplate} disabled={pending}>⬇ Tải file mẫu ({typeLabels[type].toLowerCase()})</button>
        </div>
        <div className="meta">
          Bắt buộc: <strong>Tên sản phẩm, Mã sản phẩm, Giá bán</strong>. Các cột khác không bắt buộc — ô nào trống AI sẽ báo thiếu. Tên cột viết
          hoa / thường, có dấu hay không đều được. Dòng ví dụ và dòng gợi ý trong file mẫu nhớ xóa trước khi nhập.
        </div>

        <label>
          Chọn file Excel (.xlsx)
          <input
            type="file"
            accept=".xlsx"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                await loadTable(await readSheet(f), f.name);
              } catch (err) {
                setError(`Không đọc được file: ${(err as Error).message}`);
              }
              e.target.value = '';
            }}
          />
        </label>
        <label>
          …hoặc dán thẳng từ Excel (copy cả dòng tiêu đề)
          <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Tên sản phẩm	Mã sản phẩm	Giá bán	…" />
        </label>
        <div className="inline">
          <button type="button" className="ghost" disabled={!paste.trim() || checking} onClick={() => loadTable(rowsFromPaste(paste), 'dữ liệu dán')}>
            Đọc dữ liệu dán
          </button>
          {checking && <span className="meta">⏳ Đang kiểm tra mã trên web…</span>}
        </div>
        {error && <div className="warn">✗ {error}</div>}
        {parsed?.error && <div className="warn">✗ {parsed.error}</div>}
      </div>

      {parsed && !parsed.error && (
        <div className="card settings wide">
          <div className="meta">
            Từ {source}: {rows.length} dòng · {rows.filter((r) => r.errors.length).length} dòng lỗi · {Object.keys(marks).length} mã đã có
            {parsed.missingColumns.length > 0 && <span className="warn"> · Thiếu cột bắt buộc: {parsed.missingColumns.join(', ')}</span>}
            {parsed.ignoredColumns.length > 0 && <> · Bỏ qua cột không nhận ra: {parsed.ignoredColumns.join(', ')}</>}
          </div>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Dòng</th>
                  <th>Sản phẩm</th>
                  <th>Giá</th>
                  <th>Thông số</th>
                  <th>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const m = marks[r.sku.toLowerCase()];
                  const filled = Object.values(r.spec).filter(Boolean).length;
                  return (
                    <tr key={r.line} className={usable(r) ? '' : 'off'}>
                      <td>
                        <input
                          type="checkbox"
                          disabled={!!r.errors.length}
                          checked={usable(r)}
                          onChange={(e) =>
                            setExcluded((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.delete(r.line);
                              else next.add(r.line);
                              return next;
                            })
                          }
                          style={{ width: 16, margin: 0 }}
                        />
                      </td>
                      <td className="meta">{r.line}</td>
                      <td>
                        {r.name || '—'}
                        <div className="meta">
                          {r.sku || '—'}
                          {r.color && ` · ${r.color}`}
                          {r.sizes.length > 0 && ` · size ${r.sizes.join(', ')}`}
                        </div>
                      </td>
                      <td className="meta">
                        {vnd(r.price) || '—'}
                        {r.sale_price ? <div>KM {vnd(r.sale_price)}</div> : null}
                      </td>
                      <td className="meta">
                        {filled}/{specCount} ô
                      </td>
                      <td>
                        {r.errors.length > 0 && <span className="warn">✗ {r.errors.join('; ')}</span>}
                        {m?.onWeb && <div className="warn">⚠ Mã đã có trên web: {m.onWeb}</div>}
                        {m?.inApp && <div className="warn">⚠ Mã đã có trong app</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="inline wrap">
            <button disabled={pending || !chosen.length || tooMany} onClick={() => submit(true)}>
              {pending ? 'Đang lưu…' : `✍ Nhập & viết ${chosen.length} sản phẩm`}
            </button>
            <button className="ghost" disabled={pending || !chosen.length || tooMany} onClick={() => submit(false)}>Chỉ nhập</button>
            {chosen.length > 0 && (
              <span className="meta">
                ~${(chosen.length * 0.11).toFixed(2)} · khoảng {Math.ceil((chosen.length * 45) / 60)} phút (chạy nền, đóng trang được)
              </span>
            )}
            {tooMany && <span className="warn">Tối đa {IMPORT_MAX_ROWS} sản phẩm mỗi lần — bỏ chọn bớt hoặc chia file.</span>}
          </div>
          <div className="meta">Dòng có ⚠ được bỏ chọn sẵn (tránh tạo trùng) — tick lại nếu mày vẫn muốn viết lại nội dung cho sản phẩm đó.</div>
        </div>
      )}
    </>
  );
}
