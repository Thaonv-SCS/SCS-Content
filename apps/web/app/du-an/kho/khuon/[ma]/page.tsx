import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Khuon } from '@app/du-an';
import { requireDuAn } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';
import { KhuonForm, VideoMauForm } from '../../../forms';

export default async function KhuonChiTietPage({ params }: { params: Promise<{ ma: string }> }) {
  const me = await requireDuAn();
  const { ma } = await params;
  const supabase = await supabaseServer();
  const { data } = await supabase.from('du_an_khuon').select('ma,ten,thu_tu,noi_dung,video_mau').eq('ma', ma).maybeSingle();
  if (!data) notFound();
  const k = data as Khuon;
  const sua = me.role === 'admin';

  return (
    <>
      <p><Link href="/du-an/kho/khuon">← Khuôn video</Link></p>
      <div className="inline title-row">
        <h1>{k.ten}</h1>
        <span className={`badge ${k.noi_dung.trang_thai === 'nhap' ? 'warn' : ''}`}>
          {k.noi_dung.trang_thai === 'nhap' ? 'bản nháp chung' : 'đã học từ video mẫu'}
        </span>
      </div>
      <h2>Video mẫu của shop</h2>
      <VideoMauForm ma={k.ma} ds={k.video_mau} sua={sua} />
      <h2>Nội dung khuôn</h2>
      <KhuonForm ma={k.ma} ten={k.ten} noiDung={k.noi_dung} sua={sua} />
    </>
  );
}
