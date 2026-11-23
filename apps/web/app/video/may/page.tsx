import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { formatDateTime, timeAgo } from '@/lib/format';
import { supabaseServer } from '@/lib/supabase';
import { mayDangBat } from '@/lib/video';
import { CaiDat, NutMay, QuyenFootage, QuyenNguoi, ThemMay } from './forms';

const NHAN_NK: Record<string, string> = {
  'tao': 'Thêm máy', 'chon-nhan-viec': 'Bật nhận việc', 'bo-nhan-viec': 'Thôi nhận việc', 'thu-hoi': 'Thu hồi', 'bat': 'Máy bật',
  'tam-ngung': 'Tạm ngưng', 'bat-lai': 'Bật lại',
};

type CauHinhMay = {
  cpu?: string; so_nhan?: number; ram_gb?: number; card?: string; ma_hoa?: string; nhanh_hon_cpu?: number;
  giai_ma_cuda?: boolean; uoc_phut_dung?: number; thu_muc_footage?: string; thu_muc_du_an?: string;
  o_trong_gb?: number; thieu?: string[]; kiem_luc?: string;
};

/** Cấu hình máy do cong-cu/kiem-tra-may.py đo, máy gửi lên mỗi lần báo "đang bật". */
function CauHinh({ ch, soFootage, rieng }: { ch: CauHinhMay; soFootage: number; rieng: string[] }) {
  if (!ch.kiem_luc) {
    return <span className="warn">Chưa chạy "Kiểm tra máy" (python cong-cu/kiem-tra-may.py) · {soFootage} thư mục footage</span>;
  }
  return (
    <div className="cau-hinh">
      <div>{ch.cpu} · {ch.so_nhan} luồng · RAM {ch.ram_gb} GB</div>
      <div>Card: {ch.card || '—'}</div>
      <div>Dựng bằng <strong>{ch.ma_hoa}</strong>{ch.nhanh_hon_cpu && ch.nhanh_hon_cpu > 1.05 ? ` (nhanh gấp ${ch.nhanh_hon_cpu} lần CPU)` : ''}
        {' '}· ước tính <strong>~{ch.uoc_phut_dung} phút</strong>/video</div>
      <div>Footage: <code>{ch.thu_muc_footage}</code> ({soFootage} thư mục)</div>
      <div>Dự án: <code>{ch.thu_muc_du_an}</code></div>
      <div className={(ch.o_trong_gb ?? 999) < 100 ? 'warn' : ''}>Ổ còn trống {ch.o_trong_gb} GB{(ch.o_trong_gb ?? 999) < 100 ? ' — ít, nên ≥ 100 GB' : ''}</div>
      {!!rieng.length && <div>Phong cách riêng: {rieng.join(', ')}</div>}
      {!!ch.thieu?.length && <div className="warn">Còn thiếu: {ch.thieu.join('; ')}</div>}
      <div>kiểm tra lúc {ch.kiem_luc}</div>
    </div>
  );
}

