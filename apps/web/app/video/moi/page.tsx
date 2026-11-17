import { requireVideo } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';
import type { Footage } from '@/lib/video';
import { TaoViecForm } from './form';

type LuaChon = { footage: Footage[]; phong_cach: { ten: string; rieng: boolean }[]; may_dang_bat: boolean; so_may?: number };

export default async function TaoVideoPage() {
  await requireVideo('lam');
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

  return (
    <>
      <h1>Tạo video</h1>
      <p className="muted">
        Chép footage vào 1 máy dựng bằng USB / thẻ nhớ trước (thư mục <code>Footage\YYYY-MM-DD_ten-san-pham</code>). Cảnh trám video nặng
        cũng chép kèm vào thư mục con <code>Canh tram</code> bên trong thư mục footage đó. Video sẽ <strong>tự giao cho máy đang chứa footage</strong>.
      </p>
      {!lc.may_dang_bat && <p className="warn">Không máy dựng nào đang bật: vẫn tạo được, việc sẽ chờ đến khi máy chứa footage bật.</p>}
      <TaoViecForm footage={lc.footage} phongCach={lc.phong_cach} daDung={[...daDung]} />
    </>
  );
}
