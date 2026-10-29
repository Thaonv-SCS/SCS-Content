/**
 * Bước 3–8 của pipeline: phân loại → chấm điểm → gom cụm → chọn theo ngăn → viết gợi ý → lưu bản tin.
 *
 *   npm run digest                   # bản tin hôm nay (giờ VN)
 *   npm run digest -- --force        # tạo lại bản tin hôm nay (xóa bản cũ + phản hồi trên đó)
 *   npm run digest -- --hours=72     # xét bài trong 72 giờ qua
 */
import { parseArgs } from 'node:util';
import {
  COMPETITION_NAMES,
  EXTRA_SLOTS,
  findWatchedPlayer,
  MAIN_SLOTS,
  MAJOR_COMPETITION_CODES,
  MIN_SCORE,
  parseSettings,
  STYLE_NOTES_REFRESH_EVERY,
  type StyleNotes,
  scoreStory,
  SLOT_QUOTAS,
  type Category,
  type Classification,
} from '@app/core';
import { getDb } from './db.ts';
import { Budget, BudgetExceededError } from './ai/client.ts';
import { classifyBatch } from './ai/classify.ts';
import { clusterTitles } from './ai/cluster.ts';
import { buildEnrichSystem, enrichStory, PROMPT_VERSION } from './ai/enrich.ts';
import { loadCaptionLibrary, pickExamples, tagNewCaptions, type CaptionRow } from './ai/captions.ts';
import { generateStyleNotes } from './ai/style.ts';

const { values: args } = parseArgs({
  options: {
    hours: { type: 'string', default: '48' },
    force: { type: 'boolean', default: false },
    /** Số ứng viên tối đa mỗi ngăn đưa vào bước gom cụm. */
    candidates: { type: 'string', default: '15' },
  },
});

const db = getDb();
if (!db) throw new Error('Cần SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY trong .env');
if (!process.env.ANTHROPIC_API_KEY) throw new Error('Cần ANTHROPIC_API_KEY trong .env');

const { data: settingRows, error: sErr } = await db.from('settings').select('key,value');
// Chưa có bảng settings (chưa chạy migration 0003) thì dùng trần trong .env
const budget = sErr ? new Budget(db) : new Budget(db, parseSettings(settingRows).daily_budget_usd);
await budget.init();
const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
const windowStart = new Date(Date.now() - Number(args.hours) * 3600_000).toISOString();
console.log(`Bản tin ${date} · xét bài từ ${windowStart} · đã dùng hôm nay $${budget.spentToday.toFixed(3)}/${budget.dailyLimitUsd}`);

// ───────────── Bản tin đã tồn tại? ─────────────
const { data: existing } = await db.from('digests').select('id').eq('date', date).maybeSingle();
if (existing && !args.force) {
  console.log('Bản tin hôm nay đã có. Dùng --force để tạo lại.');
  process.exit(0);
}

type Row = {
  id: string;
  url: string;
  title: string;
  content: string | null;
  image_urls: string[];
  published_at: string | null;
  discovered_at: string;
  classification: Classification | null;
  sources: { name: string; weight: number; category_hint: string } | null;
};
const SELECT = 'id,url,title,content,image_urls,published_at,discovered_at,classification,sources(name,weight,category_hint)';

// ───────────── 0. Kết quả trận trong cửa sổ (football-data) ─────────────
type MatchRow = {
  competition: string;
  home: string;
  away: string;
  home_score: number | null;
  away_score: number | null;
  raw: { homeTeam?: { name: string }; awayTeam?: { name: string } } | null;
};
const { data: matchData } = await db
  .from('matches')
  .select('competition,home,away,home_score,away_score,raw')
  .gte('played_at', windowStart)
  .order('played_at');
const matches = (matchData ?? []) as MatchRow[];
const matchContext = matches
  .map((m) => `- ${COMPETITION_NAMES[m.competition] ?? m.competition}: ${m.home} ${m.home_score}-${m.away_score} ${m.away}`)
  .join('\n');

