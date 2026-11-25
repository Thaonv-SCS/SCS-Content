/** Khuôn video (bảng du_an_khuon). Bản nháp ban đầu nằm trong migration 0020; sửa trong app, bổ sung video mẫu dần. */

export interface NhipKhuon {
  ten: string;
  mo_ta: string;
  /** khoảng giây, vd "0–3" */
  giay: string;
}

export interface NoiDungKhuon {
  muc_tieu: string;
  khi_nao_dung: string;
  do_dai: string;
  nguoi_noi: string;
  nhip: NhipKhuon[];
  hook_mau: string[];
  nen_tranh: string[];
  phong_cach_dung: string;
  ghi_chu: string;
  /** 'nhap' = bản nháp chung, chưa học từ video mẫu của shop */
  trang_thai: 'nhap' | 'da-hoc-tu-mau';
}

export interface VideoMau {
  link: string;
  ghi_chu: string;
  them_luc: string;
}

export interface Khuon {
  ma: string;
  ten: string;
  thu_tu: number;
  noi_dung: NoiDungKhuon;
  video_mau: VideoMau[];
}

/** "Tên | mô tả | giây" mỗi dòng ↔ danh sách nhịp (để sửa bằng một ô chữ). */
export const nhipThanhChu = (nhip: NhipKhuon[]) => nhip.map((n) => `${n.ten} | ${n.mo_ta} | ${n.giay}`).join('\n');
export const chuThanhNhip = (s: string): NhipKhuon[] =>
  s
    .split('\n')
    .map((l) => l.split('|').map((x) => x.trim()))
    .filter((p) => p[0])
    .map(([ten = '', mo_ta = '', giay = '']) => ({ ten, mo_ta, giay }));

/** Bản cho AI đọc. */
export function khuonChoAI(k: Khuon): string {
  const n = k.noi_dung;
  return [
    `### Khuôn "${k.ten}" (${k.ma})${n.trang_thai === 'nhap' ? ' — bản nháp chung, chưa học từ video của shop' : ''}`,
    `Mục tiêu: ${n.muc_tieu}`,
    `Khi nào dùng: ${n.khi_nao_dung}`,
    `Độ dài: ${n.do_dai} · Người nói: ${n.nguoi_noi} · Phong cách dựng: ${n.phong_cach_dung}`,
    `Các nhịp:\n${n.nhip.map((x, i) => `${i + 1}. ${x.ten} (${x.giay}s): ${x.mo_ta}`).join('\n')}`,
    n.hook_mau.length ? `Hook mẫu: ${n.hook_mau.map((h) => `"${h}"`).join(' · ')}` : '',
    n.nen_tranh.length ? `Nên tránh: ${n.nen_tranh.join(' · ')}` : '',
    n.ghi_chu ? `Ghi chú của chủ shop: ${n.ghi_chu}` : '',
    k.video_mau.length ? `Video mẫu của shop: ${k.video_mau.map((v) => `${v.link}${v.ghi_chu ? ` (${v.ghi_chu})` : ''}`).join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Nội dung khởi đầu cho khuôn mới tạo trống. */
export const khuonTrong = (): NoiDungKhuon => ({
  muc_tieu: '',
  khi_nao_dung: '',
  do_dai: '60–90 giây',
  nguoi_noi: '1 người',
  nhip: [
    { ten: 'Hook', mo_ta: 'Câu mở gây tò mò', giay: '0–3' },
    { ten: 'Thân', mo_ta: '', giay: '3–60' },
    { ten: 'Kết + CTA', mo_ta: '', giay: '60–75' },
  ],
  hook_mau: [],
  nen_tranh: [],
  phong_cach_dung: 'co-ban',
  ghi_chu: '',
  trang_thai: 'nhap',
});

/** Tên khuôn → mã (chữ thường không dấu, nối gạch), vd "Unbox giày mới" → "unbox-giay-moi". */
export const taoMaKhuon = (ten: string) =>
  ten
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'khuon';
