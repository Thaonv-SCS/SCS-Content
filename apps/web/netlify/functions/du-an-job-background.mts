/**
 * Netlify Background Function cho Dự án video: nhận việc, trả 202 ngay, chạy nền tối đa 15 phút.
 * Dùng cho: tóm tắt insight khán giả (giai đoạn A1); các bước dự án (giai đoạn A2).
 * Bảo mật: chỉ chạy khi kèm access token hợp lệ; mọi đọc / ghi đi qua RLS với quyền của chính người bấm.
 */
import { runDuAnJob, userClient, type DuAnJob } from '@app/du-an';

export default async (req: Request) => {
  const { token, job } = (await req.json().catch(() => ({}))) as { token?: string; job?: DuAnJob };
  if (!token || !job || !['khan-gia', 'buoc', 'doan'].includes(job.kind)) return;
  const db = userClient(token);
  const {
    data: { user },
  } = await db.auth.getUser(token);
  if (!user) return;
  await runDuAnJob(db, job);
};