// Tên đội của các trận ở giải lớn, để nhận ra tin nhắc tới trận đó
const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const teamPatterns = matches
  .filter((m) => MAJOR_COMPETITION_CODES.has(m.competition))
  .flatMap((m) => [m.home, m.away, m.raw?.homeTeam?.name, m.raw?.awayTeam?.name])
  .filter((n): n is string => !!n)
  .map((n) => fold(n).replace(/\b(fc|cf|afc|sc|ssc|club|de futbol)\b/g, '').trim())
  .filter((n) => n.length >= 4)
  .map((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`));
const mentionsMajorMatch = (rows: { title: string; content: string | null }[]) =>
  rows.some((r) => teamPatterns.some((p) => p.test(fold(`${r.title} ${(r.content ?? '').slice(0, 1000)}`))));
console.log(
  `[0] ${matches.length} trận đã đá trong cửa sổ (${matches.filter((m) => MAJOR_COMPETITION_CODES.has(m.competition)).length} trận ở giải lớn)`,
);

// ───────────── 1. Phân loại bài chưa phân loại ─────────────
{
  const { data, error } = await db
    .from('raw_items')
    .select(SELECT)
    .is('classified_at', null)
    .gte('discovered_at', windowStart)
    .limit(1000);
  if (error) throw error;
  const rows = data as unknown as Row[];
  console.log(`\n[1] Phân loại ${rows.length} bài mới…`);
  for (let i = 0; i < rows.length; i += 25) {
    const batch = rows.slice(i, i + 25);
    const results = await classifyBatch(
      batch.map((r) => ({
        title: r.title,
        content: r.content,
        sourceName: r.sources?.name ?? '?',
        categoryHint: r.sources?.category_hint ?? 'mixed',
      })),
      budget,
      matchContext,
    );
    await Promise.all(
      batch.map((r, j) =>
        results[j]
          ? db.from('raw_items').update({ classification: results[j], classified_at: new Date().toISOString() }).eq('id', r.id)
          : null,
      ),
    );
    process.stdout.write(`  ${Math.min(i + 25, rows.length)}/${rows.length}\r`);
  }
}

// ───────────── 2. Ứng viên: bài trong cửa sổ, chưa từng vào bản tin 3 ngày qua ─────────────
const recentSince = new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10);
const { data: recentSugs } = await db
  .from('suggestions')
  .select('story_id,title_vi,digests!inner(date)')
  .gte('digests.date', recentSince)
  .lt('digests.date', date);
const recentStoryIds = (recentSugs ?? []).map((s: { story_id: string }) => s.story_id);
const recentTitles = (recentSugs ?? []).map((s: { title_vi: string | null }) => s.title_vi).filter(Boolean) as string[];
const usedItemIds = new Set<string>();
if (recentStoryIds.length) {
  const { data } = await db.from('story_items').select('raw_item_id').in('story_id', recentStoryIds);
  (data ?? []).forEach((r: { raw_item_id: string }) => usedItemIds.add(r.raw_item_id));
}

const { data: classified, error: cErr } = await db
  .from('raw_items')
  .select(SELECT)
  .not('classified_at', 'is', null)
  .gte('discovered_at', windowStart)
  .limit(2000);
if (cErr) throw cErr;

const when = (r: Row) => new Date(r.published_at ?? r.discovered_at);
const scoredItems = (classified as unknown as Row[])
  .filter((r) => r.classification && r.classification.category !== 'discard' && !usedItemIds.has(r.id))
  .filter((r) => when(r).toISOString() >= windowStart)
  .map((r) => {
    const cat = r.classification!.category as Category;
    const { score } = scoreStory(cat, {
      classification: r.classification!,
      publishedAt: when(r),
      sourceWeight: r.sources?.weight ?? 0.5,
      sourceCount: 1,
    });
    return { row: r, cat, score };
  })
  .sort((a, b) => b.score - a.score);
// Lấy ứng viên riêng từng ngăn để ngăn nhiều bài (vd tin châu Âu) không chèn hết chỗ của ngăn ít bài (vd Việt Nam)
const perSlot = Number(args.candidates);
const candidates = (Object.keys(SLOT_QUOTAS) as Category[]).flatMap((cat) =>
  scoredItems.filter((c) => c.cat === cat).slice(0, Math.max(perSlot, SLOT_QUOTAS[cat] * 3)),
);
console.log(
  `\n[2] ${candidates.length} ứng viên: ` +
    (Object.keys(SLOT_QUOTAS) as Category[]).map((c) => `${c} ${candidates.filter((x) => x.cat === c).length}`).join(', ') +
    ` (loại ${usedItemIds.size} bài đã dùng gần đây)`,
);

// ───────────── 3. Gom cụm tin trùng sự kiện ─────────────
const groups = candidates.length ? await clusterTitles(candidates.map((c) => c.row.title), recentTitles, budget) : [];

type Story = {
  cat: Category;
  score: number;
  parts: unknown;
  members: Row[];
  classification: Classification;
};
const stories: Story[] = [];
for (const g of groups) {
  if (g.alreadyCovered) continue;
  const members = g.members.map((m) => candidates[m]!).sort((a, b) => b.score - a.score);
  const lead = members[0]!;
  const cls = members.map((m) => m.row.classification!);
  const merged: Classification = {
    ...lead.row.classification!,
    players: [...new Set(cls.flatMap((c) => c.players))],
    brands: [...new Set(cls.flatMap((c) => c.brands))],
    boot_lines: [...new Set(cls.flatMap((c) => c.boot_lines))],
    competitions: [...new Set(cls.flatMap((c) => c.competitions))],
    has_boot_angle: cls.some((c) => c.has_boot_angle),
    newsworthiness: Math.max(...cls.map((c) => c.newsworthiness)),
  };
  const { score, parts } = scoreStory(lead.cat, {
    classification: merged,
    publishedAt: new Date(Math.min(...members.map((m) => when(m.row).getTime()))),
    sourceWeight: Math.max(...members.map((m) => m.row.sources?.weight ?? 0.5)),
    sourceCount: new Set(members.map((m) => m.row.sources?.name)).size,
    majorMatch: (lead.cat === 'player' || lead.cat === 'event') && mentionsMajorMatch(members.map((m) => m.row)),
  });
  stories.push({ cat: lead.cat, score, parts, members: members.map((m) => m.row), classification: merged });
}
console.log(`[3] ${stories.length} cụm tin (${groups.length - stories.length} cụm trùng bản tin trước)`);

// ───────────── 4. Chọn theo ngăn, ngăn thiếu thì nhường chỗ ─────────────
const eligible = stories.filter((s) => s.score >= MIN_SCORE[s.cat]).sort((a, b) => b.score - a.score);
const picked: (Story & { isFiller: boolean })[] = [];

// Đa dạng: một cầu thủ tối đa 2 mục trong bản tin, và chỉ 1 mục ở ngăn cầu thủ
const leadPlayer = (s: Story) => {
  const name = s.classification.players[0];
  return name ? (findWatchedPlayer(name)?.name ?? name) : null;
};
const canTake = (s: Story) => {
  if (picked.some((x) => x.members[0]!.id === s.members[0]!.id)) return false;
  const p = leadPlayer(s);
  if (!p) return true;
  const same = picked.filter((x) => leadPlayer(x) === p);
  return same.length < 2 && !(s.cat === 'player' && same.some((x) => x.cat === 'player'));
};
const take = (s: Story, isFiller: boolean) => picked.push({ ...s, isFiller });

for (const slot of MAIN_SLOTS) {
  let n = 0;
  for (const s of eligible.filter((x) => x.cat === slot)) {
    if (n >= SLOT_QUOTAS[slot]) break;
    if (canTake(s)) (take(s, false), n++);
  }
}
const mainTotal = MAIN_SLOTS.reduce((n, s) => n + SLOT_QUOTAS[s], 0);
for (const s of eligible) {
  if (picked.length >= mainTotal) break;
  if (MAIN_SLOTS.includes(s.cat) && canTake(s)) take(s, true);
}
picked.sort((a, b) => b.score - a.score);
for (const slot of EXTRA_SLOTS) {
  eligible.filter((s) => s.cat === slot).slice(0, SLOT_QUOTAS[slot]).forEach((s) => take(s, false));
}
console.log(
  `[4] Chọn ${picked.length} mục: ` +
    (Object.keys(SLOT_QUOTAS) as Category[]).map((c) => `${c} ${picked.filter((p) => p.cat === c).length}`).join(', '),
);

// ───────────── 5. Tạo bản tin ─────────────
if (existing) await db.from('digests').delete().eq('id', existing.id);
const { data: digest, error: dErr } = await db.from('digests').insert({ date, status: 'draft' }).select('id').single();
if (dErr || !digest) throw dErr ?? new Error('Không tạo được bản tin');
const digestId: string = digest.id;

// ───────────── Kho caption: gắn nhãn caption mới, cập nhật ghi chú văn phong khi kho có thêm đủ caption ─────────────
let library: CaptionRow[] = [];
let styleNotes: StyleNotes | undefined;
try {
  const tagged = await tagNewCaptions(db, budget);
  library = await loadCaptionLibrary(db);
  const { data } = await db.from('settings').select('value').eq('key', 'style_notes').maybeSingle();
  styleNotes = data?.value as StyleNotes | undefined;
  if (library.length >= 5 && library.length - (styleNotes?.caption_count ?? 0) >= STYLE_NOTES_REFRESH_EVERY) {
    console.log(`[kho] ${library.length} caption — cập nhật ghi chú văn phong…`);
    styleNotes = await generateStyleNotes(db, budget, library);
  }
  console.log(`[kho] ${library.length} caption (gắn nhãn mới ${tagged})${styleNotes ? ' · có ghi chú văn phong' : ''}`);
} catch (err) {
  console.warn(`  ⚠ kho caption: ${(err as Error).message} — dùng caption mẫu cố định`);
}
const enrichSystem = buildEnrichSystem(styleNotes?.text);

// ───────────── 6. Viết gợi ý (song song 4 luồng) ─────────────
console.log(`[5] Viết gợi ý bằng AI…`);
let done = 0;
let failed = 0;
let stopped = false;
async function processOne(s: (typeof picked)[number], rank: number) {
  if (stopped) return;
  const { data: story, error } = await db!
    .from('stories')
    .insert({ title: s.members[0]!.title, category: s.cat, entities: s.classification })
    .select('id')
    .single();
  if (error) throw error;
  await db!.from('story_items').insert(s.members.map((m) => ({ story_id: story.id, raw_item_id: m.id })));

  let e = null;
  try {
    e = await enrichStory(
      s.cat,
      s.members.slice(0, 4).map((m) => ({
        sourceName: m.sources?.name ?? '?',
        url: m.url,
        title: m.title,
        content: m.content,
        publishedAt: m.published_at,
      })),
      s.classification.players,
      budget,
      {
        system: enrichSystem,
        examples: pickExamples(library, {
          cat: s.cat,
          brands: s.classification.brands,
          players: s.classification.players,
          boot_lines: s.classification.boot_lines,
        }),
      },
    );
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      stopped = true;
      console.warn(`  ⚠ ${err.message} — dừng viết gợi ý`);
      return;
    }
    console.warn(`  ⚠ lỗi viết gợi ý "${s.members[0]!.title}": ${(err as Error).message}`);
  }
  if (!e) failed++;

  await db!.from('suggestions').insert({
    digest_id: digestId,
    story_id: story.id,
    slot: s.cat,
    rank,
    is_filler: s.isFiller,
    score: s.score,
    score_breakdown: { parts: s.parts, classification_reason: s.classification.reason },
    title_vi: e?.title_vi ?? s.members[0]!.title,
    summary_vi: e?.summary_vi ?? null,
    why: e?.why ?? s.classification.reason,
    angles: e?.angles ?? [],
    caption_long: e?.caption_long ?? null,
    caption_short: e?.caption_short ?? null,
    to_verify: e?.to_verify ?? [],
    sources: s.members.map((m) => ({ name: m.sources?.name, url: m.url, published_at: m.published_at })),
    image_urls: [...new Set(s.members.flatMap((m) => m.image_urls))].slice(0, 6),
    prompt_version: PROMPT_VERSION,
  });
  process.stdout.write(`  ${++done}/${picked.length}\r`);
}

const queue = picked.map((s, i) => () => processOne(s, i + 1));
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) await job();
  }),
);

await db
  .from('digests')
  .update({
    status: 'ready',
    stats: { candidates: candidates.length, stories: stories.length, picked: picked.length, failed, cost_today_usd: budget.spentToday },
  })
  .eq('id', digestId);

console.log(`\nXong: ${done} gợi ý (${failed} lỗi) · chi phí hôm nay $${budget.spentToday.toFixed(3)}`);
