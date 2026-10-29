import type { Category } from './types.ts';
import { findWatchedPlayer } from './catalog/index.ts';

/** Kết quả phân loại một bài (AI trả về, lưu ở raw_items.classification). */
export interface Classification {
  category: Category | 'discard';
  players: string[];
  brands: string[];
  boot_lines: string[];
  competitions: string[];
  has_boot_angle: boolean;
  /** 0–10: mức "đáng làm" theo tiêu chí của mày. */
  newsworthiness: number;
  reason: string;
}

/** Giải đấu "trận đáng chú ý": Ngoại hạng Anh, La Liga, Cúp C1, đội tuyển quốc gia châu Âu. */
export const MAJOR_COMPETITIONS = /premier league|ngoại hạng|la ?liga|champions league|cúp c1|ucl|euro|nations league|world cup|qualif|vòng loại/i;

/** Mã giải của football-data.org tính là "trận đáng chú ý" (ngăn sự kiện). BL1/FL1 chỉ dùng cho ngăn cầu thủ. */
export const MAJOR_COMPETITION_CODES = new Set(['PL', 'PD', 'CL', 'EC', 'WC']);
export const COMPETITION_NAMES: Record<string, string> = {
  PL: 'Premier League',
  PD: 'La Liga',
  CL: 'Champions League',
  BL1: 'Bundesliga',
  FL1: 'Ligue 1',
  EC: 'EURO',
  WC: 'World Cup',
};

/**
 * Số mục mỗi ngăn. Bản tin chính 12 mục (6 giày · 2 cầu thủ · 2 sự kiện · 2 Việt Nam);
 * ngăn phụ (áo đấu, bóng & phụ kiện) nằm ngoài, chỉ hiện khi có tin đủ điểm.
 */
export const SLOT_QUOTAS: Record<Category, number> = { boots: 6, player: 2, event: 2, vietnam: 2, kits: 2, gear: 1 };
export const MAIN_SLOTS: Category[] = ['boots', 'player', 'event', 'vietnam'];
export const EXTRA_SLOTS: Category[] = ['kits', 'gear'];

/** Điểm tối thiểu để vào bản tin. */
export const MIN_SCORE: Record<Category, number> = { boots: 0.45, player: 0.45, event: 0.45, vietnam: 0.4, kits: 0.5, gear: 0.5 };

const WEIGHTS: Record<Category, Record<keyof ScoreParts, number>> = {
  boots: { llm: 0.35, fresh: 0.2, source: 0.15, spread: 0.1, boot: 0.1, player: 0.1, match: 0 },
  player: { llm: 0.3, player: 0.25, boot: 0.15, match: 0.1, fresh: 0.1, source: 0.05, spread: 0.05 },
  event: { llm: 0.3, match: 0.25, spread: 0.15, fresh: 0.15, boot: 0.1, source: 0.05, player: 0 },
  // Việt Nam: ưu tiên cầu thủ trong danh sách theo dõi và góc giày — hợp nhất với shop
  vietnam: { llm: 0.35, player: 0.2, boot: 0.2, fresh: 0.15, spread: 0.05, source: 0.05, match: 0 },
  kits: { llm: 0.4, fresh: 0.25, source: 0.2, spread: 0.15, boot: 0, player: 0, match: 0 },
  gear: { llm: 0.4, fresh: 0.25, source: 0.2, spread: 0.15, boot: 0, player: 0, match: 0 },
};

export interface ScoreParts {
  llm: number;
  fresh: number;
  source: number;
  spread: number;
  boot: number;
  player: number;
  match: number;
}

export interface ScoreInput {
  classification: Classification;
  /** Thời điểm đăng (hoặc phát hiện) sớm nhất trong cụm. */
  publishedAt: Date;
  /** Trọng số cao nhất trong các nguồn của cụm. */
  sourceWeight: number;
  /** Số nguồn khác nhau cùng đưa tin. */
  sourceCount: number;
  /** Tin nhắc tới đội vừa đá ở giải lớn (theo dữ liệu football-data). */
  majorMatch?: boolean;
  now?: Date;
}

export function scoreStory(category: Category, input: ScoreInput): { score: number; parts: ScoreParts } {
  const c = input.classification;
  const hours = ((input.now ?? new Date()).getTime() - input.publishedAt.getTime()) / 3600_000;
  const watched = c.players.map(findWatchedPlayer).filter(Boolean);

  const parts: ScoreParts = {
    llm: Math.min(10, Math.max(0, c.newsworthiness)) / 10,
    fresh: Math.max(0, 1 - Math.max(0, hours) / 48),
    source: input.sourceWeight,
    spread: Math.min(1, (input.sourceCount - 1) / 3),
    boot: c.has_boot_angle ? 1 : 0,
    // Cầu thủ trong danh sách theo dõi (kể cả legend): 1; cầu thủ khác: 0.5
    player: watched.length ? 1 : c.players.length ? 0.5 : 0,
    match: input.majorMatch || c.competitions.some((x) => MAJOR_COMPETITIONS.test(x)) ? 1 : 0,
  };

  const w = WEIGHTS[category];
  const score = (Object.keys(parts) as (keyof ScoreParts)[]).reduce((sum, k) => sum + parts[k] * w[k], 0);
  return { score: Math.round(score * 1000) / 1000, parts };
}
