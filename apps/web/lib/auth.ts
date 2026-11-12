import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase';

export type Role = 'admin' | 'staff';

/** Người đang đăng nhập và vai trò (null nếu chưa đăng nhập hoặc chưa được gán vai trò). */
export async function currentUser(): Promise<{ id: string; email: string | undefined; role: Role | null } | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle();
  return { id: user.id, email: user.email, role: (data?.role as Role | undefined) ?? null };
}

/** Trang chỉ dành cho admin: nhân viên được chuyển sang trang Sản phẩm. */
export async function requireAdmin() {
  const me = await currentUser();
  if (!me) redirect('/login');
  if (me.role !== 'admin') redirect('/products');
  return me;
}

/** Trang dùng chung admin + nhân viên. */
export async function requireTeam() {
  const me = await currentUser();
  if (!me) redirect('/login');
  if (!me.role) redirect('/no-access');
  return me;
}
