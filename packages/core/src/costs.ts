/**
 * Phân loại chi phí AI (bảng llm_calls) để thống kê ở trang Cài đặt.
 *
 * QUY ƯỚC GHI `purpose` CHO TÍNH NĂNG MỚI: "<loại>:<bước>", vd "image:tao-anh", "voice:doc-loi".
 * Loại chưa có trong CATEGORIES vẫn tự hiện thành 1 dòng riêng (tên = phần trước dấu ":"),
 * thêm vào đây để có tên tiếng Việt + tên từng bước.
 * Tính năng cũ ghi purpose không có dấu ":" (bản tin, sản phẩm) — xếp loại theo LEGACY.
 */

export interface CostCategory {
  key: string;
  label: string;
  /** mã bước → tên dễ hiểu */
  steps: Record<string, string>;
}

export const CATEGORIES: CostCategory[] = [
  {
    key: 'digest',
    label: 'Bản tin ý tưởng',
    steps: { classify: 'Phân loại + chấm điểm tin', cluster: 'Gom nhóm tin trùng', enrich: 'Viết gợi ý + caption' },
  },
  {
    key: 'captions',
    label: 'Kho caption',
    steps: { 'tag-captions': 'Gắn nhãn caption', 'style-notes': 'Rút ghi chú văn phong caption' },
  },
  {
    key: 'product',
    label: 'Post sản phẩm',
    steps: {
      'product-write': 'Viết nội dung sản phẩm',
      'product-research': 'Tìm thêm thông tin (AI đọc web)',
      'product-research-search': 'Tìm thêm thông tin (lượt tìm web)',
      'product-research-parse': 'Tìm thêm thông tin (tách thông tin)',
      'product-style': 'Rút luật văn phong sản phẩm',
    },
  },
  {
    key: 'video',
    label: 'Video',
    steps: {
      'chuyen-loi': 'Chuyển lời thành chữ (ElevenLabs)',
      'kho-canh': 'Xem kho cảnh',
      'dan-y': 'Viết dàn ý',
      'canh-tram': 'Xem cảnh trám',
      the: 'Làm thẻ đồ họa',
      'ke-hoach': 'Kế hoạch dựng',
      'kiem-tra': 'Tự kiểm tra khung hình',
      sua: 'Sửa theo góp ý',
    },
  },
  {
    key: 'du-an',
    label: 'Dự án video',
    steps: {
      'doc-du-lieu': 'Đọc dữ liệu khán giả',
      insight: 'Tóm tắt insight khán giả',
      'y-tuong': 'Phát triển ý tưởng',
      'ke-hoach': 'Kế hoạch nội dung',
      'kich-ban': 'Viết kịch bản',
      'bai-hoc': 'Rút bài học',
    },
  },
  { key: 'image', label: 'Làm ảnh', steps: {} },
  { key: 'voice', label: 'Giọng nói (voice)', steps: {} },
];

/** purpose cũ (không có ":") → loại */
const LEGACY: Record<string, string> = {
  classify: 'digest',
  cluster: 'digest',
  enrich: 'digest',
  'tag-captions': 'captions',
  'style-notes': 'captions',
};

export interface CostKind {
  category: string;
  categoryLabel: string;
  step: string;
  stepLabel: string;
}

/** "video:ke-hoach-2" → Video / Kế hoạch dựng; "enrich" → Bản tin / Viết gợi ý; "image:x" → Làm ảnh / x. */
export function classifyCost(purpose: string): CostKind {
  let catKey: string;
  let step: string;
  const i = purpose.indexOf(':');
  if (i > 0) {
    catKey = purpose.slice(0, i);
    step = purpose.slice(i + 1).replace(/-\d+$/, ''); // "ke-hoach-2" = lần gọi thứ 2 của cùng bước
  } else {
    step = purpose;
    catKey = LEGACY[purpose] ?? (purpose.startsWith('product-') ? 'product' : 'other');
  }
  const cat = CATEGORIES.find((c) => c.key === catKey);
  return {
    category: catKey,
    categoryLabel: cat?.label ?? (catKey === 'other' ? 'Khác' : catKey),
    step,
    stepLabel: cat?.steps[step] ?? step,
  };
}

const MODEL_LABEL: Record<string, string> = {
  'claude-opus-5-5': 'Claude Opus 5.5',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5',
  'claude-haiku-5-5': 'Claude Haiku 5.5',
  web_search: 'Tìm kiếm web (Claude)',
  'elevenlabs-scribe': 'ElevenLabs Scribe (chuyển lời)',
};

export const modelLabel = (m: string) => MODEL_LABEL[m] ?? m;
