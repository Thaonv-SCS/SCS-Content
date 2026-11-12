export type ProductType = 'boots' | 'ball' | 'gloves' | 'accessory';

export const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  boots: 'Giày',
  ball: 'Bóng',
  gloves: 'Găng tay thủ môn',
  accessory: 'Phụ kiện',
};

export interface SpecField {
  key: string;
  /** Nhãn hiển thị trong bảng thông số trên website. */
  label: string;
  /** Gợi ý cho người nhập. */
  hint?: string;
  options?: string[];
}

/**
 * Phiếu nhập = các dòng của bảng thông số đầu mô tả trên soccerstore.vn (giày: đúng 8 dòng đang dùng).
 * Ô nào để trống thì AI không tự bịa (trừ khi ghi rõ trong prompt), mà báo trong mục "Phiếu còn thiếu".
 */
export const SPEC_FIELDS: Record<ProductType, SpecField[]> = {
  boots: [
    { key: 'line', label: 'Dòng giày', hint: 'vd Nike Mercurial Vapor 16 — để trống thì AI lấy từ tên' },
    { key: 'tier', label: 'Phân khúc', hint: 'vd Pro, phân khúc cao cấp' },
    { key: 'collection', label: 'Bộ sưu tập', hint: 'vd Attack Pack, main pack đầu tiên 2026 · Phối màu gốc: Racer Blue/White' },
    { key: 'soleplate', label: 'Loại đinh', options: ['FG', 'SG', 'AG', 'MG', 'TF', 'IC'] },
    { key: 'weight', label: 'Trọng lượng ( grams )', hint: 'để trống = "N/A, tương đối nhẹ"' },
    { key: 'upper', label: 'Chất liệu upper', hint: 'vd sợi dệt Flyknit, phủ da tổng hợp Nike Skin' },
    { key: 'sole', label: 'Đế giày', hint: 'vd đệm đế Air Zoom cực êm' },
    { key: 'players', label: 'Cầu thủ tiêu biểu', hint: 'để trống thì AI gợi ý (sẽ ghi vào "Cần kiểm tra")' },
  ],
  ball: [
    { key: 'line', label: 'Dòng bóng', hint: 'vd adidas Trionda' },
    { key: 'tier', label: 'Phân khúc', hint: 'vd Pro (bóng thi đấu chính thức), League, Training' },
    { key: 'size', label: 'Size', options: ['3', '4', '5'] },
    { key: 'standard', label: 'Tiêu chuẩn', hint: 'vd FIFA Quality Pro' },
    { key: 'material', label: 'Chất liệu vỏ', hint: 'vd PU, khâu nhiệt' },
    { key: 'tech', label: 'Công nghệ', hint: 'vd CTR-CORE, 20 múi' },
    { key: 'surface', label: 'Mặt sân phù hợp', hint: 'vd cỏ tự nhiên, cỏ nhân tạo' },
    { key: 'used_in', label: 'Giải đấu sử dụng' },
  ],
  gloves: [
    { key: 'line', label: 'Dòng găng', hint: 'vd Nike Vapor Grip3' },
    { key: 'tier', label: 'Phân khúc', hint: 'vd Elite, Pro, Match' },
    { key: 'cut', label: 'Kiểu cắt', options: ['Negative', 'Roll finger', 'Hybrid', 'Flat'] },
    { key: 'latex', label: 'Mủ găng', hint: 'vd German Contact Grip 4mm' },
    { key: 'protection', label: 'Bảo vệ ngón', hint: 'vd có / không xương ngón (finger save)' },
    { key: 'strap', label: 'Quai cổ tay', hint: 'vd quai dán, không quai' },
    { key: 'surface', label: 'Mặt sân / điều kiện', hint: 'vd sân cỏ tự nhiên, trời khô' },
  ],
  accessory: [
    { key: 'kind', label: 'Loại phụ kiện', hint: 'vd tất chống trượt, bọc ống đồng, túi giày' },
    { key: 'material', label: 'Chất liệu' },
    { key: 'use', label: 'Công dụng' },
    { key: 'size', label: 'Kích cỡ' },
  ],
};

/** Bản viết hiện tại của một sản phẩm — khớp các ô trên trang sửa sản phẩm WooCommerce + Yoast. */
export interface ProductOutput {
  seo_title: string;
  meta_description: string;
  focus_keyphrase: string;
  short_description_html: string;
  description_html: string;
  tags: string[];
  slug: string;
  image_alt: string;
  /** Danh mục AI gợi ý (id WooCommerce), người dùng xác nhận trước khi tạo nháp. */
  suggested_category_ids: number[];
  /** Ô phiếu còn thiếu nên bổ sung. */
  missing: string[];
  /** Điều AI viết dựa trên kiến thức chung, chưa có trong phiếu — cần kiểm tra trước khi đăng. */
  to_verify: { claim: string; reason: string }[];
  model?: string;
  generated_at?: string;
}

export interface ResearchFact {
  /** Khóa ô phiếu nên điền (vd "upper"), hoặc "other". */
  field: string;
  value: string;
  source_url: string;
  source_title: string;
}

export interface ResearchResult {
  facts: ResearchFact[];
  at: string;
}
