import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { supabaseServer } from '@/lib/supabase';
import { nhanTrangThai, usd } from '@/lib/video';

const DUNG_DUOC: Record<string, string> = { co: 'dùng được', 'sua-nhieu': 'sửa nhiều', khong: 'không dùng được' };

export default async function LichSuVideoPage({ searchParams }: { searchParams: Promise<{ may?: string }> }) {
  await requireAdmin();
  const { may: locMay } = await searchParams;
  const supabase = await supabaseServer();
  let q = supabase.from('video_jobs')
    .select('id,ten,footage,worker_id,trang_thai,tao_boi,phut_cong,dung_duoc,created_at,updated_at')
    .order('created_at', { ascending: false }).limit(500);
  if (locMay) q = q.eq('worker_id', locMay);
  const [{ data: viec }, { data: may }, { data: nguoi }, { data: chiPhi }] = await Promise.all([
    q,
    supabase.from('video_workers').select('id,ten,trang_thai').order('created_at'),
    supabase.rpc('video_ten_nguoi'),
    supabase.from('llm_calls').select('job_id,cost_usd').not('job_id', 'is', null),
  ]);
  const ds = viec ?? [];
  const tenMay = new Map((may ?? []).map((m) => [m.id, m.ten]));
  const tenNguoi = new Map(((nguoi ?? []) as { user_id: string; ten: string }[]).map((n) => [n.user_id, n.ten]));
  const phi = new Map<string, number>();
  for (const r of chiPhi ?? []) phi.set(r.job_id, (phi.get(r.job_id) ?? 0) + Number(r.cost_usd));

  // thống kê theo máy (trên toàn bộ việc, không phụ thuộc bộ lọc)
  const { data: tatCa } = locMay ? await supabase.from('video_jobs').select('id,worker_id,trang_thai,phut_cong,dung_duoc') : { data: ds };
  const theoMay = new Map<string, { so: number; xong: number; phi: number; phut: number[]; dung: number }>();
  for (const v of tatCa ?? []) {
    const k = v.worker_id ?? 'khong-ro';
    const t = theoMay.get(k) ?? { so: 0, xong: 0, phi: 0, phut: [], dung: 0 };
    t.so++; t.phi += phi.get(v.id) ?? 0;
    if (v.trang_thai === 'xong') { t.xong++; if (v.phut_cong != null) t.phut.push(v.phut_cong); if (v.dung_duoc === 'co') t.dung++; }
    theoMay.set(k, t);
  }
  const tong = [...theoMay.values()].reduce((a, t) => ({ xong: a.xong + t.xong, phut: [...a.phut, ...t.phut], dung: a.dung + t.dung, phi: a.phi + t.phi }),
    { xong: 0, phut: [] as number[], dung: 0, phi: 0 });
  const tb = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const tbPhut = tb(tong.phut);

  return (
    <>
      <p><Link href="/video">← Video</Link></p>
      <h1>Lịch sử video — tất cả máy</h1>

      <div className="card settings wide">
        <strong>So với tiêu chí V1</strong>
        <div>
          Đã chốt <strong>{tong.xong}</strong> video · trung bình <strong className={tbPhut != null && tbPhut <= 60 ? 'on' : 'warn'}>{tbPhut ?? '—'} phút</strong> công người
          (đạt nếu ≤ 60) · <strong className={tong.xong && tong.dung / tong.xong >= 0.7 ? 'on' : 'warn'}>{tong.dung}/{tong.xong}</strong> dùng được
          (đạt nếu ≥ 7/10) · chi phí AI <strong>{usd(tong.phi)}</strong>{tong.xong ? ` (~${usd(tong.phi / tong.xong)}/video)` : ''}
        </div>
      </div>

      <h2>Theo máy</h2>
      <div className="card scroll">
        <table>
          <thead><tr><th>Máy</th><th>Số video</th><th>Đã chốt</th><th>Phút TB</th><th>Dùng được</th><th>Chi phí AI</th></tr></thead>
          <tbody>
            {[...theoMay.entries()].map(([k, t]) => (
              <tr key={k}>
                <td><Link href={`/video/lich-su?may=${k}`}>{tenMay.get(k) ?? '(máy đã xóa)'}</Link></td>
                <td>{t.so}</td><td>{t.xong}</td><td>{tb(t.phut) ?? '—'}</td><td>{t.xong ? `${t.dung}/${t.xong}` : '—'}</td><td>{usd(t.phi)}</td>
              </tr>
            ))}
            {!theoMay.size && <tr><td colSpan={6} className="muted">Chưa có video nào.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="inline title-row">
        <h2>Từng video{locMay ? ` — máy ${tenMay.get(locMay) ?? ''}` : ''}</h2>
        {locMay && <Link href="/video/lich-su">bỏ lọc</Link>}
      </div>
      <div className="card scroll">
        <table>
          <thead><tr><th>Video</th><th>Máy</th><th>Trạng thái</th><th>Ai tạo</th><th>Tạo / cập nhật</th><th>Phút công</th><th>Chi phí AI</th></tr></thead>
          <tbody>
            {ds.map((v) => (
              <tr key={v.id}>
                <td><Link href={`/video/${v.id}`}>{v.ten}</Link><div className="meta">{v.footage}</div></td>
                <td>{tenMay.get(v.worker_id) ?? '—'}</td>
                <td className={v.trang_thai === 'loi' ? 'warn' : v.trang_thai === 'xong' ? 'on' : v.trang_thai === 'huy' ? 'off' : ''}>{nhanTrangThai(v.trang_thai)}</td>
                <td>{tenNguoi.get(v.tao_boi) ?? '—'}</td>
                <td className="meta">{formatDateTime(v.created_at)}<br />{formatDateTime(v.updated_at)}</td>
                <td>{v.phut_cong ?? '—'}{v.dung_duoc && <div className="meta">{DUNG_DUOC[v.dung_duoc]}</div>}</td>
                <td>{usd(phi.get(v.id) ?? 0)}</td>
              </tr>
            ))}
            {!ds.length && <tr><td colSpan={7} className="muted">Không có video nào.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
