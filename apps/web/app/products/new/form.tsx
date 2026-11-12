'use client';

import { useActionState, useState } from 'react';
import type { ProductType, SpecField } from '@app/products';
import { createProduct } from '../actions';
import { BasicFields, SpecInputs } from '../spec-fields';

export function NewProductForm({
  fieldsByType,
  typeLabels,
}: {
  fieldsByType: Record<ProductType, SpecField[]>;
  typeLabels: Record<ProductType, string>;
}) {
  const [type, setType] = useState<ProductType>('boots');
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
      <BasicFields />
      <h3 className="section-title">Thông số ({typeLabels[type].toLowerCase()})</h3>
      <SpecInputs key={type} fields={fieldsByType[type]} />
      <div className="inline">
        <button type="submit" disabled={pending}>{pending ? 'Đang lưu…' : '✍ Viết nội dung'}</button>
        {error && <span className="warn">{error}</span>}
      </div>
    </form>
  );
}
