'use client';

import { useActionState, useState } from 'react';
import { BUOC, MO_HINH, UOC_TINH, usd } from '@/lib/video';
import { taoViec } from '../actions';

export function TaoViecForm({ footage, phongCach, daDung }: {
  footage: string[]; phongCach: { ten: string; rieng: boolean }[]; daDung: string[];
}) {
  const [loi, action, pending] = useActionState(taoViec, null);
  const [chon, setChon] = useState<Record<string, string>>(Object.fromEntries(BUOC.map((b) => [b.ma, b.macDinh])));
  const uoc = (buoc: string) => UOC_TINH[buoc]?.[chon[buoc] ?? ''] ?? null;
  // "sửa" chỉ chạy khi có góp ý; không tính vào ước tính cơ bản
  const tong = BUOC.filter((b) => b.ma !== 'sua').reduce((t, b) => t + (uoc(b.ma) ?? 0), 0);
  const chuaThu = BUOC.some((b) => uoc(b.ma) == null);
  const goiYTen = (f: string) => f.replace(/^\d{4}-\d{2}-\d{2}_/, '').replace(/-/g, ' ');

  return (
    <form action={action} className="card settings wide">
      <label>
        <strong>Thư mục footage trên máy dựng</strong>
        <select name="footage" required defaultValue="" onChange={(e) => {
          const ten = (e.currentTarget.form?.elements.namedItem('ten') as HTMLInputElement | null);
          if (ten && !ten.value) ten.value = goiYTen(e.currentTarget.value);
        }}>
          <option value="" disabled>— chọn —</option>
          {footage.map((f) => <option key={f} value={f}>{f}{daDung.includes(f) ? ' (đã từng tạo video)' : ''}</option>)}
        </select>
        {!footage.length && <span className="warn">Máy dựng chưa báo thư mục footage nào (máy tắt hoặc chưa chép footage).</span>}
      </label>
      <label>
        <strong>Tên video</strong>
        <input name="ten" required placeholder="vd Tất chống trơn Kelme 160K" />
      </label>
      <label>
        <strong>Phong cách</strong>
        <select name="phong_cach" defaultValue={phongCach[0]?.ten ?? 'co-ban'}>
          {phongCach.map((p) => <option key={p.ten} value={p.ten}>{p.ten}{p.rieng ? ' (thử nghiệm, chỉ có trên máy này)' : ''}</option>)}
        </select>
      </label>
      <label>
        <strong>Hook gợi ý</strong>
        <span className="meta">Câu mở đầu hiện chữ to 3 giây đầu (bỏ trống thì bộ não tự đề xuất)</span>
        <input name="hook" placeholder="vd 160K cho 1 đôi tất chống trơn có gì?" />
      </label>

      <details>
        <summary><strong>Mô hình AI từng bước</strong> <span className="meta">— ước tính {usd(tong)}/video{chuaThu ? ' (có bước chưa thử, chưa tính)' : ''}</span></summary>
        <div className="scroll">
          <table>
            <thead><tr><th>Bước</th><th>Mô hình</th><th>Mức suy nghĩ</th><th>Ước tính</th></tr></thead>
            <tbody>
              {BUOC.map((b) => (
                <tr key={b.ma}>
                  <td>{b.ten}{b.ma === 'sua' && <div className="meta">chỉ chạy khi có góp ý</div>}</td>
                  <td>
                    <select name={`model_${b.ma}`} value={chon[b.ma]} onChange={(e) => setChon({ ...chon, [b.ma]: e.target.value })}>
                      {MO_HINH.map((m) => <option key={m.ma} value={m.ma}>{m.ten}{m.ma === b.macDinh ? ' — mặc định' : ''}</option>)}
                    </select>
                  </td>
                  <td>
                    <select name={`effort_${b.ma}`} defaultValue="medium">
                      <option value="low">thấp</option>
                      <option value="medium">vừa</option>
                      <option value="high">cao</option>
                    </select>
                  </td>
                  <td>{uoc(b.ma) == null ? <span className="warn">chưa thử</span> : usd(uoc(b.ma))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="meta">Ước tính đo trên video 2,5 phút ở mức suy nghĩ "vừa". Suy nghĩ "cao" đắt hơn khoảng 1,5–2 lần.</p>
      </details>

      <div className="inline">
        <button type="submit" disabled={pending}>{pending ? 'Đang tạo…' : 'Tạo video'}</button>
        {loi && <span className="warn">{loi}</span>}
      </div>
    </form>
  );
}
