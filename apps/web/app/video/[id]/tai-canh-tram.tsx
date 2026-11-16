'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

const TOI_DA_MB = 50; // giới hạn 1 file của Supabase gói miễn phí

/** Tên file: bỏ dấu tiếng Việt + ký tự lạ (kho lưu trữ chỉ nhận tên an toàn), giữ nghĩa để bộ não đọc. */
function tenAnToan(ten: string) {
  return ten.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^\w.\-]+/g, '-').replace(/-+/g, '-');
}

export function TaiCanhTram({ job, daCo }: { job: string; daCo: string[] }) {
  const router = useRouter();
  const [dang, setDang] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  async function tai(files: FileList | null) {
    if (!files?.length) return;
    setDang(true);
    const sb = supabaseBrowser();
    const ghi: string[] = [];
    for (const f of Array.from(files)) {
      if (f.size > TOI_DA_MB * 1024 * 1024) {
        ghi.push(`✗ ${f.name}: nặng ${(f.size / 1048576).toFixed(0)}MB > ${TOI_DA_MB}MB — chép bằng USB vào thư mục "Canh tram" trong thư mục footage`);
        continue;
      }
      const { error } = await sb.storage.from('video-xem').upload(`${job}/canh-tram/${tenAnToan(f.name)}`, f, { upsert: true });
      ghi.push(error ? `✗ ${f.name}: ${error.message}` : `✓ ${f.name}`);
      setLog([...ghi]);
    }
    setLog(ghi);
    setDang(false);
    router.refresh();
  }

  return (
    <div className="settings wide">
      <label>
        <strong>Tải ảnh / video cảnh trám</strong>
        <span className="meta">
          Đặt tên file nói lên nội dung (vd <code>da-bong-troi-mua.jpg</code>). Mỗi file ≤ {TOI_DA_MB}MB; video nặng hơn thì chép bằng USB
          vào thư mục <code>Canh tram</code> bên trong thư mục footage trên máy dựng.
        </span>
        <input type="file" multiple accept="image/*,video/*" disabled={dang} onChange={(e) => tai(e.currentTarget.files)} />
      </label>
      {dang && <span className="meta">Đang tải…</span>}
      {!!log.length && <pre className="run-log">{log.join('\n')}</pre>}
      {!!daCo.length && <div className="meta">Đã có trên kho: {daCo.join(', ')}</div>}
    </div>
  );
}
