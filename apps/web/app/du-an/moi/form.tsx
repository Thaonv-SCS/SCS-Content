'use client';

import { useActionState, useState } from 'react';
import { DS_MO_HINH, DS_SUY_NGHI, VIEC_AI, type CauHinhMoHinh } from '@app/core/src/mo-hinh.ts';
import { MUC_TIEU, NEN_TANG } from '@app/du-an/src/types.ts';
import { taoDuAn } from '../actions';

export function TaoDuAnForm({ khuon, macDinh }: { khuon: { ma: string; ten: string }[]; macDinh: Record<string, CauHinhMoHinh> }) {
  const [error, action, pending] = useActionState(taoDuAn, null);
  const [cheDo, setCheDo] = useState<'duyet' | 'nhanh'>('duyet');

  return (
    <form action={action} className="card settings wide">
      <label>
        <strong>Tên dự án *</strong>
        <input name="ten" required placeholder='vd "Chân bè có đi được Mercurial Vinicius không"' />
      </label>
      <label>
        <strong>Ý tưởng ban đầu *</strong>
        <span className="meta">Vài dòng là đủ: muốn nói gì, vì sao (khách hỏi nhiều, hàng mới về, trend…), có thể dán link tham khảo.</span>
        <textarea name="y_tuong" rows={5} required />
      </label>
      <div className="inline wrap">
        <label>
          <strong>Mục tiêu</strong>
          <select name="muc_tieu" defaultValue="ban-hang">
            {Object.entries(MUC_TIEU).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          <strong>Khuôn video</strong>
          <select name="khuon" defaultValue="">
            <option value="">Để AI chọn</option>
            {khuon.map((k) => (
              <option key={k.ma} value={k.ma}>{k.ten}</option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <strong>Nền tảng</strong>
        <div className="inline wrap">
          {NEN_TANG.map((n) => (
            <label key={n} className="switch-row">
              <input type="checkbox" name="nen_tang" value={n} defaultChecked={n === 'TikTok'} /> <span>{n}</span>
            </label>
          ))}
        </div>
      </div>
      <label>
        <strong>Sản phẩm liên quan</strong>
        <span className="meta">Dán link trang sản phẩm trên soccerstore.vn, mỗi dòng một link. App lấy đúng giá, size, còn hàng, mô tả từ web để AI không nói sai.</span>
        <textarea name="san_pham_links" rows={3} placeholder="https://soccerstore.vn/san-pham/..." />
      </label>
      <label>
        <strong>Ghi chú</strong>
        <span className="meta">Ai sẽ nói, quay ở đâu, điều bắt buộc có / không được nói…</span>
        <textarea name="ghi_chu" rows={3} />
      </label>

      <div>
        <strong>Cách làm</strong>
        <label className="switch-row">
          <input type="radio" name="che_do" value="duyet" checked={cheDo === 'duyet'} onChange={() => setCheDo('duyet')} />
          <span>Qua các bước duyệt <span className="meta">— dừng ở Ý tưởng, Kế hoạch, Kịch bản để mày duyệt / sửa</span></span>
        </label>
        <label className="switch-row">
          <input type="radio" name="che_do" value="nhanh" checked={cheDo === 'nhanh'} onChange={() => setCheDo('nhanh')} />
          <span>Làm nhanh <span className="meta">— tự chạy hết tới kịch bản + shotlist, AI tự chọn góc tốt nhất, không dừng duyệt (~4–6 phút)</span></span>
        </label>
      </div>

      <details>
        <summary>
          <strong>Mô hình AI từng bước</strong> <span className="meta">— mặc định theo Cài đặt → Mô hình AI; đổi ở đây chỉ áp cho dự án này</span>
        </summary>
        <div className="scroll">
          <table>
            <thead><tr><th>Bước</th><th>Mô hình</th><th>Mức suy nghĩ</th></tr></thead>
            <tbody>
              {Object.entries(macDinh).map(([b, c]) => (
                <tr key={b}>
                  <td>
                    {VIEC_AI.find((v) => v.ma === `du-an:${b}`)?.ten ?? b}
                    <input type="hidden" name={`macdinh_${b}`} value={`${c.model}|${c.effort}`} />
                  </td>
                  <td>
                    <select name={`model_${b}`} defaultValue={c.model}>
                      {DS_MO_HINH.map((m) => <option key={m.ma} value={m.ma}>{m.ten}</option>)}
                    </select>
                  </td>
                  <td>
                    <select name={`effort_${b}`} defaultValue={c.effort}>
                      {DS_SUY_NGHI.map((s) => <option key={s.ma} value={s.ma}>{s.ten}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="inline">
        <button type="submit" disabled={pending}>{pending ? 'Đang tạo…' : cheDo === 'nhanh' ? '⚡ Tạo & làm nhanh' : '✨ Tạo & phát triển ý tưởng'}</button>
        <span className="meta">Mỗi bước khoảng $0,1–0,4 tiền AI tùy mô hình</span>
        {error && <span className="warn">{error}</span>}
      </div>
    </form>
  );
}
