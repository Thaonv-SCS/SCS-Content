/**
 * Netlify Background Function (đuôi "-background"): nhận việc rồi trả 202 ngay, chạy nền tối đa 15 phút.
 * Dùng cho viết nội dung / tìm thêm thông tin sản phẩm (30–60 giây, quá giới hạn của một yêu cầu thường).
 *
 * Bảo mật: chỉ chạy khi kèm access token hợp lệ của người dùng; mọi đọc / ghi đi qua RLS với quyền của chính họ.
 */
import { runProductJob, userClient, type ProductJob } from '@app/products';

export default async (req: Request) => {
  const { productId, job, instruction, token } = (await req.json().catch(() => ({}))) as {
    productId?: string;
    job?: ProductJob;
    instruction?: string;
    token?: string;
  };
  if (!productId || !token || (job !== 'generate' && job !== 'research')) return;

  const db = userClient(token);
  const {
    data: { user },
  } = await db.auth.getUser(token);
  if (!user) return;

  await runProductJob(db, productId, job, instruction);
};
