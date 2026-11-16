import { requireVideo } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';
import { TaoViecForm } from './form';

type LuaChon = { footage: string[]; phong_cach: { ten: string; rieng: boolean }[]; may_dang_bat: boolean };

export default async function TaoVideoPage() {
  await requireVideo('lam');
  const supabase = await supabaseServer();
  const [{ data }, { data: daCo }] = await Promise.all([
    supabase.rpc('video_lua_chon'),
    supabase.from('video_jobs').select('footage'),
  ]);
  const lc = (data ?? { footage: [], phong_cach: [], may_dang_bat: false }) as LuaChon;
  const daDung = new Set((daCo ?? []).map((v) => v.footage as string));

  return (
    <>
      <h1>Tạo video</h1>
      <p className="muted">
        Chép footage vào máy dựng bằng USB / thẻ nhớ trước (thư mục <code>Footage\YYYY-MM-DD_ten-san-pham</code>). Cảnh trám video nặng
        cũng chép kèm vào thư mục con <code>Canh tram</code> bên trong thư mục footage đó.
      </p>
      {!lc.may_dang_bat && <p className="warn">Máy dựng đang tắt: vẫn tạo được, việc sẽ chờ đến khi máy bật.</p>}
      <TaoViecForm footage={lc.footage} phongCach={lc.phong_cach} daDung={[...daDung]} />
    </>
  );
}
