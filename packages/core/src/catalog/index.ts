import players from './players.json' with { type: 'json' };
import bootLines from './boot-lines.json' with { type: 'json' };

export * from './style.ts';

export interface PlayerEntry {
  name: string;
  aliases: string[];
  isLegend: boolean;
  /** "VN" = cầu thủ Việt Nam (ngăn Việt Nam). Bỏ trống = cầu thủ quốc tế. */
  country?: string;
  bootBrand?: string | null;
  bootModel?: string | null;
  bootSource?: string;
}

export interface BootLineEntry {
  brand: string;
  line: string;
  aliases: string[];
}

export const PLAYERS = players as PlayerEntry[];
export const BOOT_LINES = bootLines as BootLineEntry[];

const norm = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ø/gi, 'o')
    .toLowerCase()
    .trim();

const playerIndex = new Map<string, PlayerEntry>();
for (const p of PLAYERS) for (const n of [p.name, ...p.aliases]) playerIndex.set(norm(n), p);

/** Khớp tên cầu thủ AI trích ra với danh sách theo dõi (theo tên chuẩn hoặc tên gọi khác). */
export function findWatchedPlayer(name: string): PlayerEntry | undefined {
  return playerIndex.get(norm(name));
}