export default async function MayWorkerPage() {
  await requireAdmin();
  const supabase = await supabaseServer();
  const [{ data: may }, { data: nk }, { data: nguoi }, { data: cd }, { data: qf }] = await Promise.all([
    supabase.from('video_workers').select('id,ten,trang_thai,dang_nhan_viec,phien_ban,lan_cuoi,footage,phong_cach,cau_hinh,created_at').order('created_at'),
    supabase.from('video_worker_nhat_ky').select('id,worker_id,su_kien,chi_tiet,created_at').order('id', { ascending: false }).limit(40),
    supabase.rpc('video_ds_nguoi'),
    supabase.from('settings').select('key,value').in('key', ['video_tran_ngay_usd', 'video_phien_ban_toi_thieu', 'video_giu_ban_xem_ngay']),
    supabase.from('video_footage_quyen').select('footage,che_do,nguoi'),
  ]);
  const ten = new Map((may ?? []).map((m) => [m.id, m.ten]));
  const caiDat = new Map((cd ?? []).map((r) => [r.key, Number(r.value)]));

  return (
    <>
      <p><Link href="/video">← Video editor</Link></p>
      <h1>Máy worker</h1>
      <p className="muted">
        Chỉ admin thấy trang này. Bật <strong>nhận việc</strong> cho bao nhiêu máy cũng được: video mới <strong>tự giao cho máy đang chứa
        footage</strong> (nhiều máy cùng có thì ưu tiên máy đang bật, ít việc, dựng nhanh). Nhân viên không chọn được máy.
        Máy không có chìa khóa do admin tạo thì không kết nối được.
      </p>

      <div className="card scroll">
        <table>
          <thead><tr><th>Máy</th><th>Tình trạng</th><th>Code</th><th>Cấu hình &amp; thư mục</th><th></th></tr></thead>
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
                  <td className="meta"><CauHinh ch={(m.cau_hinh ?? {}) as CauHinhMay} soFootage={(m.footage as string[]).length}
                    rieng={(m.phong_cach as { ten: string; rieng: boolean }[]).filter((p) => p.rieng).map((p) => p.ten)} /></td>
                  <td>
                    {m.trang_thai !== 'thu-hoi' && (
                      <div className="row-actions">
                        {m.trang_thai === 'hoat-dong' && (m.dang_nhan_viec
                          ? <NutMay may={m.id} hanhDong="bo-nhan" nhan="Thôi nhận việc" hoi={`"${m.ten}" thôi nhận video MỚI? (video đang làm dở trên máy này vẫn chạy tiếp)`} />
                          : <NutMay may={m.id} hanhDong="chon" nhan="Bật nhận việc" ghost={false} />)}
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

      <h2>Quyền footage</h2>
      <p className="meta">
        Mặc định mọi tài khoản có quyền video đều thấy và làm được mọi footage. <strong>Ẩn</strong> = chỉ admin thấy;
        <strong> Chỉ cho…</strong> = chỉ các tài khoản được tick. Footage bị chặn sẽ không hiện ở màn tạo video, và các video đã làm
        từ footage đó cũng ẩn với người bị chặn. Admin luôn thấy hết.
      </p>
      <div className="card scroll">
        <table>
          <thead><tr><th>Thư mục footage</th><th>Nằm ở máy</th><th>Ai được xem / làm</th></tr></thead>
          <tbody>
            {(() => {
              const oDau = new Map<string, string[]>();
              for (const m of may ?? []) {
                if (m.trang_thai === 'thu-hoi') continue;
                for (const f of m.footage as string[]) oDau.set(f, [...(oDau.get(f) ?? []), m.ten]);
              }
              const quyen = new Map((qf ?? []).map((q) => [q.footage as string, q as { che_do: string; nguoi: string[] }]));
              // tài khoản không phải admin, có quyền video
              const dsNguoi = ((nguoi ?? []) as { user_id: string; email: string; ten: string | null; role: string; video_quyen: string[] }[])
                .filter((n) => n.role !== 'admin' && n.video_quyen?.length).map((n) => ({ id: n.user_id, ten: n.ten || n.email }));
              const ds = [...oDau.keys()].sort().reverse();
              if (!ds.length) return <tr><td colSpan={3} className="muted">Chưa máy nào báo thư mục footage.</td></tr>;
              return ds.map((f) => {
                const q = quyen.get(f);
                return (
                  <tr key={f}>
                    <td><code>{f}</code>{q && <div className="warn meta">{q.che_do === 'an' ? 'đang ẩn' : `chỉ ${q.nguoi.length} tài khoản`}</div>}</td>
                    <td className="meta">{oDau.get(f)?.join(', ')}</td>
                    <td><QuyenFootage footage={f} cheDo={q?.che_do ?? 'moi-nguoi'} nguoi={q?.nguoi ?? []} dsNguoi={dsNguoi} /></td>
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>
      </div>

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
