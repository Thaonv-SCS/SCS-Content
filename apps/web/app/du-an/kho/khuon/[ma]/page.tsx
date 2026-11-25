import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Khuon } from '@app/du-an';
import { requireDuAn } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';
import { KhuonForm, VideoMauForm, XoaKhuonButton } from '../../../forms';

export default async function KhuonChiTietPage({ params }: { params: Promise<{ ma: string }> }) {
  const me = await requireDuAn();
  const { ma } = await params;
  const supabase = await supabaseServer();
  const sua = me.role === 'admin';
  const [{ data }, { data: may }] = await Promise.all([
    supabase.from('du_an_khuon').select('ma,ten,thu_tu,noi_dung,video_mau').eq('ma', ma).maybeSingle(),
    // phong cách lấy từ các máy dựng (mỗi máy báo thư mục "Phong cach" nó có); chỉ admin đọc được bảng máy
    sua ? supabase.from('video_workers').select('phong_cach') : Promise.resolve({ data: [] as { phong_cach: unknown }[] }),
  ]);
  if (!data) notFound();
  const k = data as Khuon;
  const phongCach = [
    ...new Set((may ?? []).flatMap((m) => ((m.phong_cach ?? []) as { ten: string }[]).map((p) => p.ten))),
  ].sort();

  return (
    <>
      <p><Link href="/du-an/kho/khuon">← Khuôn video</Link></p>
      <div className="inline title-row">
        <h1>{k.ten}</h1>
        <span className={`badge ${k.noi_dung.trang_thai === 'nhap' ? 'warn' : ''}`}>
          {k.noi_dung.trang_thai === 'nhap' ? 'bản nháp chung' : 'đã học từ video mẫu'}
        </span>
        {sua && <span className="spacer"><XoaKhuonButton ma={k.ma} ten={k.ten} /></span>}
      </div>
      <p className="meta">Mã khuôn: <code>{k.ma}</code> (AI và dự án dùng mã này, đổi tên khuôn không đổi mã)</p>
      <h2>Video mẫu của shop</h2>
      <VideoMauForm ma={k.ma} ds={k.video_mau} sua={sua} />
      <h2>Nội dung khuôn</h2>
      <KhuonForm ma={k.ma} ten={k.ten} thuTu={k.thu_tu} noiDung={k.noi_dung} sua={sua} phongCach={phongCach} />
    </>
  );
}
