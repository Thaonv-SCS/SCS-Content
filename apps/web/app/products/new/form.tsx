'use client';

import { useActionState, useState } from 'react';
import type { ProductType, SpecField } from '@app/products';
import { createProduct } from '../actions';
import { BasicFields, SpecInputs } from '../spec-fields';

type Mode = 'ai' | 'paste';

export function NewProductForm({
  fieldsByType,
  typeLabels,
}: {
  fieldsByType: Record<ProductType, SpecField[]>;
  typeLabels: Record<ProductType, string>;
}) {
  const [type, setType] = useState<ProductType>('boots');
  const [mode, setMode] = useState<Mode>('ai');
  const [error, action, pending] = useActionState(createProduct, null);

  return (
    <form action={action} className="card settings wide">
      <label>
        <strong>Loại sản phẩm</strong>
        <select name="type" value={type} onChange={(e) => setType(e.target.value as ProductType)}>
          {(Object.keys(typeLabels) as ProductType[]).map((t) => (
            <option key={t} value={t}>{typeLabels[t]}</option>
          ))}
        </select>
      </label>

      <div>
        <strong>Nội dung mô tả</strong>
        <label className="switch-row">
          <input type="radio" name="mode" value="ai" checked={mode === 'ai'} onChange={() => setMode('ai')} />
          <span>AI viết nội dung <span className="meta">— từ phiếu nhập bên dưới, khoảng $0.10/bài</span></span>
        </label>
        <label className="switch-row">
          <input type="radio" name="mode" value="paste" checked={mode === 'paste'} onChange={() => setMode('paste')} />
          <span>Dán nội dung soạn sẵn <span className="meta">— không dùng AI, không tốn tiền</span></span>
        </label>
      </div>

      <BasicFields />

      {mode === 'paste' && (
        <label>
          <strong>Mô tả sản phẩm (dán nguyên bài)</strong>
          <textarea
            name="pasted"
            rows={14}
            required
            placeholder={'Dán chữ thường (mỗi dòng một đoạn, dòng bắt đầu bằng "-" thành gạch đầu dòng) hoặc dán HTML.'}
          />
          <span className="meta">
            App giữ nguyên bài, chỉ tự gắn link nội bộ: danh mục dòng (không có thì trang hãng) + loại sân. Tiêu đề SEO, meta, mô tả ngắn… để trống —
            muốn điền thì bấm <strong>Sửa tay</strong> ở trang sau.
          </span>
        </label>
      )}

      <h3 className="section-title">
        Thông số ({typeLabels[type].toLowerCase()})
        {mode === 'paste' && <span className="meta"> — không bắt buộc; nên chọn Loại đinh để có link loại sân</span>}
      </h3>
      <SpecInputs key={type} fields={fieldsByType[type]} />
      <div className="inline">
        <button type="submit" disabled={pending}>
          {pending ? 'Đang lưu…' : mode === 'paste' ? '📋 Tạo từ nội dung dán' : '✍ Viết nội dung'}
        </button>
        {error && <span className="warn">{error}</span>}
      </div>
    </form>
  );
}
