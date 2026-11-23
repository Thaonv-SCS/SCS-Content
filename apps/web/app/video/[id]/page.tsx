import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireVideo } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { supabaseServer } from '@/lib/supabase';
import { mayDangLam, nhanTrangThai, usd } from '@/lib/video';
import { Markdown } from '../markdown';
import { TuLamMoi } from '../tu-lam-moi';
import { AdminChayLai, AdminChuyenMay, DuyetDanY, DuyetThe, GopYChot, HuyViec, XongCanhTram } from './khung-duyet';
import { TaiCanhTram } from './tai-canh-tram';

type SuKien = { id: number; loai: string; noi_dung: Record<string, any>; nguoi: string | null; created_at: string };

const NHAN_SU_KIEN: Record<string, string> = {
  'dan-y': '📝 Máy nộp dàn ý', 'the': '🎴 Máy nộp thẻ đồ họa', 'nhap': '🎬 Máy nộp bản nháp', 'duyet': '✓ Duyệt',
  'gop-y': '💬 Góp ý', 'chot': '🏁 Chốt', 'huy': '✕ Hủy', 'loi': '⚠ Lỗi', 'thong-bao': 'ℹ Admin',
};

export default async function VideoChiTiet({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireVideo();
  const supabase = await supabaseServer();
  const [{ data: v }, { data: sk }, { data: nguoi }] = await Promise.all([
    supabase.from('video_jobs').select('*').eq('id', id).maybeSingle(),
    supabase.from('video_su_kien').select('id,loai,noi_dung,nguoi,created_at').eq('job_id', id).order('id'),
    supabase.rpc('video_ten_nguoi'),
  ]);
  if (!v) notFound();
  const suKien = (sk ?? []) as SuKien[];
  const ten = new Map(((nguoi ?? []) as { user_id: string; ten: string }[]).map((n) => [n.user_id, n.ten]));
  const cuoi = (loai: string) => [...suKien].reverse().find((s) => s.loai === loai)?.noi_dung;
  const danY = cuoi('dan-y');
  const the = cuoi('the');
  const nhap = cuoi('nhap');
  const loi = cuoi('loi');
  const lam = me.videoQuyen.includes('lam');
  const duyet = me.videoQuyen.includes('duyet');
  const admin = me.role === 'admin';

  const kho = supabase.storage.from('video-xem');
  const link = async (p?: string) => (p ? (await kho.createSignedUrl(p, 3600)).data?.signedUrl ?? null : null);
  const [anhThe, xemNhap, canhTram] = await Promise.all([
    link(the?.anh_duyet),
    link(nhap?.xem),
    v.trang_thai === 'cho-canh-tram' ? kho.list(`${id}/canh-tram`, { limit: 200 }) : Promise.resolve({ data: [] }),
  ]);
  // admin: máy nào làm + chi phí AI của video này
  const [{ data: may }, { data: chiPhi }] = admin
    ? await Promise.all([
      v.worker_id ? supabase.from('video_workers').select('ten').eq('id', v.worker_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('llm_calls').select('purpose,model,cost_usd').eq('job_id', id),
    ])
    : [{ data: null }, { data: null }];
  const tongChiPhi = (chiPhi ?? []).reduce((t, r) => t + Number(r.cost_usd), 0);
  // admin: máy khác đang hoạt động + có footage này (để chuyển máy khi máy đang làm hỏng)
  const { data: mayKhac } = admin
    ? await supabase.from('video_workers').select('id,ten,footage').eq('trang_thai', 'hoat-dong')
    : { data: null };
  const chuyenDuoc = ((mayKhac ?? []) as { id: string; ten: string; footage: string[] }[])
    .filter((m) => m.id !== v.worker_id && m.footage.includes(v.footage)).map(({ id: mid, ten: mten }) => ({ id: mid, ten: mten }));

  return (
    <>
      <TuLamMoi bat={mayDangLam(v.trang_thai)} />
      <p><Link href="/video">← Video editor</Link></p>
      <div className="inline title-row">
        <h1>{v.ten}</h1>
        <span className={`badge ${v.trang_thai === 'loi' ? 'warn' : ''}`}>{nhanTrangThai(v.trang_thai)}</span>
      </div>
      <p className="meta">
        {v.footage} · phong cách {v.phong_cach} · tạo bởi {ten.get(v.tao_boi) ?? '—'} lúc {formatDateTime(v.created_at)}
        {admin && <> · máy <strong>{may?.ten ?? '—'}</strong> · chi phí AI <strong>{usd(tongChiPhi)}</strong></>}
      </p>
      {v.thong_bao && <p className={v.trang_thai === 'loi' ? 'warn' : 'meta'}>{mayDangLam(v.trang_thai) ? '⏳ ' : ''}{v.thong_bao}</p>}

      {/* ───── Bước hiện tại ───── */}
      {v.trang_thai === 'cho-duyet-dan-y' && danY && (
        <div className="card settings wide">
          <h2 className="md-h">Dàn ý</h2>
          <Markdown text={danY.dan_y_md ?? ''} />
          {!!danY.cau_hoi?.length && (
            <div className="verify"><strong>Câu hỏi cần trả lời</strong><ol>{danY.cau_hoi.map((c: string, i: number) => <li key={i}>{c}</li>)}</ol></div>
          )}
          <details><summary><strong>Cảnh trám cần chuẩn bị</strong></summary><Markdown text={danY.can_tram_md ?? ''} /></details>
          {lam ? <DuyetDanY job={id} coCauHoi={!!danY.cau_hoi?.length} /> : <p className="meta">Chờ người làm duyệt.</p>}
        </div>
      )}

      {v.trang_thai === 'cho-canh-tram' && (
        <div className="card settings wide">
          <h2 className="md-h">Cảnh trám</h2>
          {danY?.can_tram_md && <Markdown text={danY.can_tram_md} />}
          {lam ? (
            <>
              <TaiCanhTram job={id} daCo={(canhTram.data ?? []).filter((f) => f.id).map((f) => f.name)} />
              <XongCanhTram job={id} />
            </>
          ) : <p className="meta">Chờ người làm chuẩn bị cảnh trám.</p>}
        </div>
      )}

      {v.trang_thai === 'cho-duyet-the' && the && (
        <div className="card settings wide">
          <h2 className="md-h">Thẻ đồ họa + chỗ đặt cảnh trám</h2>
          {anhThe && <img src={anhThe} alt="Các thẻ đồ họa, có đánh số" className="the-duyet" />}
          <Markdown text={the.dat_canh_tram_md ?? ''} />
          {lam ? <DuyetThe job={id} /> : <p className="meta">Chờ người làm duyệt thẻ.</p>}
        </div>
      )}

      {(v.trang_thai === 'cho-xem-nhap' || v.trang_thai === 'xong') && nhap && (
        <div className="card settings wide">
          <h2 className="md-h">{v.trang_thai === 'xong' ? 'Bản cuối' : `Bản nháp lần ${nhap.lan ?? 1}`} · {nhap.dai}s</h2>
          {xemNhap ? <video src={xemNhap} controls playsInline className="video-xem" /> : <p className="meta">Bản xem thử đã hết hạn lưu trên mạng.</p>}
          <p className="meta">File đầy đủ trên máy dựng: <code>{nhap.file}</code></p>
          {!!nhap.loi_nghi_ngo?.length && (
            <details><summary className="warn">Máy nghi ngờ {nhap.loi_nghi_ngo.length} chỗ (xem lại giúp)</summary>
              <ul>{nhap.loi_nghi_ngo.map((l: any, i: number) => <li key={i}>giây {Number(l.giay).toFixed(1)} — {l.muc}: {l.mo_ta}</li>)}</ul>
            </details>
          )}
          {v.trang_thai === 'xong'
            ? <p className="on">Đã chốt · {v.phut_cong} phút công người · {v.dung_duoc === 'co' ? 'dùng được' : v.dung_duoc === 'sua-nhieu' ? 'phải sửa nhiều' : 'không dùng được'}</p>
            : duyet ? <GopYChot job={id} /> : <p className="meta">Chờ người duyệt xem.</p>}
        </div>
      )}

      {v.trang_thai === 'loi' && (
        <div className="card settings wide">
          <strong className="warn">Máy gặp lỗi{loi?.buoc ? ` ở bước "${nhanTrangThai(loi.buoc)}"` : ''}</strong>
          {admin ? (
            <>
              {loi?.chi_tiet && <pre className="run-log">{String(loi.chi_tiet).slice(-1500)}</pre>}
              <AdminChayLai job={id} />
              {!!chuyenDuoc.length && <><span className="meta">Hoặc chuyển sang máy khác có footage này:</span><AdminChuyenMay job={id} may={chuyenDuoc} /></>}
            </>
          ) : <p className="meta">Báo admin xem giúp.</p>}
        </div>
      )}

      {v.trang_thai === 'huy' && <p className="off">Video đã hủy — máy không làm tiếp.{admin ? ' Admin mở lại được bằng "đặt lại bước" bên dưới.' : ''}</p>}

      {lam && v.trang_thai !== 'xong' && v.trang_thai !== 'huy' && (
        <details className="card"><summary className="meta">Không làm video này nữa?</summary><HuyViec job={id} /></details>
      )}

      {admin && v.trang_thai !== 'loi' && (
        <details className="card"><summary className="meta">Admin: đặt lại bước / chuyển máy</summary>
          <div className="settings wide">
            <AdminChayLai job={id} />
            {chuyenDuoc.length
              ? <><span className="meta">Chuyển sang máy khác có footage này (làm lại từ dàn ý):</span><AdminChuyenMay job={id} may={chuyenDuoc} /></>
              : <span className="meta">Không máy nào khác có thư mục footage "{v.footage}" để chuyển.</span>}
          </div>
        </details>
      )}

      {/* ───── Lịch sử ───── */}
      <h2>Lịch sử</h2>
      <div className="card scroll">
        <table>
          <tbody>
            {suKien.map((s) => (
              <tr key={s.id}>
                <td className="meta" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(s.created_at)}</td>
                <td>{NHAN_SU_KIEN[s.loai] ?? s.loai}{s.nguoi ? ` · ${ten.get(s.nguoi) ?? ''}` : ''}</td>
                <td>
                  {s.noi_dung?.ghi_chu || s.noi_dung?.gop_y || s.noi_dung?.ly_do || (s.loai === 'chot' ? `${s.noi_dung.phut} phút · ${s.noi_dung.dung_duoc}` : '')
                    || (s.loai === 'nhap' ? `lần ${s.noi_dung.lan} · ${s.noi_dung.dai}s` : '') || (s.loai === 'thong-bao' ? `${s.noi_dung.admin_dat}: ${s.noi_dung.ly_do}` : '')}
                </td>
              </tr>
            ))}
            {!suKien.length && <tr><td className="muted">Chưa có gì — máy chưa nhận việc.</td></tr>}
          </tbody>
        </table>
      </div>
      {admin && !!chiPhi?.length && (
        <details className="card"><summary className="meta">Chi phí AI từng bước ({usd(tongChiPhi)})</summary>
          <table><tbody>{chiPhi.map((c, i) => <tr key={i}><td>{c.purpose}</td><td className="meta">{c.model}</td><td>{usd(Number(c.cost_usd))}</td></tr>)}</tbody></table>
        </details>
      )}
    </>
  );
}
