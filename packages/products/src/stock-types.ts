/** Kiểu + nhãn + phép tính cho trang "Cập nhật sản phẩm" — không gọi mạng, dùng được ở trình duyệt. */
export type StockStatus = 'instock' | 'outofstock';
export type Visibility = 'visible' | 'catalog' | 'search' | 'hidden';

export const STOCK_LABEL: Record<string, string> = {
  instock: 'Còn hàng',
  outofstock: 'Hết hàng',
  onbackorder: 'Đặt trước',
};

/** Tên giống ô "Hiển thị trong danh mục" của WooCommerce. */
export const VISIBILITY_LABEL: Record<Visibility, string> = {
  visible: 'Cửa hàng & tìm kiếm',
  catalog: 'Chỉ cửa hàng',
  search: 'Chỉ khi tìm kiếm',
  hidden: 'Ẩn',
};

export interface StockItem {
  id: number;
  name: string;
  sku: string;
  stock_status: string;
  catalog_visibility: Visibility;
  permalink: string;
  status: string;
  /** Giá niêm yết, chuỗi số như WooCommerce trả về ("" = chưa có giá). */
  regular_price: string;
  /** Giá khuyến mãi ("" = không giảm giá). */
  sale_price: string;
  /** Size đang hiển thị (thuộc tính "Chọn Size"). */
  sizes: string[];
}

export interface StockUpdate {
  id: number;
  stock_status?: StockStatus;
  catalog_visibility?: Visibility;
  regular_price?: string;
  /** "" = bỏ giảm giá */
  sale_price?: string;
  /** Danh sách size mới (đầy đủ) */
  sizes?: string[];
}

// ───────────── Giá ─────────────

/** "2.950.000" / "2,950,000đ" / 2950000 → 2950000; trống → null. */
export function parseMoney(v: unknown): number | null {
  if (typeof v === 'number') return v > 0 ? Math.round(v) : null;
  const digits = String(v ?? '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

/** Làm tròn đến 10.000đ (2.507.500 → 2.510.000). */
export const roundTo10k = (n: number) => Math.round(n / 10_000) * 10_000;

export const vnd = (n: number | null | undefined) => (n ? `${n.toLocaleString('vi-VN')}đ` : '—');

/** Ô giá sale khi dán bảng: trống = giữ nguyên, "0" / "-" / "x" = bỏ giảm giá, số = giá mới. */
export function parseSaleCell(v: string): { keep: true } | { remove: true } | { price: number } | { error: string } {
  const t = v.trim();
  if (!t) return { keep: true };
  if (/^(0|-|x|không|khong)$/i.test(t)) return { remove: true };
  const n = parseMoney(t);
  return n ? { price: n } : { error: `giá sale "${t}" không hợp lệ` };
}

/** Cảnh báo cho một cặp giá mới. */
export function priceWarnings(regular: number | null, sale: number | null, oldRegular: number | null): string[] {
  const w: string[] = [];
  if (!regular) w.push('chưa có giá niêm yết');
  if (sale && regular && sale >= regular) w.push('giá sale ≥ giá niêm yết');
  if (sale && regular && sale < regular * 0.5) w.push('giảm hơn 50% — kiểm tra lại số 0');
  if (regular && oldRegular && (regular < oldRegular * 0.5 || regular > oldRegular * 2)) w.push('giá niêm yết đổi hơn gấp đôi — kiểm tra lại');
  return w;
}

// ───────────── Size ─────────────

/** Chuẩn hóa size người dùng gõ về dạng tên trên web: "40,5" / "40½" → "40.5", "xl" → khớp "XL". */
export function normalizeSize(input: string, known: string[]): string | null {
  const t = input.trim().replace(/,/g, '.').replace(/\s*½/g, '.5');
  if (!t) return null;
  return known.find((k) => k.toLowerCase() === t.toLowerCase()) ?? null;
}

/**
 * Đọc ô nhập size "40, 40,5 41 xl; One Size" → size hợp lệ + size lạ.
 * Ngăn bằng dấu phẩy (trừ "40,5"), chấm phẩy, xuống dòng hoặc dấu cách; size nhiều chữ có trên web ("One Size") giữ nguyên.
 */
export function parseSizeInput(text: string, known: string[]): { ok: string[]; bad: string[] } {
  const ok: string[] = [];
  const bad: string[] = [];
  const parts = text
    .split(/[;\n]+|,(?!\d)/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const part of parts) {
    const whole = normalizeSize(part, known);
    if (whole) {
      ok.push(whole);
      continue;
    }
    for (const word of part.split(/\s+/).filter(Boolean)) {
      const s = normalizeSize(word, known);
      if (s) ok.push(s);
      else bad.push(word);
    }
  }
  return { ok: [...new Set(ok)], bad };
}

const LETTER_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

/** Sắp size: số tăng dần, rồi chữ (S, M, L…), rồi còn lại. */
export function sortSizes(sizes: string[]): string[] {
  const rank = (s: string): [number, number, string] => {
    const n = Number(s);
    if (!Number.isNaN(n)) return [0, n, s];
    const i = LETTER_ORDER.indexOf(s.toUpperCase());
    return i >= 0 ? [1, i, s] : [2, 0, s];
  };
  return [...new Set(sizes)].sort((a, b) => {
    const [ga, na, sa] = rank(a);
    const [gb, nb, sb] = rank(b);
    return ga - gb || na - nb || sa.localeCompare(sb);
  });
}
