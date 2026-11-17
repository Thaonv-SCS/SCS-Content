import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase';

/** admin: mọi thứ · staff: post sản phẩm / tồn kho / ảnh (+ video nếu có video_quyen) · video: CHỈ module Video */
export type Role = 'admin' | 'staff' | 'video';

/** Quyền module Video: 'lam' = người làm (tạo việc, duyệt dàn ý, tải cảnh trám, duyệt thẻ), 'duyet' = người duyệt bản nháp. */
export type VideoQuyen = 'lam' | 'duyet';

export type Me = { id: string; email: string | undefined; role: Role | null; videoQuyen: VideoQuyen[] };

/** Người đang đăng nhập và vai trò (null nếu chưa đăng nhập hoặc chưa được gán vai trò). */
export async function currentUser(): Promise<Me | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('role, video_quyen').eq('user_id', user.id).maybeSingle();
  const role = (data?.role as Role | undefined) ?? null;
  // admin có mọi quyền video
  const videoQuyen: VideoQuyen[] = role === 'admin' ? ['lam', 'duyet'] : ((data?.video_quyen as VideoQuyen[] | null) ?? []);
  return { id: user.id, email: user.email, role, videoQuyen };
}

/** Trang module Video: cần ít nhất 1 quyền video (hoặc là admin). Database cũng chặn (RLS + hàm video_*). */
export async function requireVideo(quyen?: VideoQuyen) {
  const me = await currentUser();
  if (!me) redirect('/login');
  if (!me.videoQuyen.length || (quyen && !me.videoQuyen.includes(quyen))) redirect(me.videoQuyen.length ? '/video' : '/no-access');
  return me;
}

/** Trang chỉ dành cho admin: nhân viên được chuyển sang trang của mình (Sản phẩm, hoặc Video với tài khoản video). */
export async function requireAdmin() {
  const me = await currentUser();
  if (!me) redirect('/login');
  if (me.role !== 'admin') redirect(me.role === 'video' ? '/video' : '/products');
  return me;
}

/** Trang sản phẩm / tồn kho / ảnh: admin + nhân viên post (staff). Tài khoản video bị chuyển về trang Video. */
export async function requireTeam() {
  const me = await currentUser();
  if (!me) redirect('/login');
  if (me.role !== 'admin' && me.role !== 'staff') redirect(me.videoQuyen.length ? '/video' : '/no-access');
  return me;
}
