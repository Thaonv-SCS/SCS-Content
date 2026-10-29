import type { SupabaseClient } from '@supabase/supabase-js';
import { STYLE_GUIDE, type StyleNotes } from '@app/core';
import { anthropic, MODELS, type Budget } from './client.ts';
import type { CaptionRow } from './captions.ts';

const SYSTEM = `Mày là biên tập viên trưởng của fanpage Soccerstore.vn (giày & phụ kiện bóng đá).
Nhiệm vụ: đọc kho caption admin đã đăng và các lần admin sửa caption do AI viết, rồi viết "ghi chú văn phong" — bộ quy tắc ngắn gọn để AI viết caption giống admin nhất.

Yêu cầu:
- Tiếng Việt, gạch đầu dòng, tối đa 25 quy tắc, mỗi quy tắc 1 câu, cụ thể và làm theo được (vd "Mở đầu bằng một câu cảm thán ngắn rồi mới vào thông tin", không phải "viết hay").
- Nhóm theo: Mở đầu · Thân bài · Kết · Từ ngữ hay dùng · Emoji & hashtag · Điều admin hay sửa / tránh · Caption ngắn.
- Phần "Điều admin hay sửa / tránh" rút ra từ các cặp "AI viết → admin sửa" — đây là tín hiệu quan trọng nhất.
- Nếu ghi chú hiện tại có quy tắc admin tự viết tay thì GIỮ NGUYÊN những quy tắc đó.
- Chỉ ghi điều thấy lặp lại nhiều lần trong dữ liệu; không bịa.
- Chỉ trả về nội dung ghi chú, không lời dẫn.`;

type EditFeedback = { before: { caption_long?: string; caption_short?: string } | null; after: { caption_long?: string; caption_short?: string } | null };

export async function generateStyleNotes(db: SupabaseClient, budget: Budget, library: CaptionRow[]): Promise<StyleNotes> {
  budget.assertAvailable();

  const { data: current } = await db.from('settings').select('value').eq('key', 'style_notes').maybeSingle();
  const prev = current?.value as StyleNotes | undefined;

  const { data: edits } = await db
    .from('feedback')
    .select('before,after')
    .eq('action', 'edit')
    .order('created_at', { ascending: false })
    .limit(40);
  const pairs = ((edits ?? []) as EditFeedback[])
    .flatMap((e) =>
      (['caption_long', 'caption_short'] as const)
        .filter((k) => e.before?.[k] && e.after?.[k] && e.before[k] !== e.after[k])
        .map((k) => `AI viết:\n${e.before![k]}\n→ Admin sửa thành:\n${e.after![k]}`),
    )
    .slice(0, 30);

  const body =
    `Hướng dẫn giọng văn gốc:\n${STYLE_GUIDE}\n\n` +
    `Ghi chú văn phong hiện tại${prev?.edited_by_admin ? ' (admin đã sửa tay)' : ''}:\n${prev?.text ?? '(chưa có)'}\n\n` +
    `Kho caption admin (${library.length} caption, mới nhất trước):\n` +
    library
      .slice(0, 150)
      .map((c, i) => `--- ${i + 1} (${c.source === 'edited' ? 'admin sửa từ bản AI' : 'đã đăng'}) ---\n${c.text.slice(0, 1200)}`)
      .join('\n') +
    `\n\nCác lần admin sửa caption AI (${pairs.length}):\n${pairs.join('\n\n') || '(chưa có)'}`;

  const res = await anthropic.beta.messages.create({
    model: MODELS.write,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    output_config: { effort: 'medium' },
    messages: [{ role: 'user', content: body }],
  });
  await budget.record('style-notes', res.model, res.usage);
  if (res.stop_reason === 'refusal') throw new Error('AI từ chối tạo ghi chú văn phong');

  const text = res.content
    .flatMap((b) => (b.type === 'text' ? [b.text] : []))
    .join('\n')
    .trim();
  if (!text) throw new Error('AI trả về ghi chú rỗng');

  const notes: StyleNotes = { text, updated_at: new Date().toISOString(), caption_count: library.length };
  await db.from('settings').upsert({ key: 'style_notes', value: notes, updated_at: notes.updated_at });
  return notes;
}
