import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { canonicalizeUrl, titleHash, type RawItemInput, type SourceConfig } from '@app/core';
import type { MatchResult } from '@app/connectors';

/** null khi chưa cấu hình Supabase — pipeline chạy chế độ local, ghi ra file JSON. */
export function getDb(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

type SourceRow = {
  id: string;
  slug: string;
  name: string;
  kind: SourceConfig['kind'];
  url: string;
  category_hint: SourceConfig['categoryHint'];
  weight: number;
  enabled: boolean;
  config: Record<string, unknown> | null;
  note: string | null;
  fail_count: number;
};

export type DbSource = SourceConfig & { id: string; failCount: number };

export async function loadSources(db: SupabaseClient): Promise<DbSource[]> {
  const { data, error } = await db.from('sources').select('*').order('slug');
  if (error) throw error;
  return (data as SourceRow[]).map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    kind: r.kind,
    url: r.url,
    categoryHint: r.category_hint,
    weight: r.weight,
    enabled: r.enabled,
    config: r.config ?? undefined,
    note: r.note ?? undefined,
    failCount: r.fail_count,
  }));
}

export async function upsertSeedSources(db: SupabaseClient, sources: SourceConfig[]) {
  const rows = sources.map((s) => ({
    slug: s.slug,
    name: s.name,
    kind: s.kind,
    url: s.url,
    category_hint: s.categoryHint,
    weight: s.weight,
    enabled: s.enabled,
    config: s.config ?? null,
    note: s.note ?? null,
  }));
  // Chỉ thêm nguồn mới; không ghi đè nguồn mày đã chỉnh trong app
  const { error } = await db.from('sources').upsert(rows, { onConflict: 'slug', ignoreDuplicates: true });
  if (error) throw error;
}

export async function recordSourceResult(db: SupabaseClient, source: DbSource, error: string | null) {
  const patch = error
    ? { last_error: error, fail_count: source.failCount + 1, last_run_at: new Date().toISOString() }
    : { last_error: null, fail_count: 0, last_run_at: new Date().toISOString(), last_success_at: new Date().toISOString() };
  await db.from('sources').update(patch).eq('id', source.id);
}

/** URL đã lấy trong `days` ngày qua — để connector sitemap không tải lại trang cũ. */
export async function loadKnownUrls(db: SupabaseClient, days = 60): Promise<Set<string>> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data, error } = await db.from('raw_items').select('canonical_url').gte('discovered_at', since);
  if (error) throw error;
  return new Set((data ?? []).map((r: { canonical_url: string }) => r.canonical_url));
}

export async function upsertMatches(db: SupabaseClient, matches: MatchResult[]) {
  if (!matches.length) return;
  const { error } = await db.from('matches').upsert(
    matches.map((m) => ({
      id: m.id,
      competition: m.competition,
      home: m.home,
      away: m.away,
      home_score: m.homeScore,
      away_score: m.awayScore,
      played_at: m.playedAt.toISOString(),
      raw: m.raw,
    })),
    { onConflict: 'id' },
  );
  if (error) throw error;
}

/** Trả về số bài mới thực sự được thêm (bài đã có theo canonical_url sẽ bị bỏ qua). */
export async function insertRawItems(db: SupabaseClient, sourceIds: Map<string, string>, items: RawItemInput[]): Promise<number> {
  if (!items.length) return 0;
  const rows = items.map((i) => ({
    source_id: sourceIds.get(i.sourceSlug),
    url: i.url,
    canonical_url: canonicalizeUrl(i.url),
    title: i.title,
    title_hash: titleHash(i.title),
    content: i.content ?? null,
    author: i.author ?? null,
    image_urls: i.imageUrls,
    published_at: i.publishedAt?.toISOString() ?? null,
  }));
  const { data, error } = await db
    .from('raw_items')
    .upsert(rows, { onConflict: 'canonical_url', ignoreDuplicates: true })
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}
