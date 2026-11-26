import type { SupabaseClient } from '@supabase/supabase-js';
import { DS_MO_HINH, DS_SUY_NGHI, HAIKU, moHinhCho, OPUS, PRICES, SONNET, tenMoHinh, VIEC_AI } from '@app/core';
import { luuMoHinh } from './actions';

/** Giá tương đối theo bảng giá (đầu vào), để ước giá mô hình chưa từng dùng cho việc đó. */
const heSo = (m: string) => PRICES[m]?.in ?? 1;

/** Cài đặt → Mô hình AI: chọn mô hình + mức suy nghĩ cho từng việc, kèm giá trung bình thật 60 ngày qua. */
export async function MoHinhAI({ supabase, caiDat }: { supabase: SupabaseClient; caiDat: unknown }) {
  const tu = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const { data } = await supabase
    .from('llm_calls')
    .select('purpose,model,cost_usd')
    .in('purpose', VIEC_AI.flatMap((v) => v.purposes))
    .gte('created_at', tu)
    .limit(20000);
  // giá trung bình mỗi lần theo (việc, mô hình)
  const tong = new Map<string, { n: number; usd: number }>();
  for (const r of data ?? []) {
    const k = `${r.purpose}|${r.model}`;
    const t = tong.get(k) ?? { n: 0, usd: 0 };
    t.n++;
    t.usd += Number(r.cost_usd);
    tong.set(k, t);
  }
  const giaCua = (purposes: string[], model: string) => {
    let n = 0;
    let tien = 0;
    for (const p of purposes) {
      const t = tong.get(`${p}|${model}`);
      n += t?.n ?? 0;
      tien += t?.usd ?? 0;
    }
    return n ? { tb: tien / n, n } : null;
  };
  /** Giá thật nếu đã dùng; chưa dùng thì ước theo tỉ lệ giá từ mô hình đã dùng. */
  const uoc = (purposes: string[], model: string): { tb: number; n: number; uoc: boolean } | null => {
    const that = giaCua(purposes, model);
    if (that) return { ...that, uoc: false };
    for (const m of [OPUS, SONNET, HAIKU]) {
      const g = giaCua(purposes, m);
      if (g) return { tb: (g.tb * heSo(model)) / heSo(m), n: 0, uoc: true };
    }
    return null;
  };
  const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`);
  const nhom = [...new Set(VIEC_AI.map((v) => v.nhom))];

  return (
    <form action={luuMoHinh} className="card settings wide">
      <p className="meta" style={{ margin: 0 }}>
        Giá ở cột phải là <strong>trung bình thật mỗi lần gọi</strong> trong 60 ngày qua (ghi “ước” khi chưa dùng mô hình đó cho việc này — ước theo bảng
        giá). Mức suy nghĩ “cao” tốn hơn “vừa” khoảng 1,5–2 lần. Dự án video chọn riêng được từng dự án khi tạo. Video editor chọn mô hình riêng ở mỗi video.
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr><th>Việc</th><th>Mô hình</th><th>Mức suy nghĩ</th><th>Giá mỗi lần</th></tr>
          </thead>
          <tbody>
            {nhom.flatMap((g) => [
              <tr key={g}><td colSpan={4}><strong>{g}</strong></td></tr>,
              ...VIEC_AI.filter((v) => v.nhom === g).map((v) => {
                const c = moHinhCho(v.ma, caiDat);
                const gia = uoc(v.purposes, c.model);
                return (
                  <tr key={v.ma}>
                    <td>
                      {v.ten}
                      <div className="meta">mặc định: {tenMoHinh(v.macDinh.model)}, {DS_SUY_NGHI.find((s) => s.ma === v.macDinh.effort)?.ten}</div>
                    </td>
                    <td>
                      <select name={`model_${v.ma}`} defaultValue={c.model}>
                        {DS_MO_HINH.map((m) => <option key={m.ma} value={m.ma}>{m.ten}</option>)}
                      </select>
                    </td>
                    <td>
                      <select name={`effort_${v.ma}`} defaultValue={c.effort}>
                        {DS_SUY_NGHI.map((s) => <option key={s.ma} value={s.ma}>{s.ten}</option>)}
                      </select>
                    </td>
                    <td className="meta">
                      {gia ? (gia.uoc ? `≈ ${usd(gia.tb)} (ước)` : `${usd(gia.tb)} · ${gia.n} lần`) : 'chưa có số liệu'}
                      {DS_MO_HINH.filter((m) => m.ma !== c.model)
                        .map((m) => ({ m, g: giaCua(v.purposes, m.ma) }))
                        .filter((x) => x.g)
                        .map((x) => <div key={x.m.ma}>{tenMoHinh(x.m.ma)}: {usd(x.g!.tb)} · {x.g!.n} lần</div>)}
                    </td>
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      </div>
      <div>
        <button type="submit">Lưu mô hình</button>
      </div>
    </form>
  );
}
