import Link from 'next/link';
import type { KichBan, Shotlist } from '@app/du-an';
import { requireVideo } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';
import type { Footage } from '@/lib/video';
import { TaoViecForm, type TuDuAn } from './form';

type LuaChon = { footage: Footage[]; phong_cach: { ten: string; rieng: boolean }[]; may_dang_bat: boolean; so_may?: number };

export default async function TaoVideoPage({ searchParams }: { searchParams: Promise<{ du_an?: string }> }) {
  await requireVideo('lam');
  const { du_an: duAnId } = await searchParams;
  const supabase = await supabaseServer();
  const [{ data }, { data: daCo }] = await Promise.all([
    supabase.rpc('video_lua_chon'),
    supabase.from('video_jobs').select('footage'),
  ]);
  const lc = (data ?? { footage: [], phong_cach: [], may_dang_bat: false }) as LuaChon;
  const daDung = new Set((daCo ?? []).map((v) => v.footage as string));
  // database cũ (chưa chạy 0016) trả footage dạng chuỗi → đổi sang dạng mới để trang vẫn chạy
  lc.footage = (lc.footage as (Footage | string)[]).map((f) =>
    typeof f === 'string' ? { ten: f, o_dau: [], bat: lc.may_dang_bat } : f);

  // Tạo từ Dự án video: điền sẵn tên, hook đã chọn, phong cách theo khuôn
  let tuDuAn: TuDuAn | null = null;
  if (duAnId) {
    const lay = (buoc: string) =>
      supabase.from('du_an_phien_ban').select('noi_dung').eq('du_an_id', duAnId).eq('buoc', buoc).order('tao_luc', { ascending: false }).limit(1).maybeSingle();
    const [{ data: da }, { data: kb }, { data: sl }, { data: kh }] = await Promise.all([
      supabase.from('du_an').select('id,ten').eq('id', duAnId).maybeSingle(),
      lay('kich-ban'),
      lay('shotlist'),
      lay('ke-hoach'),
    ]);
    if (da && kb) {
      const k = kb.noi_dung as KichBan;
      const maKhuon = (kh?.noi_dung as { khuon?: string } | null)?.khuon;
      const { data: khuon } = maKhuon ? await supabase.from('du_an_khuon').select('noi_dung').eq('ma', maKhuon).maybeSingle() : { data: null };
      tuDuAn = {
        id: da.id,
        ten: da.ten,
        tieu_de: k.tieu_de,
        hook: k.hook[(k.hook_chon || 1) - 1]?.cau ?? '',
        phong_cach: (khuon?.noi_dung as { phong_cach_dung?: string } | null)?.phong_cach_dung ?? null,
        so_doan: k.doan.length,
        so_canh: (sl?.noi_dung as Shotlist | null)?.canh.length ?? 0,
      };
    }
  }

  return (
    <>
      <h1>Tạo video</h1>
      {tuDuAn ? (
        <div className="card status-line">
          🎬 Từ dự án <Link href={`/du-an/${tuDuAn.id}`}>{tuDuAn.ten}</Link> — máy dựng sẽ dựng theo kịch bản ({tuDuAn.so_doan} đoạn)
          {tuDuAn.so_canh ? ` + shotlist (${tuDuAn.so_canh} cảnh)` : ' (chưa có shotlist)'}, tự chọn lần quay tốt nhất cho từng đoạn, dàn ý tự duyệt.
        </div>
      ) : (
        duAnId && <p className="warn">Không đọc được kịch bản của dự án này — tạo như video thường.</p>
      )}
      <p className="muted">
        Chép footage vào 1 máy dựng bằng USB / thẻ nhớ trước (thư mục <code>Footage\YYYY-MM-DD_ten-san-pham</code>). Cảnh trám video nặng
        cũng chép kèm vào thư mục con <code>Canh tram</code> bên trong thư mục footage đó. Video sẽ <strong>tự giao cho máy đang chứa footage</strong>.
      </p>
      {!lc.may_dang_bat && <p className="warn">Không máy dựng nào đang bật: vẫn tạo được, việc sẽ chờ đến khi máy chứa footage bật.</p>}
      <TaoViecForm footage={lc.footage} phongCach={lc.phong_cach} daDung={[...daDung]} tuDuAn={tuDuAn} />
    </>
  );
}
