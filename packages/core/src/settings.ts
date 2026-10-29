export interface AppSettings {
  schedule_enabled: boolean;
  /** Số bản tin liên tiếp chưa xem thì tự tạm dừng. 0 = không tự dừng. */
  auto_pause_days: number;
  daily_budget_usd: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  schedule_enabled: true,
  auto_pause_days: 3,
  daily_budget_usd: 3,
};

/** Trạng thái lần chạy pipeline gần nhất — lưu ở settings.last_run. */
export type RunTask = 'digest' | 'style';

export type RunStatus = {
  status: 'queued' | 'running' | 'done' | 'failed';
  trigger: string;
  task?: RunTask;
  step?: string;
  started_at: string;
  finished_at?: string;
  message?: string;
};

/** Ghi chú văn phong AI rút ra từ kho caption — lưu ở settings.style_notes, admin sửa tay được. */
export type StyleNotes = {
  text: string;
  updated_at: string;
  /** Số caption trong kho lúc tạo ghi chú — để biết khi nào cần cập nhật lại. */
  caption_count: number;
  edited_by_admin?: boolean;
};

/** Kho có thêm từng này caption kể từ lần ghi chú trước thì tự cập nhật ghi chú. */
export const STYLE_NOTES_REFRESH_EVERY = 10;

/** Caption ngắn hơn ngưỡng này (ký tự) tính là caption ngắn. */
export const SHORT_CAPTION_MAX = 160;

export function captionHash(text: string): string {
  // FNV-1a 64-bit: đủ để chống trùng, chạy được cả ở trình duyệt lẫn server
  let h = 0xcbf29ce484222325n;
  for (const ch of text.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()) {
    h ^= BigInt(ch.codePointAt(0)!);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

/** Lần chạy "đang chạy" quá lâu coi như đã chết (máy tắt giữa chừng…), cho phép chạy lại. */
export const RUN_STALE_MINUTES = 25;

export function isRunActive(run: RunStatus | null | undefined): boolean {
  if (!run || (run.status !== 'queued' && run.status !== 'running')) return false;
  return Date.now() - new Date(run.started_at).getTime() < RUN_STALE_MINUTES * 60_000;
}

/** Gộp các dòng của bảng `settings` (key/value) với giá trị mặc định. */
export function parseSettings(rows: { key: string; value: unknown }[] | null): AppSettings {
  const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const r of rows ?? []) if (r.key in out) out[r.key] = r.value;
  return out as unknown as AppSettings;
}
