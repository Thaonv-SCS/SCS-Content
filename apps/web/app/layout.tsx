import type { Metadata } from 'next';
import Link from 'next/link';
import { currentUser } from '@/lib/auth';
import { signOut } from './auth-actions';
import './globals.css';

export const metadata: Metadata = {
  title: 'Soccerstore Content',
  description: 'Bản tin ý tưởng content và viết nội dung sản phẩm',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await currentUser();

  return (
    <html lang="vi">
      <body>
        <header>
          <strong>⚽ Soccerstore Content</strong>
          {me?.role === 'admin' && (
            <>
              <Link href="/">Bản tin</Link>
              <Link href="/products">Post sản phẩm</Link>
              <Link href="/captions">Kho caption</Link>
              <Link href="/raw">Bài thô</Link>
              <Link href="/sources">Nguồn</Link>
              <Link href="/settings">Cài đặt</Link>
            </>
          )}
          {me?.role === 'staff' && <Link href="/products">Post sản phẩm</Link>}
          {me && (
            <form action={signOut} className="spacer">
              <span className="meta">{me.email} </span>
              <button type="submit" className="link">Đăng xuất</button>
            </form>
          )}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
