/**
 * Bước 1–2 của pipeline: lấy bài từ các nguồn đang bật, chuẩn hóa, lọc trùng tuyệt đối.
 *
 *   npm run fetch                          # mọi nguồn đang bật, bài trong 48 giờ
 *   npm run fetch -- --hours=24 --source=footy-headlines
 *
 * Có Supabase → ghi vào bảng raw_items. Không có → ghi ra .data/raw-<ngày>.json.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { canonicalizeUrl, seedSources, titleHash, type RawItemInput } from '@app/core';
import { fetchMatches, getConnector } from '@app/connectors';
import { getDb, insertRawItems, loadKnownUrls, loadSources, recordSourceResult, upsertMatches, type DbSource } from './db.ts';

const { values: args } = parseArgs({
  options: { hours: { type: 'string', default: '48' }, source: { type: 'string' } },
});

const db = getDb();
const since = new Date(Date.now() - Number(args.hours) * 3600_000);
const allSources: DbSource[] = db ? await loadSources(db) : seedSources.map((s) => ({ ...s, id: s.slug, failCount: 0 }));
const sources = allSources.filter((s) => (args.source ? s.slug === args.source : s.enabled));
const known = db ? await loadKnownUrls(db) : new Set<string>();

console.log(`Chế độ: ${db ? 'Supabase' : 'local (chưa cấu hình Supabase)'} · ${sources.length} nguồn · từ ${since.toISOString()}\n`);

const report: { source: string; status: string; items: number }[] = [];
const collected: RawItemInput[] = [];

/** Nguồn kết quả trận: không ra bài viết, ghi thẳng vào bảng matches. */
async function fetchMatchSource(source: DbSource): Promise<number> {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) throw new Error('Thiếu FOOTBALL_DATA_TOKEN');
  const competitions = (source.config?.competitions as string[] | undefined) ?? ['PL', 'PD', 'CL'];
  const matches = await fetchMatches(token, competitions, since, new Date());
  if (db) await upsertMatches(db, matches);
  else matches.forEach((m) => console.log(`  [${source.slug}] ${m.competition} ${m.home} ${m.homeScore}-${m.awayScore} ${m.away}`));
  return matches.length;
}

for (const source of sources) {
  const connector = getConnector(source.kind);
  if (!connector && source.kind !== 'match_api') {
    report.push({ source: source.slug, status: `chưa có connector "${source.kind}"`, items: 0 });
    continue;
  }
  const started = Date.now();
  try {
    if (!connector) {
      const n = await fetchMatchSource(source);
      report.push({ source: source.slug, status: `ok ${((Date.now() - started) / 1000).toFixed(1)}s (trận)`, items: n });
      if (db) await recordSourceResult(db, source, null);
      continue;
    }
    const items = await connector.fetch(source, {
      since,
      log: (m) => console.log(`  [${source.slug}] ${m}`),
      isKnown: (u) => known.has(u),
    });
    collected.push(...items);
    report.push({ source: source.slug, status: `ok ${((Date.now() - started) / 1000).toFixed(1)}s`, items: items.length });
    if (db) await recordSourceResult(db, source, null);
  } catch (err) {
    const msg = (err as Error).message;
    report.push({ source: source.slug, status: `LỖI: ${msg}`, items: 0 });
    if (db) await recordSourceResult(db, source, msg);
  }
}

// Lọc trùng trong lượt chạy: cùng URL chuẩn hoặc cùng tiêu đề
const seenUrl = new Set<string>();
const seenTitle = new Set<string>();
const unique = collected.filter((i) => {
  const u = canonicalizeUrl(i.url);
  const t = titleHash(i.title);
  if (seenUrl.has(u) || seenTitle.has(t)) return false;
  seenUrl.add(u);
  seenTitle.add(t);
  return true;
});

console.table(report);
console.log(`\nTổng: ${collected.length} bài, sau lọc trùng: ${unique.length}`);

if (db) {
  const ids = new Map(allSources.map((s) => [s.slug, s.id]));
  const inserted = await insertRawItems(db, ids, unique);
  console.log(`Đã thêm ${inserted} bài mới vào raw_items.`);
} else {
  await mkdir('../../.data', { recursive: true });
  const file = `../../.data/raw-${new Date().toISOString().slice(0, 10)}.json`;
  await writeFile(file, JSON.stringify(unique, null, 2));
  console.log(`Đã ghi ra ${file.replace('../../', '')}`);
}
