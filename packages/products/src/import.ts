/**
 * Nhập nhiều sản phẩm khác nhau từ Excel (file .xlsx hoặc dán thẳng). Mỗi lần nhập một LOẠI sản phẩm,
 * cột thông số theo đúng phiếu của loại đó. Không gọi mạng — dùng được ở trình duyệt.
 */
import { SPEC_FIELDS, type ProductType } from './types.ts';
import { splitSizes } from './batch.ts';

export const IMPORT_MAX_ROWS = 50;

export interface ImportColumn {
  key: string; // name | sku | price | sale_price | sizes | color | notes | spec.<khóa>
  label: string;
  required?: boolean;
  aliases?: string[];
  hint?: string;
}

export function importColumns(type: ProductType): ImportColumn[] {
  return [
    { key: 'name', label: 'Tên sản phẩm', required: true, aliases: ['ten', 'tensp', 'name'] },
    { key: 'sku', label: 'Mã sản phẩm', required: true, aliases: ['ma', 'masp', 'sku', 'mahang'] },
    { key: 'price', label: 'Giá bán', required: true, aliases: ['gia', 'giaban', 'price'] },
    { key: 'sale_price', label: 'Giá khuyến mãi', aliases: ['giakm', 'giasale', 'giagiam', 'giakhuyenmai'] },
    { key: 'sizes', label: 'Size', aliases: ['kichco', 'size', 'sizes'], hint: 'vd 39, 40, 41' },
    { key: 'color', label: 'Phối màu', aliases: ['mau', 'mausac', 'phoimau'] },
    ...SPEC_FIELDS[type].map((f) => ({ key: `spec.${f.key}`, label: f.label, hint: f.options?.join(' / ') ?? f.hint })),
    { key: 'notes', label: 'Ý chính khác', aliases: ['ghichu', 'ychinh', 'mota', 'notes'] },
  ];
}

/** "Giá bán *" / "giá  bán" / "GIA BAN" → "giaban" */
const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export interface ImportRow {
  line: number; // số dòng trong file (để báo lỗi)
  name: string;
  sku: string;
  price: number | null;
  sale_price: number | null;
  sizes: string[];
  color: string | null;
  spec: Record<string, string>;
  notes: string | null;
  errors: string[];
}

const text = (v: unknown) => (v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim();
const money = (v: unknown) => {
  if (typeof v === 'number') return v > 0 ? Math.round(v) : null;
  const digits = text(v).replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
};

/** Dán từ Excel → bảng (các cột cách nhau bằng tab). */
export function rowsFromPaste(pasted: string): string[][] {
  return pasted
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => l.split('\t'));
}

export function parseImport(
  table: unknown[][],
  type: ProductType,
): { rows: ImportRow[]; missingColumns: string[]; ignoredColumns: string[]; error?: string } {
  const cols = importColumns(type);
  const lookup = new Map<string, ImportColumn>();
  for (const c of cols) {
    lookup.set(norm(c.label), c);
    lookup.set(norm(c.key.replace('spec.', '')), c);
    c.aliases?.forEach((a) => lookup.set(a, c));
  }

  // Dòng tiêu đề: dòng đầu tiên (trong 5 dòng) nhận ra được ít nhất 2 cột bắt buộc
  const headerIdx = table.slice(0, 5).findIndex((r) => r.filter((cell) => lookup.get(norm(cell))?.required).length >= 2);
  if (headerIdx < 0) {
    return { rows: [], missingColumns: [], ignoredColumns: [], error: 'Không thấy dòng tiêu đề — cần có các cột "Tên sản phẩm", "Mã sản phẩm", "Giá bán". Tải file mẫu để xem.' };
  }
  const header = table[headerIdx]!;
  const mapping = header.map((h) => lookup.get(norm(h)) ?? null);
  const missingColumns = cols.filter((c) => c.required && !mapping.some((m) => m?.key === c.key)).map((c) => c.label);
  const ignoredColumns = header.filter((h, i) => text(h) && !mapping[i]).map(text);

  const rows: ImportRow[] = [];
  table.slice(headerIdx + 1).forEach((r, i) => {
    if (!r.some((cell) => text(cell))) return; // dòng trống
    const get = (key: string) => {
      const idx = mapping.findIndex((m) => m?.key === key);
      return idx >= 0 ? r[idx] : undefined;
    };
    const spec: Record<string, string> = {};
    for (const f of SPEC_FIELDS[type]) {
      let v = text(get(`spec.${f.key}`));
      // Ô có danh sách chọn (vd Loại đinh): khớp không phân biệt hoa thường
      if (v && f.options) v = f.options.find((o) => o.toLowerCase() === v.toLowerCase()) ?? v;
      spec[f.key] = v;
    }
    const row: ImportRow = {
      line: headerIdx + i + 2,
      name: text(get('name')),
      sku: text(get('sku')),
      price: money(get('price')),
      sale_price: money(get('sale_price')),
      sizes: splitSizes(text(get('sizes'))),
      color: text(get('color')) || null,
      spec,
      notes: text(get('notes')) || null,
      errors: [],
    };
    if (!row.name) row.errors.push('thiếu tên');
    if (!row.sku) row.errors.push('thiếu mã');
    if (!row.price) row.errors.push('thiếu giá bán');
    if (row.sale_price && row.price && row.sale_price >= row.price) row.errors.push('giá KM phải nhỏ hơn giá bán');
    for (const f of SPEC_FIELDS[type]) {
      if (f.options && spec[f.key] && !f.options.includes(spec[f.key]!)) row.errors.push(`${f.label} phải là ${f.options.join('/')}`);
    }
    rows.push(row);
  });

  // Mã trùng trong file
  const seen = new Map<string, number>();
  for (const r of rows) {
    const k = r.sku.toLowerCase();
    if (!k) continue;
    if (seen.has(k)) r.errors.push(`trùng mã với dòng ${seen.get(k)}`);
    else seen.set(k, r.line);
  }
  return { rows, missingColumns, ignoredColumns };
}
