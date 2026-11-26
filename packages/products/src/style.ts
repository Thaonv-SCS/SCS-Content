/**
 * Học văn phong từ bản người sửa: so bản AI viết với bản admin sửa tay → rút thành luật ngắn,
 * lưu ở bảng product_style và đưa vào mọi lần viết sau.
 */
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { anthropic, assertBudget, layMoHinh, recordCall } from './ai.ts';
import { exampleToText } from './html.ts';
import type { ProductOutput } from './types.ts';

/** Cứ thêm chừng này bản sửa thì tự rút luật lại. */
export const STYLE_EVERY = 10;
const MAX_PAIRS = 25;

const RulesSchema = z.object({ rules: z.array(z.string()) });

type Rev = { product_id: string; kind: 'ai' | 'edit'; output: ProductOutput; created_at: string };

const asText = (o: ProductOutput) =>
  `Tiêu đề SEO: ${o.seo_title}\nMeta: ${o.meta_description}\nTừ khóa: ${o.focus_keyphrase}\nTags: ${o.tags.join(', ')}\n` +
  `Mô tả ngắn: ${exampleToText(o.short_description_html, 500)}\nMô tả:\n${exampleToText(o.description_html, 2500)}`;

export async function countEdits(db: SupabaseClient): Promise<number> {
  const { count } = await db.from('product_revisions').select('*', { count: 'exact', head: true }).eq('kind', 'edit');
  return count ?? 0;
}

/**
 * Rút luật văn phong. Không ép (`force = false`) thì chỉ chạy khi đã có thêm ≥ STYLE_EVERY bản sửa từ lần trước.
 * Trả về số luật mới, hoặc null nếu bỏ qua.
 */
export async function refreshProductStyle(db: SupabaseClient, force = false): Promise<number | null> {
  const { data: style } = await db.from('product_style').select('notes,edits_used,job_status,updated_at').eq('id', 1).single();
  if (!style) throw new Error('Chưa có bảng product_style — chạy migration 0007.');
  const edits = await countEdits(db);
  if (!force && edits - style.edits_used < STYLE_EVERY) return null;
  if (!edits) throw new Error('Chưa có bản sửa tay nào để học.');
  const busy = style.job_status === 'running' && Date.now() - new Date(style.updated_at).getTime() < 5 * 60_000;
  if (busy) return null;

  const setStyle = (patch: Record<string, unknown>) =>
    db.from('product_style').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1);
  await setStyle({ job_status: 'running', job_error: null });

  try {
    await assertBudget(db);
    const { data } = await db
      .from('product_revisions')
      .select('product_id,kind,output,created_at')
      .order('created_at', { ascending: true })
      .limit(1000);
    const revs = (data ?? []) as Rev[];

    // Ghép mỗi bản sửa với bản AI viết gần nhất trước nó của cùng sản phẩm
    const pairs: { before: string; after: string }[] = [];
    const lastAi = new Map<string, Rev>();
    for (const r of revs) {
      if (r.kind === 'ai') lastAi.set(r.product_id, r);
      else {
        const ai = lastAi.get(r.product_id);
        if (!ai) continue;
        const before = asText(ai.output);
        const after = asText(r.output);
        if (before !== after) pairs.push({ before, after });
      }
    }
    if (!pairs.length) throw new Error('Các bản sửa chưa khác gì bản AI viết — chưa có gì để học.');
    const recent = pairs.slice(-MAX_PAIRS);

    const mh = await layMoHinh(db, 'product-style');
    const res = await anthropic.messages.parse({
      model: mh.model,
      max_tokens: 8000,
      output_config: { format: zodOutputFormat(RulesSchema), effort: mh.effort },
      messages: [
        {
          role: 'user',
          content:
            `Mày giúp shop giày bóng đá soccerstore.vn học văn phong viết mô tả sản phẩm. Dưới đây là các cặp: bản AI viết → bản admin đã sửa tay.\n` +
            `Rút ra tối đa 15 LUẬT VĂN PHONG cho những lần viết sau. Mỗi luật một câu, cụ thể, làm theo được ngay, kèm ví dụ ngắn nếu cần ` +
            `(vd: "Meta description kết thúc bằng mã sản phẩm", "Không dùng cụm 'trải nghiệm tuyệt vời'", "Đoạn mở bài tối đa 2 câu").\n` +
            `- Chỉ rút luật lặp lại ở nhiều bản sửa hoặc thể hiện rõ ý admin; không rút luật từ thông số riêng của một sản phẩm.\n` +
            `- Giữ các luật cũ còn đúng, bỏ luật cũ bị bản sửa mới mâu thuẫn.\n\n` +
            `## Luật hiện có\n${style.notes.trim() || '(chưa có)'}\n\n` +
            recent.map((p, i) => `## Cặp ${i + 1}\n### AI viết\n${p.before}\n### Admin sửa thành\n${p.after}`).join('\n\n'),
        },
      ],
    });
    await recordCall(db, 'product-style', res.model, res.usage);
    const rules = (res.parsed_output?.rules ?? []).map((r) => r.trim()).filter(Boolean);
    if (!rules.length) throw new Error('AI không rút được luật nào.');

    await setStyle({ notes: rules.map((r) => `- ${r.replace(/^[-•]\s*/, '')}`).join('\n'), edits_used: edits, job_status: 'done' });
    return rules.length;
  } catch (err) {
    await setStyle({ job_status: 'failed', job_error: (err as Error).message.slice(0, 500) });
    throw err;
  }
}
