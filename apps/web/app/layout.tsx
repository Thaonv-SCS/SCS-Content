import type { Metadata } from 'next';
import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase';
import { signOut } from './auth-actions';
import './globals.css';

export const metadata: Metadata = {
  title: 'Bản tin ý tưởng',
  description: 'Tổng hợp ý tưởng content giày & bóng đá mỗi ngày',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="vi">
      <body>
        <header>
          <strong>⚽ Bản tin ý tưởng</strong>
          {user && (
            <>
              <Link href="/">Bản tin</Link>
              <Link href="/captions">Kho caption</Link>
              <Link href="/raw">Bài thô</Link>
              <Link href="/sources">Nguồn</Link>
              <Link href="/settings">Cài đặt</Link>
              <form action={signOut} className="spacer">
                <button type="submit" className="link">Đăng xuất</button>
              </form>
            </>
          )}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
