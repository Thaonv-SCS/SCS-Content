import type { Metadata } from 'next';
import { currentUser, type Me } from '@/lib/auth';
import { signOut } from './auth-actions';
import { NavLinks } from './nav-links';
import './globals.css';

export const metadata: Metadata = {
  title: 'Soccerstore Content',
  description: 'Bản tin ý tưởng content và viết nội dung sản phẩm',
};

/** Menu theo vai trò: admin = tất cả · staff = sản phẩm (+ Video nếu có quyền video) · video = chỉ Video. */
function menu(me: Me | null): { href: string; label: string }[] {
  if (!me) return [];
  const video = me.videoQuyen.length ? [{ href: '/video', label: 'Video' }] : [];
  if (me.role === 'admin') {
    return [
      { href: '/', label: 'Bản tin' },
      { href: '/products', label: 'Post sản phẩm' },
      { href: '/stock', label: 'Cập nhật sản phẩm' },
      { href: '/images', label: 'Up ảnh sản phẩm' },
      ...video,
      { href: '/captions', label: 'Kho caption' },
      { href: '/raw', label: 'Bài thô' },
      { href: '/sources', label: 'Nguồn' },
      { href: '/settings', label: 'Cài đặt' },
    ];
  }
  if (me.role === 'staff') {
    return [
      { href: '/products', label: 'Post sản phẩm' },
      { href: '/stock', label: 'Cập nhật sản phẩm' },
      { href: '/images', label: 'Up ảnh sản phẩm' },
      ...video,
    ];
  }
  return video;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await currentUser();

  return (
    <html lang="vi">
      <body>
        <header>
          <strong>⚽ Soccerstore Content</strong>
          <NavLinks links={menu(me)} />
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
