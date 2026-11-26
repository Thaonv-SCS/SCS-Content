import { notFound } from 'next/navigation';
import { NHAN_LOAI_CANH, tenThuMucFootage, type Canh, type Shotlist } from '@app/du-an';
import { requireDuAn } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';

/** Bản mang đi quay (điện thoại) / in: xếp theo THỨ TỰ QUAY, chữ to, không nút bấm. */
export default async function BanInShotlist({ params }: { params: Promise<{ id: string }> }) {
  await requireDuAn();
  const { id } = await params;
  const supabase = await supabaseServer();
  const [{ data: d }, { data: pb }] = await Promise.all([
    supabase.from('du_an').select('ten').eq('id', id).maybeSingle(),
    supabase.from('du_an_phien_ban').select('noi_dung').eq('du_an_id', id).eq('buoc', 'shotlist').order('tao_luc', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!d || !pb) notFound();
  const sl = pb.noi_dung as Shotlist;
  const theoMa = new Map(sl.canh.map((c) => [c.ma, c]));
  // cảnh không nằm trong nhóm nào (vd sau khi sửa tay) → nhóm "Còn lại"
  const daXep = new Set(sl.thu_tu_quay.flatMap((n) => n.canh));
  const conLai = sl.canh.filter((c) => !daXep.has(c.ma) && c.loai !== 'do-hoa');
  const nhom = [...sl.thu_tu_quay, ...(conLai.length ? [{ boi_canh: 'Còn lại', canh: conLai.map((c) => c.ma), ghi_chu: '' }] : [])];
  const doHoa = sl.canh.filter((c) => c.loai === 'do-hoa');

  const The = ({ c }: { c: Canh }) => (
    <div className="ban-in-doan">
      <div className="meta">
        <strong>{c.ma}</strong> · {NHAN_LOAI_CANH[c.loai] ?? c.loai}
        {c.nguoi ? ` · ${c.nguoi}` : ''} · {[c.co_canh, c.goc_may, c.chuyen_dong].filter(Boolean).join(' · ')} · quay {c.so_lan} lần
      </div>
      <p className="ban-in-loi">{c.mo_ta}</p>
      {c.thoai && <p>🗣 “{c.thoai}”</p>}
      {c.dien_xuat && <p className="meta">🎭 {c.dien_xuat}</p>}
      {c.dao_cu.filter(Boolean).length > 0 && <p className="meta">🧰 {c.dao_cu.filter(Boolean).join(', ')}</p>}
      {c.ghi_chu && <p className="warn">{c.ghi_chu}</p>}
    </div>
  );

  return (
    <div className="ban-in">
      <h1>Shotlist — {d.ten}</h1>
      <p className="meta">
        {sl.canh.length} cảnh · thư mục footage: <code>{tenThuMucFootage(d.ten)}</code> (đổi ngày thành ngày quay)
      </p>
      <p>{sl.phong_cach_quay}</p>

      <h2>Checklist trước khi quay</h2>
      {sl.checklist.map((n, i) => (
        <div key={i}>
          <strong>{n.nhom}</strong>
          <ul>{n.muc.map((m, k) => <li key={k}>☐ {m}</li>)}</ul>
        </div>
      ))}
      {sl.luu_y.length > 0 && (
        <>
          <h2>Đạo diễn dặn</h2>
          <ul>{sl.luu_y.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </>
      )}

      {nhom.map((n, i) => (
        <section key={i}>
          <h2>
            {i + 1}. {n.boi_canh}
          </h2>
          {n.ghi_chu && <p className="meta">{n.ghi_chu}</p>}
          {n.canh.map((m) => {
            const c = theoMa.get(m);
            return c ? <The key={m} c={c} /> : null;
          })}
        </section>
      ))}

      {doHoa.length > 0 && (
        <>
          <h2>Không cần quay (editor tự làm)</h2>
          {doHoa.map((c) => <The key={c.ma} c={c} />)}
        </>
      )}
    </div>
  );
}
