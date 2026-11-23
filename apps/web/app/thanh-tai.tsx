'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Thanh chạy trên cùng khi bấm link chuyển trang: trang tải từ máy chủ mất 1–2 giây,
 *  không có thanh này thì bấm xong không thấy gì, tưởng app bị lỗi. */
export function ThanhTai() {
  const path = usePathname();
  const qs = useSearchParams().toString();
  const [dang, setDang] = useState(false);

  // Trang mới đã hiện -> tắt thanh
  useEffect(() => setDang(false), [path, qs]);

  useEffect(() => {
    const bam = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // cùng trang (vd #neo)
      setDang(true);
    };
    document.addEventListener('click', bam);
    return () => document.removeEventListener('click', bam);
  }, []);

  // Phòng khi điều hướng hỏng: tự tắt sau 15s
  useEffect(() => {
    if (!dang) return;
    const t = setTimeout(() => setDang(false), 15_000);
    return () => clearTimeout(t);
  }, [dang]);

  return dang ? <div className="thanh-tai" role="progressbar" aria-label="Đang tải trang" /> : null;
}
