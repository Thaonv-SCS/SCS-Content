'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { KieuDayLai, ProductOutput, ProductType, ResearchResult, SanPhamWeb, SpecField } from '@app/products';
import { chenVideo, parseVideoLink } from '@app/products/src/video.ts';
import { applyFacts, deleteProduct, kiemTraTrenWeb, luuVideo, pushDraft, regenerate, research, saveOutputEdit, setCategories, updateSpec } from '../actions';
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
  video_links: string[];
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
  const manual = !!o?.manual;

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
  const [videoMsg, doVideo, savingVideo] = useActionState(luuVideo.bind(null, p.id), null);
  const [web, setWeb] = useState<SanPhamWeb | null>(null);
  const [kieu, setKieu] = useState<KieuDayLai>('cap-nhat');
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
        <div className={`card status-line ${actionError.startsWith('✓') ? 'on' : 'warn'}`}>
          {actionError.startsWith('⚠') || actionError.startsWith('✓') ? actionError : `✗ ${actionError}`}
        </div>
      )}

      <div className="workspace">
        {/* ───────── Cột trái: phiếu nhập + tìm thêm ───────── */}
        <section>
          <h2>Phiếu nhập</h2>
          <form action={saveSpec} className="card settings wide">
            <BasicFields initial={p} />
            <SpecInputs fields={fields} values={p.spec} notes={p.notes} />
            <div className="inline">
              {!manual && <button type="submit" name="regenerate" value="1" disabled={savingSpec || busy}>Lưu & viết lại</button>}
              <button type="submit" className={manual ? '' : 'ghost'} disabled={savingSpec}>{manual ? 'Lưu phiếu' : 'Chỉ lưu phiếu'}</button>
              {specError && <span className="warn">{specError}</span>}
            </div>
          </form>

          {!manual && (<>
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
          </>)}
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
                  ['image_alt', 'Alt ảnh', o.image_alt, 1],
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
              {manual && (
                <div className="verify">
                  <div className="label">📋 Nội dung tự dán — không dùng AI</div>
                  <ul>
                    {(o.link_report ?? []).map((r) => <li key={r}>{r}</li>)}
                    <li>Tiêu đề SEO, meta, từ khóa, mô tả ngắn đang trống — bấm Sửa tay nếu muốn điền (không bắt buộc).</li>
                  </ul>
                </div>
              )}
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
                <Preview html={chenVideo(o.description_html, p.video_links, true)} />
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
              {!manual && (
                <form action={doRegen} className="settings">
                  <label>
                    <strong>Yêu cầu viết lại</strong>
                    <textarea
                      name="instruction"
                      rows={5}
                      placeholder={`Mỗi dòng một yêu cầu, vd:
- Ngắn hơn
- Nhấn mạnh độ bám sân
- Thêm đoạn so sánh với bản Elite`}
                    />
                  </label>
                  <div className="inline">
                    <button type="submit" className="ghost" disabled={regenerating || busy}>Viết lại</button>
                    {regenError && <span className="warn">{regenError}</span>}
                  </div>
                </form>
              )}
            </div>
          )}

          {o && (
            <>
              <h2>Danh mục & bản nháp WooCommerce</h2>
              <div className="card settings wide">
                <div className="meta">Danh mục {manual ? 'app' : 'AI'} gợi ý được đánh dấu ★ — chỉnh lại nếu cần.</div>
                <div className="cat-list">
                  {categories.map((c) => (
                    <label key={c.id} className="switch-row">
                      <input
                        type="checkbox"
                        checked={cats.includes(c.id)}
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
                <h3 style={{ margin: '8px 0 0', fontSize: 15 }}>Video trong mô tả</h3>
                <form action={doVideo} className="settings">
                  <label className="meta">
                    Link YouTube / TikTok, mỗi dòng một link — chèn ngay dưới bảng thông số, căn giữa (xem ô xám ở phần Mô tả bên trên)
                    <textarea name="video_links" rows={2} defaultValue={p.video_links.join('\n')} placeholder="https://www.youtube.com/watch?v=…&#10;https://www.tiktok.com/@soccerstore.vn/video/…" />
                  </label>
                  <div className="inline">
                    <button type="submit" className="ghost" disabled={savingVideo}>Lưu video</button>
                    {videoMsg && <span className={videoMsg.startsWith('✓') ? 'on' : 'warn'}>{videoMsg}</span>}
                    {p.video_links.some((l) => !parseVideoLink(l)) && <span className="warn">Có link không nhận ra</span>}
                  </div>
                </form>

                {p.woo_edit_url && (
                  <p className="on">
                    ✓ Đã đẩy lên web{p.pushed_at ? ` lúc ${new Date(p.pushed_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' })}` : ''} —{' '}
                    <a href={p.woo_edit_url} target="_blank" rel="noreferrer">mở trên WordPress</a>. Sửa nội dung ở app rồi đẩy lại được.
                  </p>
                )}
                {web ? (
                  <div className="verify">
                    <div>
                      Đã có trên web:{' '}
                      <a href={web.permalink} target="_blank" rel="noreferrer">{web.name}</a>{' '}
                      <span className="meta">({web.status === 'publish' ? 'đang bán' : web.status === 'draft' ? 'nháp' : web.status} · {web.so_anh_mo_ta} ảnh trong mô tả)</span>
                    </div>
                    <label className="inline">
                      <input type="radio" checked={kieu === 'cap-nhat'} onChange={() => setKieu('cap-nhat')} style={{ width: 'auto', margin: 0 }} />
                      <span><strong>Cập nhật</strong> — thay chữ bằng bản trong app, <strong>giữ ảnh</strong> đang có trong mô tả trên web</span>
                    </label>
                    <label className="inline">
                      <input type="radio" checked={kieu === 'thay-the'} onChange={() => setKieu('thay-the')} style={{ width: 'auto', margin: 0 }} />
                      <span><strong>Thay thế</strong> — mô tả trên web thay toàn bộ bằng bản trong app (mất ảnh trong mô tả)</span>
                    </label>
                    <div className="meta">Không đổi: trạng thái {web.status === 'publish' ? '(vẫn đang bán)' : '(vẫn là nháp)'}, ảnh đại diện{web.status === 'publish' ? ', đường dẫn (slug)' : ''}.</div>
                    <div className="inline">
                      <button
                        disabled={pending || busy || !cats.length}
                        onClick={() => {
                          if (!confirm(`${kieu === 'cap-nhat' ? 'CẬP NHẬT' : 'THAY THẾ'} nội dung "${web.name}" trên web?${web.status === 'publish' ? '\nSản phẩm đang bán — thay đổi hiện ngay cho khách.' : ''}`)) return;
                          start(async () => {
                            setActionError(await pushDraft(p.id, kieu));
                            setWeb(null);
                          });
                        }}
                      >
                        {kieu === 'cap-nhat' ? 'Cập nhật lên web' : 'Thay thế trên web'}
                      </button>
                      <button type="button" className="ghost" onClick={() => setWeb(null)}>Hủy</button>
                    </div>
                  </div>
                ) : (
                  <div className="inline">
                    <button
                      disabled={pending || busy || !cats.length}
                      onClick={() =>
                        start(async () => {
                          setActionError(null);
                          const r = await kiemTraTrenWeb(p.id);
                          if (!r.ok) return setActionError(r.error);
                          if (r.web?.co_noi_dung) return setWeb(r.web); // đã có nội dung → hỏi Cập nhật / Thay thế
                          if (!confirm(r.web ? `Đẩy nội dung vào "${r.web.name}" (đang trống) trên web?` : 'Tạo sản phẩm NHÁP trên website? (Chưa đăng — mày vẫn phải vào WordPress thêm ảnh và bấm Đăng)')) return;
                          setActionError(await pushDraft(p.id));
                        })
                      }
                    >
                      {pending ? 'Đang kiểm tra…' : p.woo_edit_url ? 'Đẩy lại lên WooCommerce' : 'Tạo bản nháp trên WooCommerce'}
                    </button>
                    <span className="meta">Điền sẵn: tên, SKU, giá (+ giá KM), size, loại đinh, hãng, mô tả (+ video), tags, danh mục, Yoast. Đã có trên web thì được chọn Cập nhật / Thay thế.</span>
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
