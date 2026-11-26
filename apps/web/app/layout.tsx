import type { Metadata } from 'next';
import { currentUser, menuCua } from '@/lib/auth';
import { signOut } from './auth-actions';
import { Suspense } from 'react';
import { NavLinks } from './nav-links';
import { ThanhTai } from './thanh-tai';
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
        <Suspense fallback={null}><ThanhTai /></Suspense>
        <header>
          <strong>⚽ Soccerstore Content</strong>
          <NavLinks links={menuCua(me)} />
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
