'use server';

import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';

export async function signIn(_prev: string | null, form: FormData): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(form.get('email') ?? ''),
    password: String(form.get('password') ?? ''),
  });
  if (error) return 'Sai email hoặc mật khẩu.';
  // vào thẳng trang của mình: admin → Bản tin, nhân viên post → Sản phẩm, tài khoản video → Video
  const { data: p } = await supabase.from('profiles').select('role').eq('user_id', data.user.id).maybeSingle();
  redirect(p?.role === 'video' ? '/video' : p?.role === 'staff' ? '/products' : '/');
}

export async function signOut() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect('/login');
}
