import seed from './seed/sources.json' with { type: 'json' };
import type { SourceConfig } from './types.ts';

export * from './types.ts';
export * from './normalize.ts';
export * from './scoring.ts';
export * from './settings.ts';
export * from './catalog/index.ts';

/** Danh sách nguồn ban đầu. Khi đã có Supabase, bảng `sources` là nguồn sự thật; file này chỉ để seed. */
export const seedSources = seed as SourceConfig[];
