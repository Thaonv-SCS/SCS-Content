// Module Video (SCS Video Studio V3) — hằng số dùng chung giữa các trang.

export type TrangThai =
  | 'moi' | 'dang-chuan-bi' | 'cho-duyet-dan-y' | 'cho-canh-tram' | 'canh-tram-xong' | 'dang-lam-the' | 'cho-duyet-the'
  | 'dang-dung' | 'cho-xem-nhap' | 'gop-y' | 'dang-sua' | 'xong' | 'loi' | 'huy';

/** Nhãn + ai đang phải làm ('may' = máy worker đang chạy, 'lam' = người làm, 'duyet' = người duyệt). */
export const TRANG_THAI: Record<TrangThai, { nhan: string; ai: 'may' | 'lam' | 'duyet' | 'xong' | 'loi' | 'huy' }> = {
  'huy': { nhan: 'Đã hủy', ai: 'huy' },
  'moi': { nhan: 'Chờ máy nhận', ai: 'may' },
  'dang-chuan-bi': { nhan: 'Máy đang chuẩn bị + viết dàn ý', ai: 'may' },
  'cho-duyet-dan-y': { nhan: 'Chờ duyệt dàn ý', ai: 'lam' },
  'cho-canh-tram': { nhan: 'Chờ cảnh trám', ai: 'lam' },
  'canh-tram-xong': { nhan: 'Máy đang làm thẻ', ai: 'may' },
  'dang-lam-the': { nhan: 'Máy đang làm thẻ', ai: 'may' },
  'cho-duyet-the': { nhan: 'Chờ duyệt thẻ', ai: 'lam' },
  'dang-dung': { nhan: 'Máy đang dựng', ai: 'may' },
  'cho-xem-nhap': { nhan: 'Chờ xem bản nháp', ai: 'duyet' },
  'gop-y': { nhan: 'Máy đang sửa theo góp ý', ai: 'may' },
  'dang-sua': { nhan: 'Máy đang sửa theo góp ý', ai: 'may' },
  'xong': { nhan: 'Xong', ai: 'xong' },
  'loi': { nhan: 'Lỗi', ai: 'loi' },
};

export const nhanTrangThai = (t: string) => TRANG_THAI[t as TrangThai]?.nhan ?? t;
export const mayDangLam = (t: string) => TRANG_THAI[t as TrangThai]?.ai === 'may';

/** Bước của "bộ não" mà mỗi video chọn được mô hình riêng (khớp bảng MO_HINH trong cong-cu/nao.py). */
export const BUOC = [
  { ma: 'kho-canh', ten: 'Xem kho cảnh', macDinh: 'claude-haiku-5-5' },
  { ma: 'dan-y', ten: 'Viết dàn ý', macDinh: 'claude-sonnet-5-5' },
  { ma: 'canh-tram', ten: 'Xem cảnh trám', macDinh: 'claude-sonnet-5-5' },
  { ma: 'the', ten: 'Làm thẻ đồ họa', macDinh: 'claude-sonnet-5-5' },
  { ma: 'ke-hoach', ten: 'Kế hoạch dựng', macDinh: 'claude-sonnet-5-5' },
  { ma: 'kiem-tra', ten: 'Tự kiểm tra khung hình', macDinh: 'claude-haiku-5-5' },
  { ma: 'sua', ten: 'Sửa theo góp ý', macDinh: 'claude-sonnet-5-5' },
] as const;

export const MO_HINH = [
  { ma: 'claude-haiku-5-5', ten: 'Haiku (rẻ nhất)' },
  { ma: 'claude-sonnet-5-5', ten: 'Sonnet (cân bằng)' },
  { ma: 'claude-opus-5-5', ten: 'Opus (mạnh, đắt)' },
] as const;

/** Chi phí ước tính ($/video, mức suy nghĩ "vừa") đo thật trên video Kelme 2,5 phút (2026-11-16). null = chưa thử. */
export const UOC_TINH: Record<string, Record<string, number | null>> = {
  'kho-canh': { 'claude-haiku-5-5': 0.01, 'claude-sonnet-5-5': 0.1, 'claude-opus-5-5': 0.2 },
  'dan-y': { 'claude-haiku-5-5': null, 'claude-sonnet-5-5': 0.16, 'claude-opus-5-5': 0.75 },
  'canh-tram': { 'claude-haiku-5-5': null, 'claude-sonnet-5-5': 0.28, 'claude-opus-5-5': 0.67 },
  'the': { 'claude-haiku-5-5': null, 'claude-sonnet-5-5': 0.12, 'claude-opus-5-5': 0.24 },
  'ke-hoach': { 'claude-haiku-5-5': null, 'claude-sonnet-5-5': 0.73, 'claude-opus-5-5': 1.78 },
  'kiem-tra': { 'claude-haiku-5-5': 0.01, 'claude-sonnet-5-5': 0.08, 'claude-opus-5-5': 0.2 },
  'sua': { 'claude-haiku-5-5': null, 'claude-sonnet-5-5': 0.15, 'claude-opus-5-5': 0.45 },
};

export const MAY_BAT_TRONG_PHUT = 2; // máy báo "đang bật" mỗi 30 giây; quá 2 phút không báo = coi như tắt

export function mayDangBat(lanCuoi: string | null) {
  return !!lanCuoi && Date.now() - new Date(lanCuoi).getTime() < MAY_BAT_TRONG_PHUT * 60_000;
}

export const usd = (n: number | null | undefined) => (n == null ? '—' : `$${Number(n).toFixed(2)}`);
