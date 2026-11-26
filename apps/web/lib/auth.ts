import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase';
import type { QuyenModule } from './quyen';

/** admin: mọi thứ · người khác: theo ô tick ở Cài đặt → Phân quyền ('staff' / 'video' là giá trị cũ, vẫn nhận). */
export type Role = 'admin' | 'thanh-vien' | 'staff' | 'video';

/** Quyền module Video: 'lam' = người làm (tạo việc, duyệt dàn ý, tải cảnh trám, duyệt thẻ), 'duyet' = người duyệt bản nháp. */
export type VideoQuyen = 'lam' | 'duyet';

/** Quyền Dự án video theo bước: { 'y-tuong': ['lam','duyet'], kho: ['lam'], ... } (admin có mọi quyền). */
export type DuAnQuyen = Record<string, ('lam' | 'duyet')[]>;

export type Me = {
  id: string;
  email: string | undefined;
  role: Role | null;
  quyen: QuyenModule[];
  videoQuyen: VideoQuyen[];
  duAnQuyen: DuAnQuyen;
};

const QUYEN_STAFF_CU: QuyenModule[] = ['san-pham', 'cap-nhat', 'up-anh'];

/** Người đang đăng nhập và quyền (null nếu chưa đăng nhập). */
export async function currentUser(): Promise<Me | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  let { data, error } = await supabase.from('profiles').select('role, quyen, video_quyen, du_an_quyen').eq('user_id', user.id).maybeSingle();
  // Chưa chạy migration 0027 (chưa có cột quyen) → đọc như cũ: staff = 3 mục sản phẩm
  if (error) ({ data } = await supabase.from('profiles').select('role, video_quyen, du_an_quyen').eq('user_id', user.id).maybeSingle());
  const role = (data?.role as Role | undefined) ?? null;
  const quyen = ((data as { quyen?: QuyenModule[] } | null)?.quyen ?? (role === 'staff' ? QUYEN_STAFF_CU : [])) as QuyenModule[];
  // admin có mọi quyền video
  const videoQuyen: VideoQuyen[] = role === 'admin' ? ['lam', 'duyet'] : ((data?.video_quyen as VideoQuyen[] | null) ?? []);
  const duAnQuyen = (data?.du_an_quyen as DuAnQuyen | null) ?? {};
  return { id: user.id, email: user.email, role, quyen, videoQuyen, duAnQuyen };
}

export const laAdmin = (me: Me | null) => me?.role === 'admin';

/** Có quyền module này không (admin có hết). */
export const co = (me: Me | null, q: QuyenModule) => !!me && (me.role === 'admin' || me.quyen.includes(q));

/** Có quyền module Dự án video không (admin, hoặc được giao ít nhất một bước). */
export const coDuAn = (me: Me) => me.role === 'admin' || Object.values(me.duAnQuyen).some((q) => q.length > 0);

/** Sửa được kho tri thức dự án video (admin, hoặc được tick "Sửa kho tri thức"). */
export const suaKho = (me: Me | null) => !!me && (me.role === 'admin' || !!me.duAnQuyen.kho?.includes('lam'));

/** Menu theo quyền — dùng cho thanh menu và để chuyển người không có quyền về trang của họ. */
export function menuCua(me: Me | null): { href: string; label: string }[] {
  if (!me) return [];
  const ds: { href: string; label: string; ok: boolean }[] = [
    { href: '/', label: 'Bản tin', ok: co(me, 'ban-tin') },
    { href: '/products', label: 'Post sản phẩm', ok: co(me, 'san-pham') },
    { href: '/stock', label: 'Cập nhật sản phẩm', ok: co(me, 'cap-nhat') },
    { href: '/images', label: 'Up ảnh sản phẩm', ok: co(me, 'up-anh') },
    { href: '/du-an', label: 'Dự án video', ok: coDuAn(me) },
    { href: '/video', label: 'Video editor', ok: me.videoQuyen.length > 0 },
    { href: '/captions', label: 'Kho caption', ok: co(me, 'ban-tin-ql') },
    { href: '/raw', label: 'Bài thô', ok: co(me, 'ban-tin-ql') },
    { href: '/sources', label: 'Nguồn', ok: co(me, 'ban-tin-ql') },
    { href: '/settings', label: 'Cài đặt', ok: me.role === 'admin' },
  ];
  return ds.filter((x) => x.ok).map(({ href, label }) => ({ href, label }));
}

/** Trang đầu tiên người này được vào (không có gì → trang báo chưa có quyền). */
export const trangDau = (me: Me | null) => (me ? (menuCua(me)[0]?.href ?? '/no-access') : '/login');

async function batBuoc(dk: (me: Me) => boolean): Promise<Me> {
  const me = await currentUser();
  if (!me) redirect('/login');
  if (!dk(me)) redirect(trangDau(me));
  return me;
}

/** Trang module Video: cần ít nhất 1 quyền video (hoặc là admin). Database cũng chặn (RLS + hàm video_*). */
export const requireVideo = (quyen?: VideoQuyen) => batBuoc((me) => me.videoQuyen.length > 0 && (!quyen || me.videoQuyen.includes(quyen)));

/** Trang chỉ admin. */
export const requireAdmin = () => batBuoc((me) => me.role === 'admin');

/** Trang cần một quyền module (theo ô tick). Database cũng chặn (RLS + co_quyen). */
export const requireQuyen = (q: QuyenModule) => batBuoc((me) => co(me, q));

/** Trang Dự án video: admin hoặc người được giao bước. Database cũng chặn (RLS + du_an_co_quyen). */
export const requireDuAn = () => batBuoc(coDuAn);

/** Dùng trong hàm xử lý nút bấm (server action): trả lỗi thay vì chuyển trang. */
export async function kiemQuyen(q: QuyenModule): Promise<string | null> {
  const me = await currentUser();
  if (!me) return 'Phiên đăng nhập hết hạn — đăng nhập lại.';
  return co(me, q) ? null : 'Tài khoản này chưa được cấp quyền làm việc này.';
}
export async function kiemAdmin(): Promise<string | null> {
  const me = await currentUser();
  if (!me) return 'Phiên đăng nhập hết hạn — đăng nhập lại.';
  return me.role === 'admin' ? null : 'Chỉ admin được làm việc này.';
}
