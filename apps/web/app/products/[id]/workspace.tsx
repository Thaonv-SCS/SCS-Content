'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProductOutput, ProductType, ResearchResult, SpecField } from '@app/products';
import { applyFacts, deleteProduct, pushDraft, regenerate, research, saveOutputEdit, setCategories, updateSpec } from '../actions';
import { BasicFields, SpecInputs } from '../spec-fields';

import type { CategoryOption } from "@/lib/categories";
export type { CategoryOption };

export type ProductView = {
  id: string;
  type: ProductType;
  name: string;
  sku: string | null;
  price: number | null;
  sale_price: number | null;
  color: string | null;
  batch_id: string | null;
  batch_name: string | null;
  sizes: string[];
  spec: Record<string, string>;
  notes: string | null;
  research: ResearchResult | null;
  output: ProductOutput | null;
  category_ids: number[];
  job: 'generate' | 'research' | null;
  job_status: 'idle' | 'queued' | 'running' | 'done' | 'failed';
  job_error: string | null;
  woo_edit_url: string | null;
  pushed_at: string | null;
};

function Copy({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="ghost small"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? 'Đã copy' : label}
    </button>
  );
}

/** Xem trước HTML trong khung riêng (không chạy script, không ảnh hưởng giao diện app). */
function Preview({ html }: { html: string }) {
  const doc = `<!doctype html><meta charset="utf-8"><style>
    body{font:15px/1.6 system-ui,sans-serif;margin:12px;color:#222}
    table{border-collapse:collapse;width:100%;margin-bottom:14px}
    td{border:1px solid #ccc;padding:4px 8px;vertical-align:top} td p{margin:0}
    a{color:#0a58ca}</style>${html}`;
  return <iframe className="preview-frame" sandbox="" srcDoc={doc} title="Xem trước" />;
}

function Field({ label, value, hint, children }: { label: string; value: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="out-field">
      <div className="label">
        {label}
        {hint && <span className="meta">{hint}</span>}
        <Copy text={value} />
      </div>
      {children ?? <div className="out-value">{value || '—'}</div>}
    </div>
  );
}

