'use client';

import type { SpecField } from '@app/products';

/** Các ô của phiếu nhập — dùng chung cho form tạo mới và form sửa phiếu. */
export function BasicFields({ initial }: { initial?: { name?: string; sku?: string | null; price?: number | null; sizes?: string[] } }) {
  return (
    <div className="source-fields">
      <label className="wide-field">
        Tên sản phẩm *
        <input name="name" required defaultValue={initial?.name ?? ''} placeholder="vd Nike Mercurial Vapor 16 Pro TF – Attack – Racer Blue" />
      </label>
      <label>
        Mã sản phẩm (SKU)
        <input name="sku" defaultValue={initial?.sku ?? ''} placeholder="vd FQ8687-446" />
      </label>
      <label>
        Giá bán (đ)
        <input name="price" inputMode="numeric" defaultValue={initial?.price ?? ''} placeholder="vd 2900000" />
      </label>
      <label>
        Size
        <input name="sizes" defaultValue={initial?.sizes?.join(', ') ?? ''} placeholder="vd 39, 40, 40.5, 41" />
      </label>
    </div>
  );
}

export function SpecInputs({ fields, values, notes }: { fields: SpecField[]; values?: Record<string, string>; notes?: string | null }) {
  return (
    <div className="source-fields">
      {fields.map((f) => (
        <label key={f.key} className={f.options ? '' : 'wide-half'}>
          {f.label}
          {f.options ? (
            <select name={`spec.${f.key}`} defaultValue={values?.[f.key] ?? ''}>
              <option value="">— chọn —</option>
              {f.options.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input name={`spec.${f.key}`} defaultValue={values?.[f.key] ?? ''} placeholder={f.hint} />
          )}
        </label>
      ))}
      <label className="wide-field">
        Ý chính khác (gạch đầu dòng thô, AI sẽ viết thành văn)
        <textarea name="notes" rows={4} defaultValue={notes ?? ''} placeholder={'- form ôm chân, hợp chân thon và bè\n- phối màu mở màn 2026'} />
      </label>
    </div>
  );
}
