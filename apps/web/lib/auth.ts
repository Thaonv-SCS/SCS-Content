import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase';

/** admin: mọi thứ · staff: post sản phẩm / tồn kho / ảnh (+ video nếu có video_quyen) · video: CHỈ module Video */
export type Role = 'admin' | 'staff' | 'video';

/** Quyền module Video: 'lam' = người làm (tạo việc, duyệt dàn ý, tải cảnh trám, duyệt thẻ), 'duyet' = người duyệt bản nháp. */
export type VideoQuyen = 'lam' | 'duyet';

/** Quyền Dự án video theo bước: { 'y-tuong': ['lam','duyet'], ... } (admin có mọi quyền). */
export type DuAnQuyen = Record<string, ('lam' | 'duyet')[]>;

export type Me = { id: string; email: string | undefined; role: Role | null; videoQuyen: VideoQuyen[]; duAnQuyen: DuAnQuyen };

/** Người đang đăng nhập và vai trò (null nếu chưa đăng nhập hoặc chưa được gán vai trò). */
export async function currentUser(): Promise<Me | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  let { data, error } = await supabase.from('profiles').select('role, video_quyen, du_an_quyen').eq('user_id', user.id).maybeSingle();
  // Chưa chạy migration 0020 (chưa có cột du_an_quyen) → đọc như cũ, không khóa đăng nhập
  if (error) ({ data } = await supabase.from('profiles').select('role, video_quyen').eq('user_id', user.id).maybeSingle());
  const role = (data?.role as Role | undefined) ?? null;
  // admin có mọi quyền video
  const videoQuyen: VideoQuyen[] = role === 'admin' ? ['lam', 'duyet'] : ((data?.video_quyen as VideoQuyen[] | null) ?? []);
  const duAnQuyen = (data?.du_an_quyen as DuAnQuyen | null) ?? {};
  return { id: user.id, email: user.email, role, videoQuyen, duAnQuyen };
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

/** Có quyền module Dự án video không (admin, hoặc được giao ít nhất một bước). */
export const coDuAn = (me: Me) => me.role === 'admin' || Object.values(me.duAnQuyen).some((q) => q.length > 0);

/** Trang Dự án video: admin hoặc người được giao bước. Database cũng chặn (RLS + du_an_co_quyen). */
export async function requireDuAn() {
  const me = await currentUser();
  if (!me) redirect('/login');
  if (!coDuAn(me)) redirect(me.videoQuyen.length ? '/video' : me.role === 'staff' ? '/products' : '/no-access');
  return me;
}
