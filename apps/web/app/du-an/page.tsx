import Link from 'next/link';
import { CAU_HOI_THUONG_HIEU, NHAN_TRANG_THAI, tenBuoc, type Khuon, type NoiDungKhanGia, type TrangThaiDuAn } from '@app/du-an';
import { co, requireDuAn } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { supabaseServer } from '@/lib/supabase';
import { TranForm } from './forms';

export default async function DuAnPage() {
  const me = await requireDuAn();
  const xemTien = co(me, 'chi-phi');
  const supabase = await supabaseServer();
  const [{ data: kt, error }, { data: duLieu }, { data: khuon }, { data: chi }, { data: tran }] = await Promise.all([
    supabase.from('du_an_kien_thuc').select('muc,noi_dung,cap_nhat_luc'),
    supabase.from('du_an_khan_gia_du_lieu').select('id,tom_tat'),
    supabase.from('du_an_khuon').select('ma,ten,noi_dung,video_mau').order('thu_tu'),
    supabase.rpc('du_an_chi_hom_nay'),
    supabase.rpc('du_an_tran_ngay'),
  ]);
  if (error) return <p className="warn">Chưa có bảng Dự án video — cần chạy migration 0020 trên Supabase.</p>;

  const muc = new Map((kt ?? []).map((r) => [r.muc, r]));
  const traLoi = ((muc.get('thuong-hieu')?.noi_dung as { tra_loi?: Record<string, string> } | undefined)?.tra_loi ?? {}) as Record<string, string>;
  const daTraLoi = CAU_HOI_THUONG_HIEU.filter((c) => traLoi[c.ma]?.trim()).length;
  const kg = (muc.get('khan-gia')?.noi_dung ?? {}) as NoiDungKhanGia;
  const files = duLieu ?? [];
  const dsKhuon = (khuon ?? []) as Pick<Khuon, 'ma' | 'ten' | 'noi_dung' | 'video_mau'>[];
  const coMau = dsKhuon.filter((k) => k.video_mau.length).length;

  const { data: duAn, error: loiDuAn } = await supabase
    .from('du_an')
    .select('id,ten,buoc,trang_thai,che_do,tao_boi,cap_nhat_luc')
    .order('cap_nhat_luc', { ascending: false })
    .limit(100);
  const dsDuAn = duAn ?? [];
  const [{ data: chi2 }, { data: nguoi }] = await Promise.all([
    dsDuAn.length ? supabase.rpc('du_an_chi_phi', { p_ids: dsDuAn.map((p) => p.id) }) : Promise.resolve({ data: [] }),
    supabase.rpc('du_an_ten_nguoi'),
  ]);
  const chiPhi = new Map(((chi2 ?? []) as { du_an_id: string; usd: number }[]).map((r) => [r.du_an_id, Number(r.usd)]));
  const tenNguoi = new Map(((nguoi ?? []) as { user_id: string; ten: string }[]).map((r) => [r.user_id, r.ten]));

  return (
    <>
      <h1>Dự án video</h1>
      <p className="meta">
        Nhập một ý tưởng → app làm như đội sản xuất: phát triển ý tưởng → kế hoạch nội dung → kịch bản (→ shotlist → Video editor). Kế hoạch: <code>docs/KE-HOACH-DU-AN-VIDEO.md</code>
      </p>

      <div className="inline title-row">
        <h2 style={{ margin: 0 }}>Dự án</h2>
        {(me.role === 'admin' || me.duAnQuyen['y-tuong']?.includes('lam')) && <Link href="/du-an/moi" className="button">＋ Dự án mới</Link>}
      </div>
      {loiDuAn ? (
        <div className="card warn">Chưa có bảng dự án — cần chạy migration 0022 trên Supabase.</div>
      ) : dsDuAn.length ? (
        <div className="card scroll">
          <table>
            <thead>
              <tr><th>Dự án</th><th>Bước</th><th>Trạng thái</th><th>Cách làm</th><th>Ai tạo</th><th>Cập nhật</th>{xemTien && <th>Chi phí</th>}</tr>
            </thead>
            <tbody>
              {dsDuAn.map((p) => (
                <tr key={p.id} className={p.trang_thai === 'huy' ? 'off' : ''}>
                  <td><Link href={`/du-an/${p.id}`}>{p.ten}</Link></td>
                  <td>{tenBuoc(p.buoc)}</td>
                  <td className={p.trang_thai === 'cho-duyet' ? 'warn' : p.trang_thai === 'xong' ? 'on' : p.trang_thai === 'loi' ? 'warn' : ''}>
                    {NHAN_TRANG_THAI[p.trang_thai as TrangThaiDuAn] ?? p.trang_thai}
                  </td>
                  <td>{p.che_do === 'nhanh' ? '⚡ nhanh' : 'duyệt'}</td>
                  <td>{tenNguoi.get(p.tao_boi ?? '') ?? '—'}</td>
                  <td>{formatDateTime(p.cap_nhat_luc)}</td>
                  {xemTien && <td>${(chiPhi.get(p.id) ?? 0).toFixed(2)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card muted">Chưa có dự án nào. Điền Kho tri thức bên dưới trước — đây là thứ quyết định kịch bản có đúng giọng shop, đúng khách hay không.</div>
      )}

      <h2>Kho tri thức</h2>
      <div className="du-an-tiles">
        <Link href="/du-an/kho/thuong-hieu" className="card du-an-tile">
          <strong>Thương hiệu</strong>
          <span className={daTraLoi === CAU_HOI_THUONG_HIEU.length ? 'on' : 'warn'}>
            {daTraLoi}/{CAU_HOI_THUONG_HIEU.length} câu đã trả lời
          </span>
          <span className="meta">Giọng nói, xưng hô, CTA, chính sách — nguồn chuẩn để AI không nói sai.</span>
        </Link>
        <Link href="/du-an/kho/khan-gia" className="card du-an-tile">
          <strong>Khán giả</strong>
          <span>{files.length} file dữ liệu{files.some((f) => !f.tom_tat) ? ` · ${files.filter((f) => !f.tom_tat).length} chưa đọc` : ''}</span>
          <span className={kg.da_duyet ? 'on' : 'warn'}>
            {kg.da_duyet ? `Insight đã duyệt ${formatDateTime(kg.da_duyet_luc ?? null)}` : kg.ban_ai ? 'Có bản insight AI — chờ duyệt' : 'Chưa có insight'}
          </span>
          <span className="meta">Bình luận, tin nhắn, số liệu FB / TikTok / YouTube → insight người xem.</span>
        </Link>
        <Link href="/du-an/kho/khuon" className="card du-an-tile">
          <strong>Khuôn video</strong>
          <span>{dsKhuon.length} khuôn · {coMau} khuôn có video mẫu</span>
          <span className="meta">{dsKhuon.map((k) => k.ten).join(' · ')}</span>
        </Link>
      </div>

      {me.role === 'admin' && (
        <>
          <h2>Chi phí AI</h2>
          <div className="card settings">
            <p>
              Hôm nay: <strong>${Number(chi ?? 0).toFixed(2)}</strong> / trần ${Number(tran ?? 3)} — trần riêng của Dự án video, không tính vào trần bản tin + sản phẩm hay video.
              Chi tiết ở <Link href="/settings">Cài đặt → Chi phí AI</Link>.
            </p>
            <TranForm tran={Number(tran ?? 3)} />
          </div>
        </>
      )}
    </>
  );
}
