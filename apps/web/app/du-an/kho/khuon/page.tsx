import Link from 'next/link';
import type { Khuon } from '@app/du-an';
import { requireDuAn, suaKho } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { supabaseServer } from '@/lib/supabase';
import { ThemKhuonForm } from '../../forms';

export default async function KhuonPage() {
  const me = await requireDuAn();
  const supabase = await supabaseServer();
  const { data } = await supabase.from('du_an_khuon').select('ma,ten,thu_tu,noi_dung,video_mau,cap_nhat_luc').order('thu_tu');
  const ds = (data ?? []) as (Khuon & { cap_nhat_luc: string })[];

  return (
    <>
      <p><Link href="/du-an">← Dự án video</Link></p>
      <h1>Khuôn video</h1>
      <p className="meta">
        Mỗi khuôn là "công thức" một loại video: mục tiêu, các nhịp, độ dài, kiểu hook. AI chọn khuôn khi phát triển ý tưởng và viết kịch bản theo nhịp của khuôn.
        Bản đầu là bản nháp chung — thêm video mẫu của shop để tao phân tích và chỉnh theo đúng gu.
      </p>
      {suaKho(me) && <ThemKhuonForm ds={ds.map((k) => ({ ma: k.ma, ten: k.ten }))} />}
      <div className="du-an-tiles">
        {ds.map((k) => (
          <Link key={k.ma} href={`/du-an/kho/khuon/${k.ma}`} className="card du-an-tile">
            <strong>{k.ten}</strong>
            <span className="meta">{k.noi_dung.muc_tieu}</span>
            <span>
              {k.noi_dung.do_dai} · {k.noi_dung.nguoi_noi} · {k.noi_dung.nhip.length} nhịp · phong cách {k.noi_dung.phong_cach_dung || 'co-ban'}
            </span>
            <span className={k.video_mau.length ? 'on' : 'warn'}>
              {k.video_mau.length ? `${k.video_mau.length} video mẫu` : 'chưa có video mẫu'}
              {k.noi_dung.trang_thai === 'nhap' ? ' · bản nháp chung' : ' · đã học từ mẫu'}
            </span>
            <span className="meta">sửa {formatDateTime(k.cap_nhat_luc)}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
