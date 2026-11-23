import { notFound } from 'next/navigation';
import type { KichBan } from '@app/du-an';
import { requireDuAn } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';

/** Bản đọc khi quay (điện thoại) / bản in: chữ to, chỉ lời nói + hình, không nút bấm. */
export default async function BanInKichBan({ params }: { params: Promise<{ id: string }> }) {
  await requireDuAn();
  const { id } = await params;
  const supabase = await supabaseServer();
  const [{ data: d }, { data: pb }] = await Promise.all([
    supabase.from('du_an').select('ten').eq('id', id).maybeSingle(),
    supabase.from('du_an_phien_ban').select('noi_dung,tao_luc').eq('du_an_id', id).eq('buoc', 'kich-ban').order('tao_luc', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!d || !pb) notFound();
  const kb = pb.noi_dung as KichBan;
  return (
    <div className="ban-in">
      <h1>{kb.tieu_de}</h1>
      <p className="meta">
        {d.ten} · ~{Math.round(kb.tong_giay)} giây · {kb.doan.length} đoạn
      </p>
      {kb.doan.map((x, i) => (
        <div key={i} className="ban-in-doan">
          <div className="meta">
            {i + 1}. {x.nhip}
            {x.nguoi_noi ? ` · ${x.nguoi_noi}` : ''} · {x.giay}s
          </div>
          <p className="ban-in-loi">{x.loi}</p>
          <p className="meta">🎥 {x.hinh}</p>
          {x.can_xac_minh && <p className="warn">⚠ {x.can_xac_minh}</p>}
        </div>
      ))}
      {kb.ghi_chu_quay.length > 0 && (
        <>
          <h2>Ghi chú khi quay</h2>
          <ul>{kb.ghi_chu_quay.map((g, i) => <li key={i}>{g}</li>)}</ul>
        </>
      )}
    </div>
  );
}
