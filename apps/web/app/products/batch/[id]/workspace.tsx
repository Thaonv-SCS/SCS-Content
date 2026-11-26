'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProductType, ResearchResult, SpecField } from '@app/products';
import { variantName } from '@app/products/src/batch.ts';
import type { CategoryOption } from '@/lib/categories';
import {
  addVariants,
  applyBatchFacts,
  deleteBatch,
  pushDraft,
  researchBatch,
  setBatchCategories,
  updateBatchSpec,
  writeBatch,
} from '../../actions';
import { BatchBasicFields, SpecInputs } from '../../spec-fields';
import { VariantsInput } from '../variants-input';

export type BatchView = {
  id: string;
  kind: "variants" | "import";
  type: ProductType;
  base_name: string;
  price: number | null;
  sale_price: number | null;
  sizes: string[];
  spec: Record<string, string>;
  notes: string | null;
  research: ResearchResult | null;
  job: 'generate' | 'research' | null;
  job_status: 'idle' | 'queued' | 'running' | 'done' | 'failed';
  job_error: string | null;
};

export type VariantRow = {
  id: string;
  name: string;
  sku: string | null;
  price: number | null;
  sale_price: number | null;
  sizes: string[];
  category_ids: number[];
  suggested: number[];
  job_status: string;
  job_error: string | null;
  written: boolean;
  woo_edit_url: string | null;
};

const vnd = (n: number | null) => (n ? n.toLocaleString('vi-VN') : '—');
const isBusy = (s: string) => s === 'queued' || s === 'running';

