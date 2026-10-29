import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { anthropic, MODELS, type Budget } from './client.ts';

const SYSTEM = `Gom các bài viết nói về CÙNG MỘT sự kiện / tin cụ thể thành một nhóm (vd 3 trang cùng đưa tin một pack giày mới, hoặc 2 bài cùng tường thuật một trận).
Hai bài chỉ cùng chủ đề chung chung (cùng là tin Nike, cùng là tin Arsenal) nhưng khác sự kiện thì KHÔNG gộp.
Mỗi bài phải nằm trong đúng một nhóm; bài không trùng với bài nào thì là nhóm một phần tử.
already_covered = true nếu nhóm nói về cùng sự kiện với một tin trong danh sách "đã đưa vào bản tin mấy ngày trước".`;

const Schema = z.object({
  groups: z.array(z.object({ members: z.array(z.number().int()), already_covered: z.boolean() })),
});

export interface ClusterGroup {
  members: number[];
  alreadyCovered: boolean;
}

export async function clusterTitles(titles: string[], recentTitles: string[], budget: Budget): Promise<ClusterGroup[]> {
  budget.assertAvailable();
  const res = await anthropic.messages.parse({
    model: MODELS.classify,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { format: zodOutputFormat(Schema), effort: 'low' },
    messages: [
      {
        role: 'user',
        content:
          `Bài cần gom:\n${titles.map((t, i) => `[${i}] ${t}`).join('\n')}\n\n` +
          `Đã đưa vào bản tin mấy ngày trước:\n${recentTitles.length ? recentTitles.map((t) => `- ${t}`).join('\n') : '(không có)'}`,
      },
    ],
  });
  await budget.record('cluster', res.model, res.usage);

  // Chuẩn hóa: mỗi bài đúng một nhóm, bài bị bỏ sót thành nhóm riêng
  const seen = new Set<number>();
  const groups: ClusterGroup[] = [];
  for (const g of res.parsed_output?.groups ?? []) {
    const members = g.members.filter((m) => m >= 0 && m < titles.length && !seen.has(m));
    members.forEach((m) => seen.add(m));
    if (members.length) groups.push({ members, alreadyCovered: g.already_covered });
  }
  titles.forEach((_, i) => !seen.has(i) && groups.push({ members: [i], alreadyCovered: false }));
  return groups;
}
