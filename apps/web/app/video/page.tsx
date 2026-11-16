import Link from 'next/link';
import { requireVideo } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { supabaseServer } from '@/lib/supabase';
import { mayDangLam, nhanTrangThai, TRANG_THAI, type TrangThai } from '@/lib/video';
import { TuLamMoi } from './tu-lam-moi';

export default async function VideoPage() {
  const me = await requireVideo();
  const supabase = await supabaseServer();
  const [{ data: viec }, { data: nguoi }, { data: luaChon }] = await Promise.all([
    supabase.from('video_jobs').select('id,ten,trang_thai,thong_bao,footage,tao_boi,created_at,updated_at')
      .order('created_at', { ascending: false }).limit(50),
    supabase.rpc('video_ten_nguoi'),
    supabase.rpc('video_lua_chon'),
  ]);
  const ten = new Map(((nguoi ?? []) as { user_id: string; ten: string }[]).map((n) => [n.user_id, n.ten]));
  const ds = viec ?? [];
  const canMinh = (t: string) => {
    const ai = TRANG_THAI[t as TrangThai]?.ai;
    return (ai === 'lam' && me.videoQuyen.includes('lam')) || (ai === 'duyet' && me.videoQuyen.includes('duyet'));
  };
  const dangBat = !!(luaChon as { may_dang_bat?: boolean } | null)?.may_dang_bat;

  return (
    <>
      <TuLamMoi bat={ds.some((v) => mayDangLam(v.trang_thai))} giay={15} />
      <div className="inline title-row">
        <h1>Video</h1>
        {me.videoQuyen.includes('lam') && <Link href="/video/moi" className="button">+ Tạo video</Link>}
        {me.role === 'admin' && (
          <>
            <Link href="/video/lich-su" className="button ghost-button">Lịch sử tất cả máy</Link>
            <Link href="/video/may" className="button ghost-button">Máy worker</Link>
          </>
        )}
      </div>
      <p className="meta">
        Máy dựng: <span className={dangBat ? 'on' : 'warn'}>{dangBat ? '● đang bật' : '● đang tắt — việc mới sẽ chờ đến khi máy bật'}</span>
      </p>

      {ds.some((v) => canMinh(v.trang_thai)) && (
        <>
          <h2>Đang chờ mày</h2>
          <div className="feed">
            {ds.filter((v) => canMinh(v.trang_thai)).map((v) => (
              <Link key={v.id} href={`/video/${v.id}`} className="card video-cho">
                <strong>{v.ten}</strong> <span className="badge warn">{nhanTrangThai(v.trang_thai)}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      <h2>Tất cả video</h2>
      <div className="card scroll">
        <table>
          <thead>
            <tr><th>Video</th><th>Trạng thái</th><th>Ai tạo</th><th>Cập nhật</th></tr>
          </thead>
          <tbody>
            {ds.map((v) => (
              <tr key={v.id}>
                <td>
                  <Link href={`/video/${v.id}`}>{v.ten}</Link>
                  <div className="meta">{v.footage}</div>
                </td>
                <td>
                  <span className={v.trang_thai === 'loi' ? 'warn' : v.trang_thai === 'xong' ? 'on' : ''}>{nhanTrangThai(v.trang_thai)}</span>
                  {v.thong_bao && mayDangLam(v.trang_thai) && <div className="meta">{v.thong_bao}</div>}
                </td>
                <td>{v.tao_boi === me.id ? 'mày' : ten.get(v.tao_boi) ?? '—'}</td>
                <td>{formatDateTime(v.updated_at)}</td>
              </tr>
            ))}
            {!ds.length && <tr><td colSpan={4} className="muted">Chưa có video nào.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
