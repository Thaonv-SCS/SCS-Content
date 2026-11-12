'use client';

import { parseVariants, type Variant } from '@app/products/src/batch.ts';

const vnd = (n: number | null) => (n ? n.toLocaleString('vi-VN') : '');

/** Ô dán danh sách màu (gõ tay hoặc dán từ Excel) + xem trước từng dòng sẽ thành sản phẩm gì. */
export function VariantsInput({
  value,
  onChange,
  preview,
}: {
  value: string;
  onChange: (v: string) => void;
  preview: (v: Variant) => string;
}) {
  const { variants, errors } = parseVariants(value);
  return (
    <>
      <label className="wide-field">
        <span>
          Mỗi dòng một màu: <code>màu | mã | size | giá | giá KM</code> — chỉ màu và mã là cần, size / giá để trống thì dùng giá trị chung ở
          trên. Dán thẳng từ Excel (các cột theo đúng thứ tự đó) cũng được.
        </span>
        <textarea
          name="variants"
          rows={6}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={'trắng | 8521ZX1701-170\nđen/ vàng | 8521ZX1701-003 | 39, 40, 41 | 1290000\nxanh blue | 8521ZX1701-400 |  | 1290000 | 990000'}
        />
      </label>
      {errors.length > 0 && <div className="warn">{errors.join(' · ')}</div>}
      {variants.length > 0 && (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Tên sản phẩm sẽ tạo</th>
                <th>Size</th>
                <th>Giá</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v, i) => (
                <tr key={i}>
                  <td>{preview(v)}</td>
                  <td className="meta">{v.sizes?.join(', ') ?? 'chung'}</td>
                  <td className="meta">
                    {vnd(v.price) || 'chung'}
                    {v.sale_price ? ` → ${vnd(v.sale_price)}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
