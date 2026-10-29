import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-env';

/** Client chạy ở server, mang phiên đăng nhập của mày (qua cookie) → RLS cho phép đọc/ghi. */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Gọi từ Server Component thì không ghi cookie được; proxy.ts đã lo việc làm mới phiên
        }
      },
    },
  });
}
