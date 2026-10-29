import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './lib/supabase-env';

/**
 * Làm mới phiên đăng nhập và chặn mọi trang khi chưa đăng nhập.
 * Cố ý dùng middleware.ts (Edge) thay cho proxy.ts (Node) của Next 16: adapter Netlify hiện lỗi khi đóng gói
 * proxy Node trong monorepo, còn middleware Edge chạy ổn. Next báo "deprecated" lúc build — bỏ qua được.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const onLogin = request.nextUrl.pathname.startsWith('/login');
  if (!user && !onLogin) return NextResponse.redirect(new URL('/login', request.url));
  if (user && onLogin) return NextResponse.redirect(new URL('/', request.url));
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
