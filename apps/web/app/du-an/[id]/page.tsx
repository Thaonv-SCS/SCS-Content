import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  CAC_BUOC,
  MUC_TIEU,
  NHAN_TRANG_THAI,
  tenThuMucFootage,
  type Brief,
  type Buoc,
  type DuyetYTuong,
  type KeHoach,
  type KichBan,
  type Shotlist,
  type TrangThaiDuAn,
  type YTuong,
} from '@app/du-an';
import { co, requireDuAn } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { supabaseServer } from '@/lib/supabase';
import { TuLamMoi } from '@/app/video/tu-lam-moi';
import { ChayLaiButton, HuyButton, KeHoachView, KichBanView, LapShotlistButton, ShotlistView, YTuongView } from './workspace';

type PB = { id: string; buoc: Buoc; nguon: 'ai' | 'sua-tay'; noi_dung: unknown; yeu_cau: string | null; duyet: Record<string, unknown> | null; duyet_luc: string | null; tao_luc: string };
type SP = { name: string; link: string; gia: string; con_hang: boolean };

export default async function DuAnChiTiet({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireDuAn();
  const { id } = await params;
  const supabase = await supabaseServer();
  const [{ data: d }, { data: pbs }, { data: chi }, { data: khuon }] = await Promise.all([
    supabase.from('du_an').select('id,ten,brief,san_pham,che_do,buoc,trang_thai,thong_bao,job_started_at,tao_luc,cap_nhat_luc').eq('id', id).maybeSingle(),
    supabase.from('du_an_phien_ban').select('id,buoc,nguon,noi_dung,yeu_cau,duyet,duyet_luc,tao_luc').eq('du_an_id', id).order('tao_luc', { ascending: false }),
    supabase.rpc('du_an_chi_phi', { p_ids: [id] }),
    supabase.from('du_an_khuon').select('ma,ten'),
  ]);
  if (!d) notFound();
  const brief = d.brief as Brief;
  const tt = d.trang_thai as TrangThaiDuAn;
  const ds = (pbs ?? []) as PB[];
  const tenKhuon = Object.fromEntries((khuon ?? []).map((k) => [k.ma, k.ten]));
  const usd = Number((chi as { usd: number }[] | null)?.[0]?.usd ?? 0);
  const q = (b: Buoc) => ({
    lam: me.role === 'admin' || !!me.duAnQuyen[b]?.includes('lam'),
    duyet: me.role === 'admin' || !!me.duAnQuyen[b]?.includes('duyet'),
  });
  const dangLam = tt === 'dang-lam';
  const treo = dangLam && (!d.job_started_at || Date.now() - new Date(d.job_started_at).getTime() > 15 * 60_000);
  const viTri = CAC_BUOC.findIndex((b) => b.ma === d.buoc);
  // Bước hiện: tới bước đang làm (xong thì hiện hết); bản cũ hơn của bước sau (khi làm lại bước trước) ẩn vào lịch sử
  const hienBuoc = CAC_BUOC.filter((_, i) => tt === 'xong' || i <= viTri);
  const kbMoi = ds.find((p) => p.buoc === 'kich-ban');

  return (
    <>
      <TuLamMoi bat={dangLam && !treo} giay={4} />
      <p><Link href="/du-an">← Dự án video</Link></p>
      <div className="inline title-row">
        <h1>{d.ten}</h1>
        <span className={`badge ${tt === 'loi' ? 'warn' : ''}`}>{NHAN_TRANG_THAI[tt]}</span>
        <span className="badge">{d.che_do === 'nhanh' ? '⚡ Làm nhanh' : 'Qua các bước duyệt'}</span>
      </div>
      <p className="meta">
        Tạo {formatDateTime(d.tao_luc)} · cập nhật {formatDateTime(d.cap_nhat_luc)}{co(me, 'chi-phi') && ` · chi phí AI $${usd.toFixed(2)}`}
      </p>

      <div className={`card status-line ${tt === 'loi' ? 'warn' : ''}`}>
        {dangLam && !treo && '⏳ '}
        {treo ? 'Bước này chạy quá 15 phút không xong — có thể đã bị ngắt.' : d.thong_bao}
        {(tt === 'loi' || treo) && q(d.buoc as Buoc).lam && <> <ChayLaiButton id={d.id} /></>}
      </div>

      {/* Tiến độ các bước */}
      <div className="du-an-buoc">
        {CAC_BUOC.map((b, i) => {
          const daXong = (tt === 'xong' && ds.some((p) => p.buoc === b.ma)) || i < viTri;
          const dangO = i === viTri && tt !== 'xong';
          return (
            <a key={b.ma} href={`#${b.ma}`} className={`du-an-buoc-o ${daXong ? 'xong' : ''} ${dangO ? 'dang' : ''}`}>
              {daXong ? '✓' : `${i + 1}.`} {b.ten}
            </a>
          );
        })}
      </div>

      <details className="card">
        <summary><strong>Brief</strong> — {brief.y_tuong.slice(0, 90)}{brief.y_tuong.length > 90 ? '…' : ''}</summary>
        <p style={{ whiteSpace: 'pre-wrap' }}>{brief.y_tuong}</p>
        <p className="meta">
          Mục tiêu: {MUC_TIEU[brief.muc_tieu] ?? brief.muc_tieu} · Nền tảng: {brief.nen_tang.join(', ') || '—'} · Khuôn: {brief.khuon ? tenKhuon[brief.khuon] ?? brief.khuon : 'AI chọn'}
          {brief.ghi_chu ? ` · Ghi chú: ${brief.ghi_chu}` : ''}
        </p>
        {(d.san_pham as SP[]).length > 0 && (
          <ul>
            {(d.san_pham as SP[]).map((p) => (
              <li key={p.link}>
                <a href={p.link} target="_blank" rel="noreferrer">{p.name}</a> — {p.gia} · {p.con_hang ? 'còn hàng' : <span className="warn">hết hàng</span>}
              </li>
            ))}
          </ul>
        )}
      </details>

      {hienBuoc.map((b) => {
        const cacBan = ds.filter((p) => p.buoc === b.ma);
        const ban = cacBan[0];
        const cho = tt === 'cho-duyet' && d.buoc === b.ma;
        return (
          <section key={b.ma} id={b.ma}>
            <h2>
              {b.ten} <span className="meta" style={{ fontWeight: 400 }}>· {b.vai}</span>
            </h2>
            {!ban ? (
              <div className="card muted">
                {dangLam && d.buoc === b.ma ? (
                  '⏳ AI đang làm bước này (1–2 phút)…'
                ) : b.ma === 'shotlist' && kbMoi && !dangLam && q('shotlist').lam ? (
                  <span className="inline wrap">Chưa có shotlist. <LapShotlistButton id={d.id} /></span>
                ) : (
                  'Chưa có.'
                )}
              </div>
            ) : (
              <div className="card">
                {ban.nguon === 'sua-tay' && <p className="meta">✎ Bản sửa tay · {formatDateTime(ban.tao_luc)}</p>}
                {b.ma === 'y-tuong' && (
                  <YTuongView id={d.id} nd={ban.noi_dung as YTuong} duyet={ban.duyet as DuyetYTuong | null} cho={cho} q={q(b.ma)} tenKhuon={tenKhuon} />
                )}
                {b.ma === 'ke-hoach' && (
                  <KeHoachView id={d.id} nd={ban.noi_dung as KeHoach} cho={cho} q={q(b.ma)} tenKhuon={tenKhuon} ghiChuDuyet={(ban.duyet as { ghi_chu?: string } | null)?.ghi_chu} />
                )}
                {b.ma === 'kich-ban' && (
                  <KichBanView
                    id={d.id}
                    nd={ban.noi_dung as KichBan}
                    cho={cho}
                    xong={tt === 'xong' || (d.buoc === 'shotlist' && !dangLam)}
                    q={q(b.ma)}
                    banIn={`/du-an/${d.id}/kich-ban`}
                  />
                )}
                {b.ma === 'shotlist' && (
                  <ShotlistView
                    id={d.id}
                    nd={ban.noi_dung as Shotlist}
                    cho={cho}
                    xong={tt === 'xong'}
                    q={q(b.ma)}
                    banIn={`/du-an/${d.id}/shotlist`}
                    thuMuc={tenThuMucFootage(d.ten)}
                    cu={!dangLam && !!kbMoi && kbMoi.tao_luc > ban.tao_luc}
                  />
                )}
                {cacBan.length > 1 && (
                  <details style={{ marginTop: 12 }}>
                    <summary className="meta">Lịch sử phiên bản ({cacBan.length})</summary>
                    <ul className="meta">
                      {cacBan.map((p, k) => (
                        <li key={p.id}>
                          {k === 0 ? 'Đang dùng · ' : ''}
                          {formatDateTime(p.tao_luc)} · {p.nguon === 'sua-tay' ? 'sửa tay' : 'AI'}
                          {p.yeu_cau ? ` · ${p.yeu_cau}` : ''}
                          {p.duyet_luc ? ' · đã duyệt' : ''}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </section>
        );
      })}

      {tt !== 'huy' && tt !== 'xong' && (
        <p style={{ marginTop: 24 }}>
          <HuyButton id={d.id} />
        </p>
      )}
    </>
  );
}
