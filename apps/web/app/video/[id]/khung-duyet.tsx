'use client';

import { useActionState } from 'react';
import { chot, datTrangThai, duyetDanY, duyetThe, gopY, huyViec, xongCanhTram } from '../actions';

function KetQua({ loi, pending }: { loi: string | null; pending: boolean }) {
  if (pending) return <span className="meta">Đang gửi…</span>;
  return loi ? <span className="warn">{loi}</span> : null;
}

export function DuyetDanY({ job, coCauHoi }: { job: string; coCauHoi: boolean }) {
  const [loi, action, pending] = useActionState(duyetDanY, null);
  return (
    <form action={action} className="settings wide">
      <input type="hidden" name="job" value={job} />
      <label>
        <strong>Ý kiến duyệt{coCauHoi ? ' (trả lời các câu hỏi ở trên)' : ''}</strong>
        <span className="meta">vd: giữ đoạn 3b, bỏ 4b; cam kết bảo hành đúng; hook đổi thành "…"</span>
        <textarea name="ghi_chu" rows={4} />
      </label>
      <div className="actions">
        <button type="submit" name="hanh_dong" value="duyet" disabled={pending}>✓ Duyệt dàn ý</button>
        <button type="submit" name="hanh_dong" value="lam-lai" className="ghost" disabled={pending}>↻ Viết lại theo ý kiến</button>
        <KetQua loi={loi} pending={pending} />
      </div>
    </form>
  );
}

export function XongCanhTram({ job }: { job: string }) {
  const [loi, action, pending] = useActionState(xongCanhTram, null);
  return (
    <form action={action} className="settings wide">
      <input type="hidden" name="job" value={job} />
      <label>
        <strong>Ghi chú về cảnh trám (không bắt buộc)</strong>
        <span className="meta">vd: ảnh da-bong-troi-mua dùng ở đoạn đá trời mưa</span>
        <textarea name="ghi_chu" rows={2} />
      </label>
      <div className="actions">
        <button type="submit" disabled={pending}>✓ Xong cảnh trám — cho máy làm thẻ</button>
        <KetQua loi={loi} pending={pending} />
      </div>
    </form>
  );
}

export function DuyetThe({ job }: { job: string }) {
  const [loi, action, pending] = useActionState(duyetThe, null);
  return (
    <form action={action} className="settings wide">
      <input type="hidden" name="job" value={job} />
      <label>
        <strong>Sửa thẻ nào? (để trống = ok hết)</strong>
        <span className="meta">vd: bỏ số 3; số 2 đổi chữ thành "…"</span>
        <textarea name="ghi_chu" rows={2} />
      </label>
      <div className="actions">
        <button type="submit" disabled={pending}>✓ Duyệt thẻ — cho máy dựng</button>
        <KetQua loi={loi} pending={pending} />
      </div>
    </form>
  );
}

export function GopYChot({ job }: { job: string }) {
  const [loiGopY, actGopY, dangGopY] = useActionState(gopY, null);
  const [loiChot, actChot, dangChot] = useActionState(chot, null);
  return (
    <div className="settings wide">
      <form action={actGopY} className="settings wide">
        <input type="hidden" name="job" value={job} />
        <label>
          <strong>Góp ý sửa</strong>
          <span className="meta">Ghi theo giây cho dễ: "giây 40 đổi tiếng khác", "bỏ sticker giây 72", "nhạc to hơn"</span>
          <textarea name="gop_y" rows={3} />
        </label>
        <div className="actions">
          <button type="submit" className="ghost" disabled={dangGopY}>↻ Gửi góp ý cho máy sửa</button>
          <KetQua loi={loiGopY} pending={dangGopY} />
        </div>
      </form>
      <form action={actChot} className="settings wide card">
        <input type="hidden" name="job" value={job} />
        <strong>Chốt bản cuối</strong>
        <label>
          <span>Tổng số phút người đã bỏ ra cho video này</span>
          <span className="meta">Tính cả xem, duyệt, chuẩn bị cảnh trám, chỉnh CapCut. Không tính lúc máy tự chạy.</span>
          <input type="number" name="phut" min={0} required />
        </label>
        <label>
          <span>Bản nháp dùng được không?</span>
          <select name="dung_duoc" defaultValue="co">
            <option value="co">Dùng được, chỉnh nhẹ</option>
            <option value="sua-nhieu">Phải sửa nhiều</option>
            <option value="khong">Không dùng được</option>
          </select>
        </label>
        <div className="actions">
          <button type="submit" disabled={dangChot}>✓ Chốt</button>
          <KetQua loi={loiChot} pending={dangChot} />
        </div>
      </form>
    </div>
  );
}

/** Hủy video: không làm nữa. Hỏi lại trước khi hủy. */
export function HuyViec({ job }: { job: string }) {
  const [loi, action, pending] = useActionState(huyViec, null);
  return (
    <form action={action} className="inline wrap"
      onSubmit={(e) => { if (!confirm('Hủy video này? Máy sẽ không làm tiếp nữa (admin mở lại được).')) e.preventDefault(); }}>
      <input type="hidden" name="job" value={job} />
      <input name="ly_do" placeholder="lý do hủy (không bắt buộc)" style={{ width: 240, marginTop: 0 }} />
      <button type="submit" className="ghost danger" disabled={pending}>✕ Hủy video</button>
      <KetQua loi={loi} pending={pending} />
    </form>
  );
}

const CHAY_LAI = [
  { tt: 'dang-chuan-bi', ten: 'Làm lại từ dàn ý' },
  { tt: 'canh-tram-xong', ten: 'Làm lại thẻ đồ họa' },
  { tt: 'dang-dung', ten: 'Dựng lại (kế hoạch + dựng)' },
  { tt: 'gop-y', ten: 'Chạy lại bước sửa theo góp ý' },
  { tt: 'cho-xem-nhap', ten: 'Đưa về chờ xem nháp' },
  { tt: 'cho-duyet-dan-y', ten: 'Mở lại (đưa về chờ duyệt dàn ý)' },
];

export function AdminChayLai({ job }: { job: string }) {
  const [loi, action, pending] = useActionState(datTrangThai, null);
  return (
    <form action={action} className="inline wrap">
      <input type="hidden" name="job" value={job} />
      <select name="trang_thai" defaultValue="dang-dung" style={{ width: 'auto' }}>
        {CHAY_LAI.map((c) => <option key={c.tt} value={c.tt}>{c.ten}</option>)}
      </select>
      <input name="ly_do" placeholder="lý do (không bắt buộc)" style={{ width: 220, marginTop: 0 }} />
      <button type="submit" className="ghost" disabled={pending}>Đặt lại</button>
      <KetQua loi={loi} pending={pending} />
    </form>
  );
}
