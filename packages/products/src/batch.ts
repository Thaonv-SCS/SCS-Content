/**
 * Nhập nhiều màu một lần. Mỗi dòng một màu: "màu | mã | size | giá | giá KM" (3 cột sau không bắt buộc).
 * Dán thẳng từ Excel cũng được (các cột cách nhau bằng tab). File này không gọi mạng — dùng được cả ở trình duyệt.
 */

export interface Variant {
  color: string;
  sku: string | null;
  /** null = dùng size chung của lô */
  sizes: string[] | null;
  price: number | null;
  sale_price: number | null;
}

const num = (s: string | undefined) => {
  const digits = (s ?? '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
};

export const splitSizes = (s: string) =>
  s
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

const VN_COLORS = /^(trắng|đen|đỏ|xanh|vàng|hồng|cam|tím|xám|bạc|nâu|be|ghi|kem|lục|chàm|rêu|ngọc)$/i;

/** Bỏ chữ "màu" thừa; tên màu tiếng Việt viết thường như trên web ("Trắng" → "trắng"), tên phối màu tiếng Anh giữ nguyên. */
function normalizeColor(raw: string): string {
  const c = raw.replace(/^m[àa]u\s+/i, '').trim();
  return c
    .split(/(\s+|\/)/)
    .map((w) => (VN_COLORS.test(w) ? w.toLowerCase() : w))
    .join('');
}

export function parseVariants(text: string): { variants: Variant[]; errors: string[] } {
  const variants: Variant[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const cols = (line.includes('\t') ? line.split('\t') : line.split('|')).map((c) => c.trim());
    const [color = '', sku = '', sizes = '', price, sale] = cols;
    if (i === 0 && /^m[àa]u$/i.test(color)) return; // dòng tiêu đề khi dán từ Excel
    if (!color && !sku) return;
    if (!color) errors.push(`Dòng ${i + 1}: thiếu màu`);
    else
      variants.push({
        color: normalizeColor(color),
        sku: sku || null,
        sizes: sizes ? splitSizes(sizes) : null,
        price: num(price),
        sale_price: num(sale),
      });
  });
  const skus = variants.flatMap((v) => (v.sku ? [v.sku.toLowerCase()] : []));
  const dup = skus.filter((s, i) => skus.indexOf(s) !== i);
  if (dup.length) errors.push(`Mã bị trùng: ${[...new Set(dup)].join(', ')}`);
  return { variants, errors };
}

/** Tên theo kiểu web: "<tên chung> màu <màu> <mã>", vd "Kelme Stazzle 1.0.1 TF màu trắng 8521ZX1701-170". */
export function variantName(baseName: string, v: Pick<Variant, 'color' | 'sku'>): string {
  return [baseName.trim(), v.color ? `màu ${v.color}` : '', v.sku ?? ''].filter(Boolean).join(' ');
}