export function Workspace({
  product: p,
  fields,
  typeLabel,
  categories,
}: {
  product: ProductView;
  fields: SpecField[];
  typeLabel: string;
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const busy = p.job_status === 'queued' || p.job_status === 'running';
  const o = p.output;

  // Đang viết / đang tìm → tự làm mới để hiện kết quả khi xong
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [busy, router]);

  const [specError, saveSpec, savingSpec] = useActionState(updateSpec.bind(null, p.id), null);
  const [regenError, doRegen, regenerating] = useActionState(regenerate.bind(null, p.id), null);
  const [factsError, doApply, applying] = useActionState(applyFacts.bind(null, p.id), null);
  const [editError, doEdit, savingEdit] = useActionState(
    async (prev: string | null, fd: FormData) => {
      const err = await saveOutputEdit(p.id, prev, fd);
      if (!err) setEditing(false);
      return err;
    },
    null,
  );
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [cats, setCats] = useState<number[]>(p.category_ids);
  const suggested = new Set(o?.suggested_category_ids ?? []);

  const titleLen = o?.seo_title.length ?? 0;
  const metaLen = o?.meta_description.length ?? 0;

  return (
    <>
      <div className="inline title-row">
        <h1>{p.name}</h1>
        <span className="badge">{typeLabel}</span>
        {p.sku && <span className="badge">{p.sku}</span>}
      </div>
      {p.batch_id && (
        <p className="meta">
          Thuộc lô nhiều màu: <Link href={`/products/batch/${p.batch_id}`}>{p.batch_name ?? 'xem lô'}</Link> — sửa thông số chung ở trang lô để áp cho mọi màu.
        </p>
      )}

      {busy && (
        <div className="card status-line">
          ⏳ {p.job === 'research' ? 'Đang tìm thêm thông tin trên web…' : 'AI đang viết nội dung…'} (30–60 giây, trang tự cập nhật)
        </div>
      )}
      {p.job_status === 'failed' && <div className="card status-line warn">✗ Lỗi: {p.job_error}</div>}
      {actionError && (
        <div className="card status-line warn">{actionError.startsWith('⚠') ? actionError : `✗ ${actionError}`}</div>
      )}

      <div className="workspace">
        {/* ───────── Cột trái: phiếu nhập + tìm thêm ───────── */}
        <section>
          <h2>Phiếu nhập</h2>
          <form action={saveSpec} className="card settings wide">
            <BasicFields initial={p} />
            <SpecInputs fields={fields} values={p.spec} notes={p.notes} />
            <div className="inline">
              <button type="submit" name="regenerate" value="1" disabled={savingSpec || busy}>Lưu & viết lại</button>
              <button type="submit" className="ghost" disabled={savingSpec}>Chỉ lưu phiếu</button>
              {specError && <span className="warn">{specError}</span>}
            </div>
          </form>

          <h2>Tìm thêm thông tin</h2>
          <div className="card settings wide">
            <div className="inline">
              <button
                className="ghost"
                disabled={busy || pending}
                onClick={() => start(async () => setActionError(await research(p.id)))}
              >
                🔎 Tìm trên web theo tên & mã
              </button>
              <span className="meta">~$0.15–0.2 mỗi lần · chỉ dùng khi phiếu còn thiếu</span>
            </div>
            {p.research && (
              <form action={doApply} className="settings">
                {p.research.facts.length ? (
                  <>
                    <div className="meta">Tick thông tin đúng để thêm vào phiếu (ô trống thì điền, ô đã có thì nối thêm):</div>
                    {p.research.facts.map((f, i) => (
                      <label key={i} className="switch-row">
                        <input type="checkbox" name="fact" value={i} />
                        <span>
                          <strong>{fields.find((x) => x.key === f.field)?.label ?? 'Khác'}:</strong> {f.value}
                          <a className="meta" href={f.source_url} target="_blank" rel="noreferrer">
                            {f.source_title || f.source_url}
                          </a>
                        </span>
                      </label>
                    ))}
                    <div className="inline">
                      <button type="submit" className="ghost" disabled={applying}>Thêm vào phiếu</button>
                      {factsError && <span className="warn">{factsError}</span>}
                    </div>
                  </>
                ) : (
                  <p className="meta">Không tìm thấy thông tin có nguồn rõ ràng — sản phẩm có thể chưa có trên mạng.</p>
                )}
              </form>
            )}
          </div>
        </section>

        {/* ───────── Cột phải: kết quả ───────── */}
        <section>
          <h2>Nội dung cho WooCommerce</h2>
          {!o ? (
            <div className="card muted">{busy ? 'Đang viết…' : 'Chưa có bản viết.'}</div>
          ) : editing ? (
            <form action={doEdit} className="card settings wide">
              {(
                [
                  ['seo_title', 'Tiêu đề SEO (Yoast)', o.seo_title, 1],
                  ['meta_description', 'Meta description (Yoast)', o.meta_description, 3],
                  ['focus_keyphrase', 'Từ khóa chính (Yoast)', o.focus_keyphrase, 1],
                  ['slug', 'Đường dẫn (slug)', o.slug, 1],
                  ['tags', 'Tags (cách nhau bằng dấu phẩy)', o.tags.join(', '), 2],
                  ['short_description_html', 'Mô tả ngắn (HTML)', o.short_description_html, 4],
                  ['description_html', 'Mô tả (HTML)', o.description_html, 18],
                ] as const
              ).map(([name, label, value, rows]) => (
                <label key={name}>
                  {label}
                  <textarea name={name} rows={rows} defaultValue={value} />
                </label>
              ))}
              <div className="inline">
                <button type="submit" disabled={savingEdit}>Lưu bản sửa</button>
                <button type="button" className="ghost" onClick={() => setEditing(false)}>Hủy</button>
                {editError && <span className="warn">{editError}</span>}
              </div>
            </form>
          ) : (
            <div className="card settings wide">
              <Field label="Tiêu đề SEO" value={o.seo_title} hint={`${titleLen} ký tự${titleLen > 65 ? ' · hơi dài' : ''}`} />
              <Field label="Meta description" value={o.meta_description} hint={`${metaLen} ký tự${metaLen > 165 ? ' · hơi dài' : metaLen < 120 ? ' · hơi ngắn' : ''}`} />
              <Field label="Từ khóa chính" value={o.focus_keyphrase} />
              <Field label="Đường dẫn (slug)" value={o.slug} />
              <Field label="Tags" value={o.tags.join(', ')} />
              <Field label="Alt ảnh" value={o.image_alt} />
              <Field label="Mô tả ngắn" value={o.short_description_html}>
                <Preview html={o.short_description_html} />
              </Field>
              <Field label="Mô tả" value={o.description_html}>
                <Preview html={o.description_html} />
              </Field>

              {o.missing.length > 0 && (
                <div className="verify">
                  <div className="label">Phiếu còn thiếu</div>
                  <ul>{o.missing.map((m) => <li key={m}>{m}</li>)}</ul>
                </div>
              )}
              {o.to_verify.length > 0 && (
                <div className="verify">
                  <div className="label">⚠ Cần kiểm tra trước khi đăng</div>
                  <ul>
                    {o.to_verify.map((v) => (
                      <li key={v.claim}>
                        <strong>{v.claim}</strong> — {v.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="inline">
                <button className="ghost" onClick={() => setEditing(true)}>Sửa tay</button>
              </div>
              <form action={doRegen} className="inline">
                <input name="instruction" placeholder='Yêu cầu viết lại, vd "ngắn hơn", "nhấn mạnh độ bám sân"' />
                <button type="submit" className="ghost" disabled={regenerating || busy}>Viết lại</button>
                {regenError && <span className="warn">{regenError}</span>}
              </form>
            </div>
          )}

          {o && (
            <>
              <h2>Danh mục & bản nháp WooCommerce</h2>
              <div className="card settings wide">
                <div className="meta">Danh mục AI gợi ý được đánh dấu ★ — chỉnh lại nếu cần.</div>
                <div className="cat-list">
                  {categories.map((c) => (
                    <label key={c.id} className="switch-row">
                      <input
                        type="checkbox"
                        checked={cats.includes(c.id)}
                        disabled={!!p.woo_edit_url}
                        onChange={(e) => {
                          const next = e.target.checked ? [...cats, c.id] : cats.filter((x) => x !== c.id);
                          setCats(next);
                          start(() => setCategories(p.id, next));
                        }}
                      />
                      <span>
                        {c.path} {suggested.has(c.id) && '★'}
                      </span>
                    </label>
                  ))}
                </div>
                {p.woo_edit_url ? (
                  <p className="on">
                    ✓ Đã tạo bản nháp —{' '}
                    <a href={p.woo_edit_url} target="_blank" rel="noreferrer">mở trên WordPress</a> để thêm ảnh, kiểm tra và bấm Đăng.
                  </p>
                ) : (
                  <div className="inline">
                    <button
                      disabled={pending || busy || !cats.length}
                      onClick={() => {
                        if (confirm('Tạo sản phẩm NHÁP trên website? (Chưa đăng — mày vẫn phải vào WordPress thêm ảnh và bấm Đăng)'))
                          start(async () => setActionError(await pushDraft(p.id)));
                      }}
                    >
                      Tạo bản nháp trên WooCommerce
                    </button>
                    <span className="meta">Điền sẵn: tên, SKU, giá (+ giá KM), size, loại đinh, hãng, mô tả, tags, danh mục, Yoast. Ảnh tải trên WordPress.</span>
                  </div>
                )}
              </div>
            </>
          )}

          <p>
            <button
              className="link"
              onClick={() => {
                if (confirm(`Xóa "${p.name}" khỏi app? (Không ảnh hưởng sản phẩm trên website)`)) start(() => deleteProduct(p.id));
              }}
            >
              Xóa sản phẩm này
            </button>
          </p>
        </section>
      </div>
    </>
  );
}
