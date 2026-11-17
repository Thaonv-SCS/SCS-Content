'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Menu trên cùng: tô sáng mục đang mở (kể cả trang con, vd /video/abc vẫn sáng "Video"). */
export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  const dangMo = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));
  return (
    <nav className="nav">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={dangMo(l.href) ? 'active' : undefined}
          aria-current={dangMo(l.href) ? 'page' : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
