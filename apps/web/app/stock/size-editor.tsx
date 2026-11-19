'use client';

import { useMemo, useState } from 'react';
import { normalizeSize, sortSizes } from '@app/products/src/stock-types.ts';

/**
 * Ô sửa size kiểu WooCommerce: thẻ size có nút × để bỏ, ô gõ để tìm và thêm size từ danh sách size có trên web.
 * Đóng: hiện danh sách size (bấm để sửa). Size thêm mới tô xanh, size đã bỏ hiện gạch ngang bên dưới.
 */
export function SizeEditor({
  value,
  original,
  terms,
  disabled,
  onChange,
}: {
  value: string[];
  original: string[];
  terms: string[] | null;
  disabled?: boolean;
  onChange: (sizes: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const removed = original.filter((s) => !value.includes(s));

  const suggestions = useMemo(() => {
    if (!terms) return [];
    const q = query.trim().toLowerCase().replace(/,/g, '.').replace(/\s*½/g, '.5');
    return sortSizes(terms)
      .filter((t) => !value.includes(t))
      .filter((t) => !q || t.toLowerCase().startsWith(q) || t.toLowerCase().includes(q))
      .slice(0, 40);
  }, [terms, value, query]);

  const add = (s: string) => {
    onChange(sortSizes([...value, s]));
    setQuery('');
  };
  const remove = (s: string) => onChange(value.filter((x) => x !== s));

  const chips = (editable: boolean) =>
    value.length ? (
      value.map((s) => (
        <span key={s} className={`size-chip${original.includes(s) ? '' : ' added'}`}>
          {s}
          {editable && (
            <button type="button" className="size-x" title={`Bỏ size ${s}`} onClick={() => remove(s)} disabled={disabled}>
              ×
            </button>
          )}
        </span>
      ))
    ) : (
      <span className="meta">chưa có size</span>
    );

  if (!open) {
    return (
      <div className="size-cell" onClick={() => !disabled && setOpen(true)} title="Bấm để thêm / bỏ size">
        {chips(false)}
        {removed.length > 0 && (
          <div className="warn" style={{ fontSize: 12 }}>
            bỏ: <s>{removed.join(', ')}</s>
          </div>
        )}
        {!disabled && <span className="meta size-edit-hint">✎ sửa</span>}
      </div>
    );
  }

  return (
    <div className="size-cell open">
      <div className="size-chips">{chips(true)}</div>
      {removed.length > 0 && (
        <div className="warn" style={{ fontSize: 12 }}>
          bỏ: <s>{removed.join(', ')}</s>{' '}
          <button type="button" className="link" onClick={() => onChange(sortSizes([...value, ...removed]))}>
            lấy lại
          </button>
        </div>
      )}
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const exact = terms ? normalizeSize(query, terms) : null;
            const pick = exact && !value.includes(exact) ? exact : suggestions[0];
            if (pick) add(pick);
          }
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={terms ? 'Gõ để tìm size cần thêm, Enter để thêm' : 'Đang tải danh sách size…'}
        style={{ marginTop: 6 }}
      />
      <div className="size-suggest">
        {suggestions.map((s) => (
          <button key={s} type="button" className="ghost small" onClick={() => add(s)} disabled={disabled}>
            + {s}
          </button>
        ))}
        {terms && !suggestions.length && <span className="meta">Không có size nào khớp.</span>}
      </div>
      <div className="inline" style={{ marginTop: 6 }}>
        <button type="button" className="ghost small" onClick={() => setOpen(false)}>Xong</button>
        {(removed.length > 0 || value.some((s) => !original.includes(s))) && (
          <button type="button" className="link" onClick={() => onChange(original)}>
            Hoàn lại như cũ
          </button>
        )}
      </div>
    </div>
  );
}
