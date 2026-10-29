import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { Classification } from '@app/core';
import { anthropic, MODELS, type Budget } from './client.ts';

const SYSTEM = `Mày là biên tập viên của Soccerstore.vn — fanpage về giày và phụ kiện bóng đá ở Việt Nam.
Nhiệm vụ: đọc danh sách bài viết (chủ yếu tiếng Anh) và phân loại từng bài để chọn ý tưởng content.

Ngăn (category):
- boots: giày bóng đá — giày / bộ sưu tập / pack sắp hoặc vừa ra mắt, rò rỉ (leak), phối màu mới, collab, phiên bản signature, cầu thủ mang giày "lạ" hoặc chưa ra mắt, hợp đồng tài trợ giày.
- player: một cầu thủ cụ thể là tâm điểm — thi đấu đặc biệt ấn tượng trong trận đáng chú ý, legend (cầu thủ đã giải nghệ) vừa ra sân hoặc xuất hiện, cột mốc cá nhân, giải thưởng cá nhân.
- event: trận đấu / khoảnh khắc / sự kiện nổi bật — kết quả trận lớn, derby, kỷ lục, bất ngờ lớn, chung kết.
- vietnam: bóng đá Việt Nam — đội tuyển quốc gia (các cấp), V-League, cầu thủ Việt Nam (kể cả đang chơi ở nước ngoài), legend Việt Nam, sự kiện của hãng giày tại Việt Nam. Tin chủ yếu về bóng đá Việt Nam luôn vào ngăn này, kể cả khi có nhắc giày.
- kits: áo đấu — áo mới, áo kỷ niệm, áo retro, phiên bản giới hạn.
- gear: bóng & phụ kiện — bóng thi đấu chính thức / bản đặc biệt của giải hoặc trận lớn, găng tay thủ môn, phụ kiện bóng đá khác (bọc ống đồng, tất…).
- discard: không đáng làm — môn thể thao khác (tennis, bóng chuyền, F1…), tin chuyển nhượng / tin đồn thuần túy, chấn thương, họp báo, phân tích chiến thuật, tin quản trị CLB, bài khuyến mãi / bán hàng, bài hướng dẫn chọn giày chung chung không có tin mới, giải đấu ngoài châu Âu không có góc giày (trừ bóng đá Việt Nam).

"Trận đáng chú ý" = Ngoại hạng Anh, La Liga, Cúp C1 (Champions League), đội tuyển quốc gia châu Âu.
Bài có thể bằng tiếng Anh hoặc tiếng Việt. Báo Việt Nam đưa tin bóng đá châu Âu thì phân loại như tin châu Âu.

newsworthiness (0–10) — mức "đáng làm content" theo gu của trang:
- 9–10: giày / bộ sưu tập lớn vừa hoặc sắp ra mắt; cầu thủ ngôi sao mang giày lạ / chưa ra mắt; legend gắn với một đôi giày (collab, remake); màn trình diễn bùng nổ của ngôi sao trong trận lớn kèm đôi giày nhận diện được.
- 6–8: phối màu mới, rò rỉ đáng tin, cầu thủ nổi bật trong trận lớn, kỷ lục / khoảnh khắc lan tỏa, áo đấu đẹp hoặc có câu chuyện.
- 3–5: tin liên quan nhưng nhỏ, ít câu chuyện, hoặc đã cũ.
- 0–2: gần như không liên quan.
Bài có thể soi được giày của cầu thủ (has_boot_angle) thì cộng thêm vì trang chuyên về giày.

Riêng ngăn vietnam:
- 9–10: cầu thủ Việt Nam mang giày mới / lạ / phiên bản riêng; cầu thủ Việt Nam ký hợp đồng với hãng giày; hãng giày tổ chức sự kiện hoặc ra mắt tại Việt Nam.
- 7–8: đội tuyển quốc gia triệu tập hoặc thi đấu; cầu thủ chơi nổi bật ở V-League; cầu thủ Việt Nam xuất ngoại hoặc tỏa sáng ở nước ngoài; legend Việt Nam xuất hiện.
- 3–6: tin V-League thông thường, kết quả trận ít câu chuyện.
- 0–2: tin quản trị, kỷ luật, lịch thi đấu thuần túy.
Riêng ngăn gear: bóng thi đấu chính thức mới của giải lớn hoặc bản đặc biệt cho trận lớn 8–10; găng / phụ kiện mới của hãng lớn 5–7.


Trích xuất:
- players: tên đầy đủ các cầu thủ là trọng tâm bài (không liệt kê người chỉ được nhắc qua).
- brands: hãng giày / đồ thể thao được nhắc (Nike, adidas, Puma, Mizuno, New Balance, Skechers, On…).
- boot_lines: dòng giày được nhắc (Mercurial, Phantom, Predator, F50, Copa, Future, Morelia…).
- competitions: giải đấu liên quan (vd "Premier League", "La Liga", "Champions League").
- has_boot_angle: true nếu bài nhắc tới giày cụ thể, hoặc là màn trình diễn của cầu thủ có thể soi giày.
- reason: 1 câu tiếng Việt, vì sao xếp ngăn và chấm điểm như vậy.

Trả về đúng một mục cho mỗi bài, dùng số thứ tự i của bài.`;

const ItemSchema = z.object({
  i: z.number().int(),
  category: z.enum(['boots', 'player', 'event', 'vietnam', 'kits', 'gear', 'discard']),
  players: z.array(z.string()),
  brands: z.array(z.string()),
  boot_lines: z.array(z.string()),
  competitions: z.array(z.string()),
  has_boot_angle: z.boolean(),
  newsworthiness: z.number().int(),
  reason: z.string(),
});
const BatchSchema = z.object({ items: z.array(ItemSchema) });

export interface ClassifyInput {
  title: string;
  content: string | null;
  sourceName: string;
  categoryHint: string;
}

/** Phân loại một lô bài (≤ ~25). Trả về mảng cùng thứ tự; null nếu AI bỏ sót bài đó. */
export async function classifyBatch(
  items: ClassifyInput[],
  budget: Budget,
  /** Kết quả các trận vừa đá — giúp AI nhận ra tin nào gắn với trận đáng chú ý. */
  matchContext = '',
): Promise<(Classification | null)[]> {
  budget.assertAvailable();
  const list = items
    .map((it, i) => `[${i}] (${it.sourceName} · gợi ý ngăn: ${it.categoryHint}) ${it.title}\n${(it.content ?? '').slice(0, 500)}`)
    .join('\n\n');

  const res = await anthropic.messages.parse({
    model: MODELS.classify,
    max_tokens: 16000,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { format: zodOutputFormat(BatchSchema), effort: 'low' },
    messages: [
      {
        role: 'user',
        content: `${matchContext ? `Kết quả các trận vừa đá (để tham khảo):\n${matchContext}\n\n` : ''}Phân loại ${items.length} bài sau:\n\n${list}`,
      },
    ],
  });
  await budget.record('classify', res.model, res.usage);

  const out: (Classification | null)[] = items.map(() => null);
  for (const r of res.parsed_output?.items ?? []) {
    if (r.i < 0 || r.i >= items.length) continue;
    const { i, ...c } = r;
    out[i] = { ...c, newsworthiness: Math.min(10, Math.max(0, c.newsworthiness)) };
  }
  return out;
}
