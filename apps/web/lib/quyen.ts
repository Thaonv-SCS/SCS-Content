/**
 * Danh sách ô tick phân quyền (Cài đặt → Phân quyền). Khớp migration 0027 (profiles.quyen + hàm co_quyen).
 * File không import gì → dùng được cả ở trình duyệt.
 */

export type QuyenModule = 'ban-tin' | 'ban-tin-ql' | 'san-pham' | 'cap-nhat' | 'up-anh' | 'chi-phi';

export const NHOM_QUYEN: { nhom: string; muc: { ma: QuyenModule; ten: string; mo_ta: string }[] }[] = [
  {
    nhom: 'Bản tin',
    muc: [
      { ma: 'ban-tin', ten: 'Xem & dùng bản tin', mo_ta: 'chọn / bỏ / sửa gợi ý, lưu caption' },
      { ma: 'ban-tin-ql', ten: 'Quản lý kho caption, bài thô, nguồn', mo_ta: '' },
    ],
  },
  {
    nhom: 'Sản phẩm',
    muc: [
      { ma: 'san-pham', ten: 'Post sản phẩm', mo_ta: 'viết bằng AI + đẩy lên web' },
      { ma: 'cap-nhat', ten: 'Cập nhật sản phẩm', mo_ta: 'giá, size, tồn kho' },
      { ma: 'up-anh', ten: 'Up ảnh sản phẩm', mo_ta: 'ảnh mô tả, ảnh đại diện, video' },
    ],
  },
  { nhom: 'Khác', muc: [{ ma: 'chi-phi', ten: 'Xem chi phí AI', mo_ta: 'tiền AI ở các trang được vào' }] },
];
export const MA_QUYEN = NHOM_QUYEN.flatMap((n) => n.muc.map((m) => m.ma));

/** Bước Dự án video giao được (khóa trong profiles.du_an_quyen). "kho" = sửa kho tri thức. */
export const BUOC_DU_AN: { ma: string; ten: string; duyet: boolean }[] = [
  { ma: 'y-tuong', ten: 'Ý tưởng (gồm tạo dự án)', duyet: true },
  { ma: 'ke-hoach', ten: 'Kế hoạch', duyet: true },
  { ma: 'kich-ban', ten: 'Kịch bản', duyet: true },
  { ma: 'shotlist', ten: 'Shotlist', duyet: true },
  { ma: 'kho', ten: 'Sửa kho tri thức', duyet: false },
];
