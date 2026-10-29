import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { EXAMPLE_CAPTIONS, findWatchedPlayer, type Category } from '@app/core';
import { anthropic, MODELS, type Budget } from './client.ts';

export type CaptionRow = {
  id: string;
  text: string;
  source: 'page' | 'edited';
  kind: 'long' | 'short';
  category: Category | 'other' | null;
  brands: string[];
  players: string[];
  boot_lines: string[];
  created_at: string;
};

const TAG_SYSTEM = `Gắn nhãn các caption tiếng Việt của một fanpage giày bóng đá.
- category: boots (về giày / bộ sưu tập), player (một cầu thủ quốc tế là tâm điểm), event (trận đấu / sự kiện quốc tế), vietnam (bóng đá Việt Nam: đội tuyển, V-League, cầu thủ Việt Nam), kits (áo đấu), gear (bóng, găng tay thủ môn, phụ kiện), other.
- brands: hãng được nhắc (Nike, adidas, Puma, Mizuno, New Balance, Skechers, On…), kể cả trong hashtag.
- players: tên đầy đủ cầu thủ được nhắc.
- boot_lines: dòng giày được nhắc (Mercurial, Phantom, Predator, F50, Copa, Future, Morelia, Alpha…).`;

const TagSchema = z.object({
  items: z.array(
    z.object({
      i: z.number().int(),
      category: z.enum(['boots', 'player', 'event', 'vietnam', 'kits', 'gear', 'other']),
      brands: z.array(z.string()),
      players: z.array(z.string()),
      boot_lines: z.array(z.string()),
    }),
  ),
});

/** Gắn nhãn các caption mới dán vào kho (chưa có tagged_at). */
export async function tagNewCaptions(db: SupabaseClient, budget: Budget): Promise<number> {
  const { data, error } = await db.from('captions').select('id,text,category').is('tagged_at', null).limit(300);
  if (error) throw error;
  const rows = data as { id: string; text: string; category: string | null }[];

  for (let start = 0; start < rows.length; start += 30) {
    budget.assertAvailable();
    const batch = rows.slice(start, start + 30);
    const res = await anthropic.messages.parse({
      model: MODELS.classify,
      max_tokens: 16000,
      system: TAG_SYSTEM,
      output_config: { format: zodOutputFormat(TagSchema), effort: 'low' },
      messages: [{ role: 'user', content: batch.map((r, i) => `[${i}]\n${r.text.slice(0, 1500)}`).join('\n\n') }],
    });
    await budget.record('tag-captions', res.model, res.usage);

    await Promise.all(
      (res.parsed_output?.items ?? [])
        .filter((t) => batch[t.i])
        .map((t) =>
          db
            .from('captions')
            .update({
              // Caption sửa từ bản tin đã biết ngăn — giữ nguyên
              category: batch[t.i]!.category ?? t.category,
              brands: t.brands,
              players: t.players,
              boot_lines: t.boot_lines,
              tagged_at: new Date().toISOString(),
            })
            .eq('id', batch[t.i]!.id),
        ),
    );
  }
  return rows.length;
}

export async function loadCaptionLibrary(db: SupabaseClient): Promise<CaptionRow[]> {
  const { data, error } = await db
    .from('captions')
    .select('id,text,source,kind,category,brands,players,boot_lines,created_at')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data as CaptionRow[];
}

const norm = (s: string) => (findWatchedPlayer(s)?.name ?? s).toLowerCase();
const overlap = (a: string[], b: string[]) => {
  const set = new Set(a.map(norm));
  return b.filter((x) => set.has(norm(x))).length;
};

/**
 * Chọn caption mẫu gần nhất với một tin: cùng ngăn, cùng hãng / dòng giày / cầu thủ, ưu tiên bản admin sửa và bài mới.
 * Kho còn ít thì bù bằng caption mẫu cố định.
 */
export function pickExamples(
  library: CaptionRow[],
  story: { cat: Category; brands: string[]; players: string[]; boot_lines: string[] },
  longCount = 6,
  shortCount = 2,
): string[] {
  const newest = library.length ? new Date(library[0]!.created_at).getTime() : 0;
  const scored = library.map((c) => {
    const ageDays = (newest - new Date(c.created_at).getTime()) / 86400_000;
    const score =
      (c.category === story.cat ? 3 : 0) +
      2 * overlap(story.brands, c.brands) +
      2 * overlap(story.boot_lines, c.boot_lines) +
      2 * overlap(story.players, c.players) +
      (c.source === 'edited' ? 1.5 : 0) +
      Math.max(0, 1 - ageDays / 60);
    return { c, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const picked = [
    ...scored.filter((s) => s.c.kind === 'long').slice(0, longCount),
    ...scored.filter((s) => s.c.kind === 'short').slice(0, shortCount),
  ].map((s) => s.c.text);

  for (const fallback of EXAMPLE_CAPTIONS) {
    if (picked.length >= longCount + shortCount) break;
    if (!picked.includes(fallback)) picked.push(fallback);
  }
  return picked;
}
