'use client';

import { parseMoney, priceWarnings, vnd } from '@app/products/src/stock-types.ts';

export type PriceDraft = { regular: number | null; sale: number | null };

const show = (n: number | null) => (n ? n.toLocaleString('vi-VN') : '');

/**
 * Sửa giá ngay trên dòng: ô giá niêm yết + ô giá sale (để trống = không giảm giá), như trang sửa sản phẩm của WooCommerce.
 * Hiện % giảm, cảnh báo, và giá cũ khi đã đổi.
 */
export function PriceEditor({
  value,
  original,
  disabled,
  onChange,
}: {
  value: PriceDraft;
  original: PriceDraft;
  disabled?: boolean;
  onChange: (v: PriceDraft) => void;
}) {
  const changed = value.regular !== original.regular || value.sale !== original.sale;
  const warnings = priceWarnings(value.regular, value.sale, original.regular);
  const discount = value.regular && value.sale && value.sale < value.regular ? Math.round((1 - value.sale / value.regular) * 100) : null;

  return (
    <div className="price-cell">
      <div className="price-inputs">
        <label>
          <span className="meta">Giá niêm yết</span>
          <input
            inputMode="numeric"
            value={show(value.regular)}
            disabled={disabled}
            className={value.regular !== original.regular ? 'changed' : ''}
            onChange={(e) => onChange({ ...value, regular: parseMoney(e.target.value) })}
          />
        </label>
        <label>
          <span className="meta">Giá sale {discount ? <strong className="on">−{discount}%</strong> : null}</span>
          <input
            inputMode="numeric"
            value={show(value.sale)}
            placeholder="trống = không giảm"
            disabled={disabled}
            className={value.sale !== original.sale ? 'changed' : ''}
            onChange={(e) => onChange({ ...value, sale: parseMoney(e.target.value) })}
          />
        </label>
      </div>
      {changed && (
        <div className="meta" style={{ fontSize: 12 }}>
          cũ: {vnd(original.regular)}
          {original.sale ? ` · sale ${vnd(original.sale)}` : ' · không giảm'}{' '}
          <button type="button" className="link" onClick={() => onChange(original)} disabled={disabled}>
            hoàn lại
          </button>
        </div>
      )}
      {changed && warnings.length > 0 && <div className="warn" style={{ fontSize: 12 }}>⚠ {warnings.join('; ')}</div>}
    </div>
  );
}
