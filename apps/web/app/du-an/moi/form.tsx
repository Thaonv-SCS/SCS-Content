'use client';

import { useActionState, useState } from 'react';
import { MUC_TIEU, NEN_TANG } from '@app/du-an/src/types.ts';
import { taoDuAn } from '../actions';

export function TaoDuAnForm({ khuon }: { khuon: { ma: string; ten: string }[] }) {
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

      <div className="inline">
        <button type="submit" disabled={pending}>{pending ? 'Đang tạo…' : cheDo === 'nhanh' ? '⚡ Tạo & làm nhanh' : '✨ Tạo & phát triển ý tưởng'}</button>
        <span className="meta">Mỗi bước khoảng $0,2–0,4 tiền AI</span>
        {error && <span className="warn">{error}</span>}
      </div>
    </form>
  );
}
