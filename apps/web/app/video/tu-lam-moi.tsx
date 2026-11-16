'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Khi máy worker đang làm, tự tải lại trang mỗi `giay` giây để thấy tiến độ. */
export function TuLamMoi({ bat, giay = 10 }: { bat: boolean; giay?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!bat) return;
    const t = setInterval(() => router.refresh(), giay * 1000);
    return () => clearInterval(t);
  }, [bat, giay, router]);
  return null;
}
