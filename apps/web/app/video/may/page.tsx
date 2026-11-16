import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { formatDateTime, timeAgo } from '@/lib/format';
import { supabaseServer } from '@/lib/supabase';
import { mayDangBat } from '@/lib/video';
import { CaiDat, NutMay, QuyenNguoi, ThemMay } from './forms';

const NHAN_NK: Record<string, string> = {
  'tao': 'Thêm máy', 'chon-nhan-viec': 'Chọn nhận việc', 'thu-hoi': 'Thu hồi', 'bat': 'Máy bật',
  'tam-ngung': 'Tạm ngưng', 'bat-lai': 'Bật lại',
};

export default async function MayWorkerPage() {
  await requireAdmin();
  const supabase = await supabaseServer();
  const [{ data: may }, { data: nk }, { data: nguoi }, { data: cd }] = await Promise.all([
    supabase.from('video_workers').select('id,ten,trang_thai,dang_nhan_viec,phien_ban,lan_cuoi,footage,phong_cach,created_at').order('created_at'),
    supabase.from('video_worker_nhat_ky').select('id,worker_id,su_kien,chi_tiet,created_at').order('id', { ascending: false }).limit(40),
    supabase.rpc('video_ds_nguoi'),
    supabase.from('settings').select('key,value').in('key', ['video_tran_ngay_usd', 'video_phien_ban_toi_thieu', 'video_giu_ban_xem_ngay']),
  ]);
  const ten = new Map((may ?? []).map((m) => [m.id, m.ten]));
  const caiDat = new Map((cd ?? []).map((r) => [r.key, Number(r.value)]));

  return (
    <>
      <p><Link href="/video">← Video</Link></p>
      <h1>Máy worker</h1>
      <p className="muted">
        Chỉ admin thấy trang này. Việc mới luôn giao cho máy đang <strong>nhận việc</strong>; nhân viên không thấy, không chọn được máy.
        Máy không có chìa khóa do admin tạo thì không kết nối được.
      </p>

      <div className="card scroll">
        <table>
          <thead><tr><th>Máy</th><th>Tình trạng</th><th>Code</th><th>Footage</th><th></th></tr></thead>
          <tbody>
            {(may ?? []).map((m) => {
              const bat = mayDangBat(m.lan_cuoi);
              return (
                <tr key={m.id} className={m.trang_thai === 'thu-hoi' ? 'off' : ''}>
                  <td>
                    <strong>{m.ten}</strong>
                    {m.dang_nhan_viec && <> <span className="badge on">đang nhận việc</span></>}
                    <div className="meta">thêm {formatDateTime(m.created_at)}</div>
                  </td>
                  <td>
                    {m.trang_thai === 'hoat-dong'
                      ? <span className={bat ? 'on' : 'off'}>{bat ? '● đang bật' : `○ tắt · ${timeAgo(m.lan_cuoi)}`}</span>
                      : <span className="warn">{m.trang_thai === 'thu-hoi' ? 'đã thu hồi' : 'tạm ngưng'}</span>}
                  </td>
                  <td>{m.phien_ban ?? '—'}</td>
                  <td className="meta">
                    {(m.footage as string[]).length} thư mục
                    {(m.phong_cach as { ten: string; rieng: boolean }[]).some((p) => p.rieng) &&
                      <div>phong cách riêng: {(m.phong_cach as { ten: string; rieng: boolean }[]).filter((p) => p.rieng).map((p) => p.ten).join(', ')}</div>}
                  </td>
                  <td>
                    {m.trang_thai !== 'thu-hoi' && (
                      <div className="row-actions">
                        {m.trang_thai === 'hoat-dong' && !m.dang_nhan_viec && <NutMay may={m.id} hanhDong="chon" nhan="Chọn nhận việc" ghost={false} />}
                        {m.trang_thai === 'hoat-dong'
                          ? <NutMay may={m.id} hanhDong="tam-ngung" nhan="Tạm ngưng" />
                          : <NutMay may={m.id} hanhDong="bat-lai" nhan="Bật lại" />}
                        <NutMay may={m.id} hanhDong="thu-hoi" nhan="Thu hồi" hoi={`Thu hồi "${m.ten}"? Chìa khóa của máy này mất tác dụng vĩnh viễn.`} />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!may?.length && <tr><td colSpan={5} className="muted">Chưa có máy nào — thêm ở dưới.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2>Thêm máy</h2>
      <ThemMay />

      <h2>Người dùng module Video</h2>
      <div className="card scroll">
        <table>
          <thead><tr><th>Tài khoản</th><th>Quyền video</th></tr></thead>
          <tbody>
            {((nguoi ?? []) as { user_id: string; email: string; ten: string | null; role: string; video_quyen: string[] }[]).map((n) => (
              <tr key={n.user_id}>
                <td>{n.ten || n.email}<div className="meta">{n.email} · {n.role}</div></td>
                <td>{n.role === 'admin' ? <span className="meta">admin: có mọi quyền</span> : <QuyenNguoi user={n.user_id} quyen={n.video_quyen ?? []} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="meta">Người làm: tạo video, duyệt dàn ý, tải cảnh trám, duyệt thẻ. Người duyệt: xem nháp, góp ý, chốt.</p>

      <h2>Cài đặt</h2>
      <CaiDat tran={caiDat.get('video_tran_ngay_usd') ?? 8} phienBan={caiDat.get('video_phien_ban_toi_thieu') ?? 0}
        giuNgay={caiDat.get('video_giu_ban_xem_ngay') ?? 14} />

      <h2>Nhật ký máy</h2>
      <div className="card scroll">
        <table>
          <tbody>
            {(nk ?? []).map((r) => (
              <tr key={r.id}>
                <td className="meta" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(r.created_at)}</td>
                <td>{ten.get(r.worker_id) ?? '—'}</td>
                <td>{NHAN_NK[r.su_kien] ?? r.su_kien}{r.chi_tiet?.phien_ban ? ` · code ${r.chi_tiet.phien_ban}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
