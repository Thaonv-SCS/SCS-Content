import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-env';

/** Client chạy trên trình duyệt (mang phiên đăng nhập qua cookie) — dùng để tải file thẳng lên Supabase Storage. */
export function supabaseBrowser() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
