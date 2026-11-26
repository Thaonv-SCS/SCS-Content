/**
 * Chọn mô hình AI cho từng việc (Cài đặt → Mô hình AI). Lưu ở settings.mo_hinh_ai = { "<mã việc>": { model, effort } }.
 * Nhân viên không đọc được bảng settings → web đọc qua hàm SQL mo_hinh_ai() (migration 0026); pipeline bản tin dùng service key.
 * Video editor chọn mô hình riêng cho từng video (apps/web/lib/video.ts), không nằm ở đây.
 * File không import gì → dùng được cả ở trình duyệt.
 */

export type MucSuyNghi = 'low' | 'medium' | 'high';
export interface CauHinhMoHinh {
  model: string;
  effort: MucSuyNghi;
}

export const HAIKU = 'claude-haiku-5-5';
export const SONNET = 'claude-sonnet-5-5';
export const OPUS = 'claude-opus-5-5';

export const DS_MO_HINH: { ma: string; ten: string }[] = [
  { ma: HAIKU, ten: 'Haiku (rẻ nhất, ~1/40 Opus)' },
  { ma: SONNET, ten: 'Sonnet (cân bằng, ~½ Opus)' },
  { ma: OPUS, ten: 'Opus (mạnh nhất, đắt nhất)' },
];
export const DS_SUY_NGHI: { ma: MucSuyNghi; ten: string }[] = [
  { ma: 'low', ten: 'thấp' },
  { ma: 'medium', ten: 'vừa' },
  { ma: 'high', ten: 'cao' },
];

export interface ViecAI {
  ma: string;
  nhom: 'Post sản phẩm' | 'Dự án video' | 'Bản tin';
  ten: string;
  /** purpose trong llm_calls — để tính giá trung bình thật */
  purposes: string[];
  macDinh: CauHinhMoHinh;
}

export const VIEC_AI: ViecAI[] = [
  { ma: 'product-write', nhom: 'Post sản phẩm', ten: 'Viết nội dung sản phẩm', purposes: ['product-write'], macDinh: { model: SONNET, effort: 'medium' } },
  { ma: 'product-research', nhom: 'Post sản phẩm', ten: 'Tìm thông tin trên web', purposes: ['product-research'], macDinh: { model: SONNET, effort: 'low' } },
  { ma: 'product-style', nhom: 'Post sản phẩm', ten: 'Rút luật văn phong từ bài sửa tay', purposes: ['product-style'], macDinh: { model: SONNET, effort: 'medium' } },
  { ma: 'du-an:y-tuong', nhom: 'Dự án video', ten: 'Phát triển ý tưởng', purposes: ['du-an:y-tuong'], macDinh: { model: OPUS, effort: 'medium' } },
  { ma: 'du-an:ke-hoach', nhom: 'Dự án video', ten: 'Kế hoạch nội dung', purposes: ['du-an:ke-hoach'], macDinh: { model: SONNET, effort: 'medium' } },
  { ma: 'du-an:kich-ban', nhom: 'Dự án video', ten: 'Kịch bản', purposes: ['du-an:kich-ban'], macDinh: { model: OPUS, effort: 'medium' } },
  { ma: 'du-an:doan', nhom: 'Dự án video', ten: 'Viết lại 1 đoạn kịch bản', purposes: ['du-an:doan'], macDinh: { model: SONNET, effort: 'medium' } },
  { ma: 'du-an:shotlist', nhom: 'Dự án video', ten: 'Đạo diễn + Shotlist', purposes: ['du-an:shotlist'], macDinh: { model: SONNET, effort: 'medium' } },
  { ma: 'du-an:insight', nhom: 'Dự án video', ten: 'Tóm tắt insight khán giả', purposes: ['du-an:insight'], macDinh: { model: OPUS, effort: 'medium' } },
  { ma: 'enrich', nhom: 'Bản tin', ten: 'Viết bài từ tin', purposes: ['enrich'], macDinh: { model: OPUS, effort: 'medium' } },
  { ma: 'style-notes', nhom: 'Bản tin', ten: 'Rút văn phong từ kho caption', purposes: ['style-notes'], macDinh: { model: OPUS, effort: 'medium' } },
];

/** Các bước dự án video có thể ghi đè mô hình riêng từng dự án. */
export const VIEC_DU_AN = ['y-tuong', 'ke-hoach', 'kich-ban', 'doan', 'shotlist'] as const;

const hopLe = (c: unknown): c is CauHinhMoHinh =>
  !!c &&
  typeof c === 'object' &&
  DS_MO_HINH.some((m) => m.ma === (c as CauHinhMoHinh).model) &&
  DS_SUY_NGHI.some((s) => s.ma === (c as CauHinhMoHinh).effort);

/** Cấu hình của 1 việc: ghi đè (vd từng dự án) → Cài đặt → mặc định. */
export function moHinhCho(ma: string, caiDat: unknown, ghiDe?: unknown): CauHinhMoHinh {
  if (hopLe(ghiDe)) return ghiDe;
  const c = (caiDat && typeof caiDat === 'object' ? (caiDat as Record<string, unknown>)[ma] : null) ?? null;
  if (hopLe(c)) return c;
  return VIEC_AI.find((v) => v.ma === ma)?.macDinh ?? { model: SONNET, effort: 'medium' };
}

export const tenMoHinh = (ma: string) => DS_MO_HINH.find((m) => m.ma === ma)?.ten.split(' (')[0] ?? ma;
