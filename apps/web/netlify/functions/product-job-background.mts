/**
 * Netlify Background Function (đuôi "-background"): nhận việc rồi trả 202 ngay, chạy nền tối đa 15 phút.
 * Dùng cho: viết / tìm thêm cho một sản phẩm, viết cả lô (nhiều màu hoặc nhập Excel), rút luật văn phong.
 * Lô lớn chạy quá ~12 phút thì tự gọi lượt tiếp để viết nốt (tối đa 5 lượt).
 *
 * Bảo mật: chỉ chạy khi kèm access token hợp lệ của người dùng; mọi đọc / ghi đi qua RLS với quyền của chính họ.
 */
import { runJob, userClient, type JobRequest } from '@app/products';

export default async (req: Request) => {
  const body = (await req.json().catch(() => ({}))) as { token?: string; request?: JobRequest; round?: number };
  const { token, request, round = 0 } = body;
  if (!token || !request || !['product', 'batch', 'style'].includes(request.kind)) return;
  if (request.kind !== 'style' && (!request.id || (request.job !== 'generate' && request.job !== 'research'))) return;

  const db = userClient(token);
  const {
    data: { user },
  } = await db.auth.getUser(token);
  if (!user) return;

  const unfinished = await runJob(db, request);
  if (unfinished && request.kind === 'batch' && round < 5) {
    await fetch(new URL('/.netlify/functions/product-job-background', req.url), {
      method: 'POST',
      body: JSON.stringify({ token, request: { ...request, mode: 'continue' }, round: round + 1 }),
    });
  }
};