export function BatchWorkspace({
  batch: b,
  variants,
  fields,
  typeLabel,
  categories,
}: {
  batch: BatchView;
  variants: VariantRow[];
  fields: SpecField[];
  typeLabel: string;
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const busy = isBusy(b.job_status) || variants.some((v) => isBusy(v.job_status));
  const isImport = b.kind === "import";
  const unit = isImport ? "sản phẩm" : "màu";

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [busy, router]);

  const [specError, saveSpec, savingSpec] = useActionState(updateBatchSpec.bind(null, b.id), null);
  const [factsError, doApply, applying] = useActionState(applyBatchFacts.bind(null, b.id), null);
  const [addError, doAdd, adding] = useActionState(addVariants.bind(null, b.id), null);
  const [newVariants, setNewVariants] = useState('');
  const [pending, start] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [pushLog, setPushLog] = useState<string[]>([]);

  const open = variants.filter((v) => !v.woo_edit_url);
  const unwritten = open.filter((v) => !v.written).length;
  // Danh mục chung: lấy theo màu đầu tiên chưa đẩy (thường mọi màu giống nhau)
  const firstOpen = open.find((v) => v.written) ?? open[0];
  const [cats, setCats] = useState<number[]>(firstOpen?.category_ids ?? []);
  const suggested = new Set(firstOpen?.suggested ?? []);
  const ready = open.filter((v) => v.written && v.category_ids.length);

  const pushAll = () =>
    start(async () => {
      const log: string[] = [];
      for (const v of ready) {
        log.push(`⏳ ${v.name}…`);
        setPushLog([...log]);
        const err = await pushDraft(v.id);
        log[log.length - 1] = err ? `${err.startsWith('⚠') || err.startsWith('✓') ? '' : '✗ '}${v.name}: ${err}` : `✓ ${v.name}`;
        setPushLog([...log]);
      }
      router.refresh();
    });

  const status = (v: VariantRow) =>
    v.woo_edit_url ? (
      <a href={v.woo_edit_url} target="_blank" rel="noreferrer">✓ Đã tạo nháp</a>
    ) : v.job_status === 'queued' ? (
      '⏳ Chờ viết'
    ) : v.job_status === 'running' ? (
      '⏳ Đang viết'
    ) : v.job_status === 'failed' ? (
      <span className="warn" title={v.job_error ?? ''}>✗ Lỗi</span>
    ) : v.written ? (
      'Đã viết'
    ) : (
      'Chưa viết'
    );

  return (
    <>
      <div className="inline title-row">
        <h1>{b.base_name}</h1>
        <span className="badge">{typeLabel}</span>
        <span className="badge">{variants.length} {unit}</span>
      </div>

      {isBusy(b.job_status) && (
        <div className="card status-line">
          ⏳ {b.job === 'research' ? 'Đang tìm thêm thông tin trên web…' : 'AI đang viết lần lượt từng ' + unit + ' (~45 giây mỗi cái, trang tự cập nhật, đóng trang được)…'}
        </div>
      )}
      {b.job_status === 'failed' && <div className="card status-line warn">✗ {b.job_error}</div>}
      {actionError && <div className="card status-line warn">✗ {actionError}</div>}

      <div className="workspace">
        {/* ───────── Cột trái: phiếu chung (lô nhiều màu) / hướng dẫn (lô nhập Excel) ───────── */}
        {isImport ? (
          <section>
            <h2>Nhập từ Excel</h2>
            <div className="card settings wide">
              <p>Mỗi sản phẩm có phiếu thông số và danh mục riêng. Bấm vào tên sản phẩm để:</p>
              <ul className="preview">
                <li>sửa phiếu, bấm "Tìm thêm thông tin" nếu phiếu còn thiếu;</li>
                <li>xem bài viết, sửa tay hoặc viết lại;</li>
                <li>kiểm tra danh mục AI gợi ý (★) trước khi tạo nháp.</li>
              </ul>
              <p className="meta">
                Danh mục mỗi sản phẩm được đặt sẵn theo gợi ý của AI ngay khi viết xong — nút "Tạo nháp" bên phải dùng đúng danh mục của từng sản
                phẩm.
              </p>
            </div>
          </section>
        ) : (
        <section>
          <h2>Phiếu chung của lô</h2>
          <form action={saveSpec} className="card settings wide">
            <BatchBasicFields initial={b} />
            <SpecInputs fields={fields} values={b.spec} notes={b.notes} />
            <p className="meta">
              Lưu sẽ áp thông số + ý chính xuống mọi màu chưa đẩy lên web. Giá / size từng màu sửa trong trang của màu đó.
            </p>
            <div className="inline">
              <button
                type="submit"
                name="regenerate"
                value="1"
                disabled={savingSpec || busy}
                onClick={(e) => {
                  if (!confirm(`Viết lại ${open.length} màu chưa đẩy lên web? (~$${(open.length * 0.11).toFixed(2)})`)) e.preventDefault();
                }}
              >
                Lưu & viết lại tất cả
              </button>
              <button type="submit" className="ghost" disabled={savingSpec}>Chỉ lưu phiếu</button>
              {specError && <span className="warn">{specError}</span>}
            </div>
          </form>

          <h2>Tìm thêm thông tin (1 lần cho cả lô)</h2>
          <div className="card settings wide">
            <div className="inline">
              <button className="ghost" disabled={busy || pending} onClick={() => start(async () => setActionError(await researchBatch(b.id)))}>
                🔎 Tìm trên web theo tên chung
              </button>
              <span className="meta">~$0.15–0.2 · thay vì tìm riêng từng màu</span>
            </div>
            {b.research && (
              <form action={doApply} className="settings">
                {b.research.facts.length ? (
                  <>
                    <div className="meta">Tick thông tin đúng để thêm vào phiếu chung (áp cho mọi màu chưa đẩy):</div>
                    {b.research.facts.map((f, i) => (
                      <label key={i} className="switch-row">
                        <input type="checkbox" name="fact" value={i} />
                        <span>
                          <strong>{fields.find((x) => x.key === f.field)?.label ?? 'Khác'}:</strong> {f.value}
                          <a className="meta" href={f.source_url} target="_blank" rel="noreferrer">{f.source_title || f.source_url}</a>
                        </span>
                      </label>
                    ))}
                    <div className="inline">
                      <button type="submit" className="ghost" disabled={applying}>Thêm vào phiếu</button>
                      {factsError && <span className="warn">{factsError}</span>}
                    </div>
                  </>
                ) : (
                  <p className="meta">Không tìm thấy thông tin có nguồn rõ ràng.</p>
                )}
              </form>
            )}
          </div>

          <h2>Thêm màu</h2>
          <form
            action={async (fd) => {
              await doAdd(fd);
              setNewVariants('');
            }}
            className="card settings wide"
          >
            <VariantsInput value={newVariants} onChange={setNewVariants} preview={(v) => variantName(b.base_name, v)} />
            <div className="inline">
              <button type="submit" className="ghost" disabled={adding || !newVariants.trim()}>Thêm vào lô</button>
              {addError && <span className="warn">{addError}</span>}
            </div>
          </form>
        </section>
        )}

        {/* ───────── Cột phải: các màu / các sản phẩm ───────── */}
        <section>
          <h2>{isImport ? "Các sản phẩm" : "Các màu"}</h2>
          <div className="card scroll">
            <table>
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th>Giá</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <Link href={`/products/${v.id}`}>{v.name}</Link>
                      <div className="meta">Size: {v.sizes.join(', ') || '—'}</div>
                    </td>
                    <td className="meta">
                      {vnd(v.price)}
                      {v.sale_price ? <div>KM {vnd(v.sale_price)}</div> : null}
                    </td>
                    <td>{status(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="inline" style={{ marginTop: 10 }}>
            <button disabled={busy || pending || !unwritten} onClick={() => start(async () => setActionError(await writeBatch(b.id, 'missing')))}>
              ✍ Viết {unwritten || ''} {unit} chưa có bài
            </button>
            <span className="meta">~${(unwritten * 0.11).toFixed(2)}</span>
          </div>

          <h2>Danh mục & bản nháp WooCommerce</h2>
          <div className="card settings wide">
            {isImport ? (
              <div className="meta">Mỗi sản phẩm dùng danh mục riêng (AI gợi ý, chỉnh trong trang từng sản phẩm).</div>
            ) : (
              <div className="meta">Áp cho mọi màu chưa đẩy lên web. Danh mục AI gợi ý được đánh dấu ★.</div>
            )}
            {!isImport && <div className="cat-list">
              {categories.map((c) => (
                <label key={c.id} className="switch-row">
                  <input
                    type="checkbox"
                    checked={cats.includes(c.id)}
                    disabled={!open.length}
                    onChange={(e) => {
                      const next = e.target.checked ? [...cats, c.id] : cats.filter((x) => x !== c.id);
                      setCats(next);
                      start(() => setBatchCategories(b.id, next));
                    }}
                  />
                  <span>
                    {c.path} {suggested.has(c.id) && '★'}
                  </span>
                </label>
              ))}
            </div>}
            <div className="inline">
              <button
                disabled={pending || busy || !ready.length}
                onClick={() => {
                  if (confirm(`Tạo ${ready.length} sản phẩm NHÁP trên website? (Chưa đăng — vẫn phải vào WordPress thêm ảnh và bấm Đăng)`)) pushAll();
                }}
              >
                Tạo nháp {ready.length || ''} {unit} trên WooCommerce
              </button>
              <span className="meta">Chỉ những {unit} đã viết và có danh mục.</span>
            </div>
            {pushLog.length > 0 && <pre className="run-log">{pushLog.join('\n')}</pre>}
          </div>

          <p>
            <button
              className="link"
              onClick={() => {
                if (confirm(`Xóa lô "${b.base_name}" và ${variants.length} ${unit} khỏi app? (Không ảnh hưởng sản phẩm trên website)`))
                  start(() => deleteBatch(b.id, true));
              }}
            >
              Xóa lô này
            </button>
          </p>
        </section>
      </div>
    </>
  );
}
