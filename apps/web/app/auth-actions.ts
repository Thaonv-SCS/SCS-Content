'use server';

import { redirect } from 'next/navigation';
import { currentUser, trangDau } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';

export async function signIn(_prev: string | null, form: FormData): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(form.get('email') ?? ''),
    password: String(form.get('password') ?? ''),
  });
  if (error) return 'Sai email hoặc mật khẩu.';
  // vào thẳng trang đầu tiên mình có quyền
  redirect(trangDau(await currentUser()));
}

export async function signOut() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect('/login');
}
