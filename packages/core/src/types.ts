export type SourceKind = 'rss' | 'sitemap' | 'html' | 'manual' | 'x' | 'match_api';

/** Ngăn của bản tin. `match` là nguồn tin trận đấu, được phân loại tiếp thành player/event. */
export type Category = 'boots' | 'player' | 'event' | 'vietnam' | 'kits' | 'gear';

export const CATEGORY_LABEL: Record<Category, string> = {
  boots: 'Giày',
  player: 'Cầu thủ',
  event: 'Sự kiện',
  vietnam: 'Việt Nam',
  kits: 'Áo đấu',
  gear: 'Bóng & phụ kiện',
};
export type CategoryHint = Category | 'match' | 'mixed';
/* CATEGORY_LABEL ở trên; thêm ngăn mới thì cập nhật cả migration (check constraint) và prompt phân loại. */

export interface SourceConfig {
  slug: string;
  name: string;
  kind: SourceKind;
  url: string;
  categoryHint: CategoryHint;
  /** 0–1, dùng khi chấm điểm. */
  weight: number;
  enabled: boolean;
  /** Tham số riêng của từng loại connector. */
  config?: Record<string, unknown>;
  note?: string;
}

/** Bài viết thô do connector trả về, chưa qua lọc trùng hay AI. */
export interface RawItemInput {
  sourceSlug: string;
  url: string;
  title: string;
  content?: string;
  author?: string;
  imageUrls: string[];
  /** null khi nguồn không cung cấp ngày đăng. */
  publishedAt: Date | null;
  raw?: unknown;
}

export interface ConnectorContext {
  /** Chỉ lấy bài mới hơn mốc này (khi nguồn có ngày đăng). */
  since: Date;
  log: (msg: string) => void;
  /** URL (đã chuẩn hóa) đã có trong DB — connector bỏ qua để khỏi tải lại. */
  isKnown?: (canonicalUrl: string) => boolean;
}

export interface Connector {
  kind: SourceKind;
  fetch(source: SourceConfig, ctx: ConnectorContext): Promise<RawItemInput[]>;
}
