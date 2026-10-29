import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { CATEGORY_LABEL, findWatchedPlayer, GLOSSARY, STYLE_GUIDE, type Category } from '@app/core';
import { anthropic, MODELS, type Budget } from './client.ts';

export const PROMPT_VERSION = 'enrich-v3';

const SLOT_LABEL: Record<Category, string> = {
  ...CATEGORY_LABEL,
  event: 'Sự kiện bóng đá',
  vietnam: 'Bóng đá Việt Nam',
};

/** Phần hướng dẫn cố định trong một lượt chạy (ghi chú văn phong chỉ đổi giữa các lượt) → được cache. */
export function buildEnrichSystem(styleNotes?: string): string {
  return `${STYLE_GUIDE}
${styleNotes ? `\nGhi chú văn phong rút ra từ các caption admin đã đăng và đã sửa — ƯU TIÊN làm theo:\n${styleNotes}\n` : ''}
Thuật ngữ (Anh → Việt):
${Object.entries(GLOSSARY)
  .map(([en, vi]) => `- ${en} → ${vi}`)
  .join('\n')}

Bài nguồn có thể bằng tiếng Anh hoặc tiếng Việt. Tin bóng đá Việt Nam: giữ nguyên cách gọi tên cầu thủ quen thuộc với người hâm mộ Việt Nam (vd "Quang Hải", "Hoàng Đức").

Nhiệm vụ: từ một tin (có thể gồm nhiều bài cùng sự kiện), viết gợi ý content cho admin duyệt. Admin sẽ tự chọn, sửa và đăng — mày không đăng bài.
Kèm theo mỗi tin là vài caption mẫu của chính trang, chọn theo độ gần với tin — CHỈ để học giọng văn, độ dài, cách mở/kết, emoji, hashtag. Không lấy nội dung trong đó làm dữ kiện.
- title_vi: tiêu đề tiếng Việt ngắn gọn.
- summary_vi: tóm tắt 3–5 câu, chỉ dựa trên nội dung bài nguồn.
- why: 1–2 câu vì sao đáng làm với trang chuyên giày bóng đá.
- angles: 2–3 góc khai thác cụ thể (vd so sánh với đôi cũ, soi giày cầu thủ, câu chuyện thiết kế, câu hỏi tương tác).
- caption_long: caption kể chuyện theo giọng của trang.
- caption_short: caption một câu cảm xúc / chơi chữ đi kèm ảnh.
- to_verify: mọi khẳng định có thể sai hoặc bài nguồn không xác nhận rõ — số liệu, kỷ lục, ngày ra mắt, giá, tên phiên bản, và đặc biệt là đôi giày cầu thủ mang. Thông tin giày lấy từ "dữ liệu danh mục" (không có trong bài nguồn) luôn phải ghi vào đây với lý do "theo dữ liệu gần nhất, cần xác minh qua ảnh trận". Mỗi mục gồm claim và reason.

Tuyệt đối không bịa thông tin ngoài bài nguồn. Nếu bài nguồn không nhắc giày, caption không được khẳng định cầu thủ mang đôi nào.
Caption, tóm tắt và tiêu đề CHỈ chứa chi tiết có trong bài nguồn — không tự thêm địa điểm, sân, số áo, ngày, tỉ số, giá hay suy luận từ tên mã sản phẩm. Muốn nhắc chi tiết không có trong nguồn thì bỏ hẳn khỏi caption; to_verify dành cho điều bài nguồn có nói nhưng chưa chắc chắn, không phải để hợp thức hóa chi tiết tự thêm.`;
}

const Schema = z.object({
  title_vi: z.string(),
  summary_vi: z.string(),
  why: z.string(),
  angles: z.array(z.string()),
  caption_long: z.string(),
  caption_short: z.string(),
  to_verify: z.array(z.object({ claim: z.string(), reason: z.string() })),
});
export type Enrichment = z.infer<typeof Schema>;

export interface EnrichArticle {
  sourceName: string;
  url: string;
  title: string;
  content: string | null;
  publishedAt: string | null;
}

export async function enrichStory(
  slot: Category,
  articles: EnrichArticle[],
  players: string[],
  budget: Budget,
  ctx: { system: string; examples: string[] },
): Promise<Enrichment | null> {
  budget.assertAvailable();

  const catalogLines = players
    .map(findWatchedPlayer)
    .filter((p) => p?.bootBrand)
    .map((p) => `- ${p!.name}: ${p!.bootBrand}${p!.bootModel ? ' ' + p!.bootModel : ''} (nguồn: ${p!.bootSource ?? 'không rõ'})`);

  const body =
    `Caption mẫu của trang (chỉ học giọng văn):\n${ctx.examples.map((c, i) => `--- Mẫu ${i + 1} ---\n${c}`).join('\n')}\n\n` +
    `===\nNgăn: ${SLOT_LABEL[slot]}\n\n` +
    articles
      .map(
        (a, i) =>
          `### Bài ${i + 1} — ${a.sourceName}\nURL: ${a.url}\nĐăng: ${a.publishedAt ?? 'không rõ'}\nTiêu đề: ${a.title}\n${(a.content ?? '').slice(0, 3000)}`,
      )
      .join('\n\n') +
    (catalogLines.length ? `\n\nDữ liệu danh mục về giày của cầu thủ (không phải từ bài nguồn):\n${catalogLines.join('\n')}` : '');

  const res = await anthropic.beta.messages.parse({
    model: MODELS.write,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: ctx.system, cache_control: { type: 'ephemeral' } }],
    output_config: { format: betaZodOutputFormat(Schema), effort: 'medium' },
    messages: [{ role: 'user', content: body }],
  });
  await budget.record('enrich', res.model, res.usage);

  if (res.stop_reason === 'refusal') return null;
  return res.parsed_output ?? null;
}
