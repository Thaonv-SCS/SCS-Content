/**
 * Kiểu dữ liệu của dự án + đầu ra từng bước. KHÔNG import thư viện nặng — giao diện (client) import thẳng file này.
 */

export type Buoc = 'y-tuong' | 'ke-hoach' | 'kich-ban';
export const CAC_BUOC: { ma: Buoc; ten: string; vai: string }[] = [
  { ma: 'y-tuong', ten: 'Phát triển ý tưởng', vai: 'Content strategist' },
  { ma: 'ke-hoach', ten: 'Kế hoạch nội dung', vai: 'Content strategist' },
  { ma: 'kich-ban', ten: 'Kịch bản', vai: 'Scriptwriter' },
];
export const tenBuoc = (b: string) => CAC_BUOC.find((x) => x.ma === b)?.ten ?? b;
export const buocSau = (b: Buoc): Buoc | null => {
  const i = CAC_BUOC.findIndex((x) => x.ma === b);
  return CAC_BUOC[i + 1]?.ma ?? null;
};

export type CheDo = 'duyet' | 'nhanh';
export type TrangThaiDuAn = 'dang-lam' | 'cho-duyet' | 'xong' | 'loi' | 'huy';
export const NHAN_TRANG_THAI: Record<TrangThaiDuAn, string> = {
  'dang-lam': 'AI đang làm',
  'cho-duyet': 'Chờ duyệt',
  xong: 'Xong',
  loi: 'Lỗi',
  huy: 'Đã hủy',
};

export const MUC_TIEU: Record<string, string> = {
  'ban-hang': 'Bán sản phẩm',
  'nhan-dien': 'Nhận diện thương hiệu',
  'tuong-tac': 'Tương tác / theo dõi',
  'giao-duc': 'Hướng dẫn / chia sẻ kiến thức',
};
export const NEN_TANG = ['TikTok', 'Facebook Reels', 'YouTube Shorts'] as const;

export interface Brief {
  y_tuong: string;
  muc_tieu: string;
  san_pham_links: string[];
  nen_tang: string[];
  /** mã khuôn, rỗng = AI chọn */
  khuon: string;
  ghi_chu: string;
}

// ───────────── Đầu ra bước 1: Phát triển ý tưởng ─────────────
export interface GocKhaiThac {
  ten: string;
  mo_ta: string;
  khuon: string;
  vi_sao: string;
  uu: string[];
  nhuoc: string[];
  rui_ro: string[];
  diem: { hap_dan: number; ban_hang: number; de_quay: number };
  hook: string[];
}
export interface YTuong {
  tom_tat_brief: string;
  insight: { noi_dung: string; bang_chung: string; gia_dinh: boolean }[];
  goc: GocKhaiThac[];
  de_xuat: { goc: number; ly_do: string };
  cau_hoi: string[];
}
/** Lựa chọn khi duyệt bước ý tưởng: góc số mấy (1-based) hoặc góc tự gõ. */
export interface DuyetYTuong {
  goc?: number;
  goc_rieng?: string;
  ghi_chu?: string;
}

// ───────────── Đầu ra bước 2: Kế hoạch nội dung ─────────────
export interface KeHoach {
  khuon: string;
  ly_do_khuon: string;
  do_dai: string;
  nen_tang: string[];
  thong_diep: string;
  cta: string;
  nhan_vat: { vai: string; mo_ta: string }[];
  nhip: { ten: string; y_chinh: string; giay: string }[];
  du_kien: { noi_dung: string; nguon: 'web' | 'kho-tri-thuc' | 'can-xac-minh'; chi_tiet: string }[];
  luu_y_san_xuat: string[];
  goi_y_chuoi: string[];
}

// ───────────── Đầu ra bước 3: Kịch bản ─────────────
export interface DoanKichBan {
  nhip: string;
  /** 'A' / 'B' (video 2 người), rỗng = 1 người nói */
  nguoi_noi: string;
  loi: string;
  hinh: string;
  giay: number;
  /** điều cần kiểm tra trước khi quay (rỗng = không có) */
  can_xac_minh: string;
}
export interface KichBan {
  tieu_de: string;
  hook: { cau: string; ly_do: string }[];
  hook_chon: number;
  doan: DoanKichBan[];
  tong_giay: number;
  ghi_chu_quay: string[];
  can_xac_minh: string[];
}

export type NoiDungBuoc = YTuong | KeHoach | KichBan;
