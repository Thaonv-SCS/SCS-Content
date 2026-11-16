'use client';

import { useActionState } from 'react';
import { datQuyen, luuCaiDat, thaoTacMay, themMay } from '../actions';

export function ThemMay() {
  const [kq, action, pending] = useActionState(themMay, null);
  return (
    <form action={action} className="card settings wide">
      <strong>Thêm máy worker</strong>
      <div className="inline">
        <input name="ten" placeholder="Tên máy, vd Máy công ty" style={{ marginTop: 0 }} />
        <button type="submit" disabled={pending}>{pending ? 'Đang tạo…' : 'Tạo chìa khóa'}</button>
      </div>
      {kq?.loi && <span className="warn">{kq.loi}</span>}
      {kq?.khoa && (
        <div className="verify">
          <strong>Chìa khóa máy — CHỈ HIỆN 1 LẦN, copy ngay:</strong>
          <pre className="run-log" style={{ userSelect: 'all' }}>WORKER_KEY={kq.khoa}</pre>
          <span className="meta">
            Dán dòng trên vào file <code>.env</code> của máy đó (kèm dòng VIDEO_API_URL), rồi chạy <code>python cong-cu/worker.py</code>.
            Không gửi chìa khóa qua chat / Zalo. Xem HUONG-DAN-CAI-DAT.md mục 10.
          </span>
        </div>
      )}
    </form>
  );
}

export function NutMay({ may, hanhDong, nhan, hoi, ghost = true }: {
  may: string; hanhDong: string; nhan: string; hoi?: string; ghost?: boolean;
}) {
  const [loi, action, pending] = useActionState(thaoTacMay, null);
  return (
    <form action={action} onSubmit={(e) => { if (hoi && !confirm(hoi)) e.preventDefault(); }} className="inline">
      <input type="hidden" name="may" value={may} />
      <input type="hidden" name="hanh_dong" value={hanhDong} />
      <button type="submit" className={ghost ? 'ghost small' : 'small'} disabled={pending}>{nhan}</button>
      {loi && <span className="warn">{loi}</span>}
    </form>
  );
}

export function QuyenNguoi({ user, quyen }: { user: string; quyen: string[] }) {
  const [loi, action, pending] = useActionState(datQuyen, null);
  return (
    <form action={action} className="inline wrap">
      <input type="hidden" name="user" value={user} />
      <label className="inline"><input type="checkbox" name="lam" defaultChecked={quyen.includes('lam')} style={{ width: 'auto' }} /> người làm</label>
      <label className="inline"><input type="checkbox" name="duyet" defaultChecked={quyen.includes('duyet')} style={{ width: 'auto' }} /> người duyệt</label>
      <button type="submit" className="ghost small" disabled={pending}>Lưu</button>
      {loi && <span className="warn">{loi}</span>}
    </form>
  );
}

export function CaiDat({ tran, phienBan, giuNgay }: { tran: number; phienBan: number; giuNgay: number }) {
  const [msg, action, pending] = useActionState(luuCaiDat, null);
  return (
    <form action={action} className="card settings wide">
      <strong>Cài đặt module Video</strong>
      <label>Trần chi phí AI cho video mỗi ngày ($) <span className="meta">hết trần thì máy chờ sang ngày (~1,5$/video)</span>
        <input type="number" name="tran" step="0.5" min={0} defaultValue={tran} style={{ width: 100 }} /></label>
      <label>Phiên bản code tối thiểu <span className="meta">máy chạy code cũ hơn số này sẽ không được giao việc</span>
        <input type="number" name="phien_ban" min={0} defaultValue={phienBan} style={{ width: 100 }} /></label>
      <label>Giữ bản xem thử trên mạng (ngày)
        <input type="number" name="giu_ngay" min={1} defaultValue={giuNgay} style={{ width: 100 }} /></label>
      <div className="inline">
        <button type="submit" disabled={pending}>Lưu</button>
        {msg && <span className={msg === 'Đã lưu.' ? 'on' : 'warn'}>{msg}</span>}
      </div>
    </form>
  );
}
