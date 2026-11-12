'use client';

import { useActionState, useState } from 'react';
import type { ProductType, SpecField } from '@app/products';
import { parseVariants, variantName } from '@app/products/src/batch.ts';
import { createBatch } from '../../actions';
import { BatchBasicFields, SpecInputs } from '../../spec-fields';
import { VariantsInput } from '../variants-input';

export function NewBatchForm({
  fieldsByType,
  typeLabels,
}: {
  fieldsByType: Record<ProductType, SpecField[]>;
  typeLabels: Record<ProductType, string>;
}) {
  const [type, setType] = useState<ProductType>('boots');
  const [error, action, pending] = useActionState(createBatch, null);
  const [baseName, setBaseName] = useState('');
  const [variants, setVariants] = useState('');
  const count = parseVariants(variants).variants.length;

  return (
    <form action={action} className="card settings wide" onInput={(e) => {
      const t = e.target as HTMLInputElement;
      if (t.name === 'base_name') setBaseName(t.value);
    }}>
      <label>
        <strong>Loại sản phẩm</strong>
        <select name="type" value={type} onChange={(e) => setType(e.target.value as ProductType)}>
          {(Object.keys(typeLabels) as ProductType[]).map((t) => (
            <option key={t} value={t}>{typeLabels[t]}</option>
          ))}
        </select>
      </label>
      <BatchBasicFields />
      <h3 className="section-title">Thông số chung ({typeLabels[type].toLowerCase()})</h3>
      <SpecInputs key={type} fields={fieldsByType[type]} />

      <h3 className="section-title">Các màu</h3>
      <VariantsInput value={variants} onChange={setVariants} preview={(v) => variantName(baseName || '<tên chung>', v)} />

      <div className="inline">
        <button type="submit" name="write" value="1" disabled={pending || !count}>
          {pending ? 'Đang lưu…' : `✍ Tạo lô & viết ${count || ''} màu`}
        </button>
        <button type="submit" className="ghost" disabled={pending || !count}>Chỉ tạo lô</button>
        {count > 0 && <span className="meta">~${(count * 0.11).toFixed(2)} · khoảng {Math.ceil((count * 45) / 60)} phút</span>}
        {error && <span className="warn">{error}</span>}
      </div>
    </form>
  );
}
