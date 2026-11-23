/**
 * Bảng câu hỏi Thương hiệu — chủ shop trả lời trong app (Kho tri thức → Thương hiệu).
 * Câu trả lời lưu ở du_an_kien_thuc (muc = 'thuong-hieu'), noi_dung = { tra_loi: { <ma>: "<câu trả lời>" } }.
 * Mọi bước AI (ý tưởng, kịch bản…) đọc bản ghép `thuongHieuChoAI()`.
 * Thêm / bớt câu hỏi: sửa danh sách dưới đây (câu trả lời cũ theo mã vẫn giữ).
 */

export interface CauHoi {
  ma: string;
  nhom: string;
  hoi: string;
  goi_y: string;
  /** true = nguồn chuẩn, AI tuyệt đối không được nói khác (chính sách, địa chỉ…) */
  chuan?: boolean;
}

export const NHOM_THUONG_HIEU = ['Shop', 'Giọng nói', 'Chính sách', 'Nội dung', 'Nền tảng'] as const;

export const CAU_HOI_THUONG_HIEU: CauHoi[] = [
  // Shop
  { ma: 'gioi-thieu', nhom: 'Shop', hoi: 'Soccerstore.vn là ai?', goi_y: 'Năm thành lập, quy mô, cửa hàng ở đâu, bán qua những kênh nào.' },
  { ma: 'khac-biet', nhom: 'Shop', hoi: 'Điểm khác biệt so với các shop giày bóng đá khác?', goi_y: 'Chính hãng, tư vấn, giá, dịch vụ, kinh nghiệm… Điều gì khách hay khen nhất?' },
  { ma: 'san-pham-chu-luc', nhom: 'Shop', hoi: 'Nhóm sản phẩm chủ lực / muốn đẩy mạnh?', goi_y: 'Hãng, dòng, tầm giá. Có mùa vụ không?' },
  { ma: 'khach-chinh', nhom: 'Shop', hoi: 'Khách chính là ai?', goi_y: 'Tuổi, đá sân gì (5, 7, 11, cỏ nhân tạo / tự nhiên), mức chi, ở đâu, mua online hay tới shop.' },

  // Giọng nói
  { ma: 'nguoi-noi', nhom: 'Giọng nói', hoi: 'Ai thường xuất hiện trên video, xưng hô với khán giả thế nào?', goi_y: 'Tên, vai trò. Xưng "mình / anh / tao…", gọi khán giả là "anh em / các bạn…".' },
  { ma: 'giong', nhom: 'Giọng nói', hoi: 'Giọng điệu mong muốn — 3 tính từ?', goi_y: 'Vd: thân như anh em đá bóng · hiểu nghề · thẳng thắn, không nói quá.' },
  { ma: 'nen-dung', nhom: 'Giọng nói', hoi: 'Từ / câu cửa miệng nên dùng?', goi_y: 'Câu chào, câu chốt quen thuộc, cách gọi sản phẩm…' },
  { ma: 'cam-dung', nhom: 'Giọng nói', hoi: 'Từ / cách nói cấm dùng?', goi_y: 'Vd: chê hãng / shop khác đích danh, hứa "bền mãi mãi", từ lóng thô, nói giá sai…', chuan: true },
  { ma: 'cta', nhom: 'Giọng nói', hoi: 'Lời kêu gọi (CTA) chuẩn?', goi_y: 'Inbox page, ghé shop, link bio, hotline, mã giảm giá… Mỗi nền tảng có khác không?' },

  // Chính sách — nguồn chuẩn
  { ma: 'bao-hanh', nhom: 'Chính sách', hoi: 'Chính sách bảo hành?', goi_y: 'Bảo hành gì, bao lâu, điều kiện. Ghi đúng nguyên văn shop cam kết.', chuan: true },
  { ma: 'doi-tra', nhom: 'Chính sách', hoi: 'Chính sách đổi size / đổi trả?', goi_y: 'Trong bao nhiêu ngày, điều kiện, ai trả phí ship.', chuan: true },
  { ma: 'giao-hang', nhom: 'Chính sách', hoi: 'Giao hàng & thanh toán?', goi_y: 'Ship toàn quốc? Phí, thời gian, COD, kiểm tra hàng trước khi nhận…', chuan: true },
  { ma: 'cua-hang', nhom: 'Chính sách', hoi: 'Cửa hàng: địa chỉ, giờ mở cửa, hotline?', goi_y: 'Ghi đúng để AI đưa vào CTA khi cần.', chuan: true },
  { ma: 'khuyen-mai', nhom: 'Chính sách', hoi: 'Chương trình ưu đãi thường xuyên (nếu có)?', goi_y: 'Ghi rõ thời hạn. Để trống = AI không được tự nhắc khuyến mãi.', chuan: true },
  { ma: 'chinh-hang', nhom: 'Chính sách', hoi: 'Cam kết chính hãng / nguồn hàng?', goi_y: 'Nói thế nào cho đúng, có giấy tờ / tem gì.', chuan: true },

  // Nội dung
  { ma: 'muc-tieu', nhom: 'Nội dung', hoi: 'Mục tiêu video thời gian tới?', goi_y: 'Bán hàng, nhận diện, tăng theo dõi, kéo khách tới shop… Ưu tiên cái nào?' },
  { ma: 'thanh-cong', nhom: 'Nội dung', hoi: 'Video của shop chạy tốt nhất — vì sao tốt?', goi_y: 'Dán 3–5 link + vài chữ vì sao mày nghĩ nó tốt.' },
  { ma: 'that-bai', nhom: 'Nội dung', hoi: 'Video chạy kém — vì sao?', goi_y: 'Dán link nếu có + lý do mày đoán.' },
  { ma: 'tham-khao', nhom: 'Nội dung', hoi: 'Kênh tham khảo / đối thủ làm tốt?', goi_y: 'Link + điểm muốn học, điểm không muốn giống.' },
  { ma: 'khong-lam', nhom: 'Nội dung', hoi: 'Chủ đề / kiểu video không bao giờ làm?', goi_y: 'Vd: drama, chê khách, trend phản cảm…', chuan: true },

  // Nền tảng
  { ma: 'nen-tang', nhom: 'Nền tảng', hoi: 'Khác nhau giữa TikTok / Facebook / YouTube?', goi_y: 'Độ dài, giọng, đối tượng, nền tảng nào ưu tiên.' },
];

export type TraLoiThuongHieu = Record<string, string>;

/** Bản ghép cho AI đọc: chỉ câu đã trả lời; câu "chuẩn" đánh dấu để AI không được nói khác. */
export function thuongHieuChoAI(tra_loi: TraLoiThuongHieu): string {
  const out: string[] = [];
  for (const nhom of NHOM_THUONG_HIEU) {
    const dong = CAU_HOI_THUONG_HIEU.filter((c) => c.nhom === nhom && tra_loi[c.ma]?.trim()).map(
      (c) => `- ${c.hoi}${c.chuan ? ' [NGUỒN CHUẨN — không được nói khác]' : ''}\n  ${tra_loi[c.ma]!.trim().replace(/\n/g, '\n  ')}`,
    );
    if (dong.length) out.push(`### ${nhom}\n${dong.join('\n')}`);
  }
  return out.join('\n\n') || '(chủ shop chưa trả lời bảng câu hỏi thương hiệu)';
}
