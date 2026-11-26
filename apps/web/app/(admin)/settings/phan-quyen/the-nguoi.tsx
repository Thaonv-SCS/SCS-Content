'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BUOC_DU_AN, NHOM_QUYEN } from '@/lib/quyen';
import { luuQuyen, type QuyenNguoi } from './actions';

export type Nguoi = {
  id: string;
  email: string;
  la_toi: boolean;
  chua_co_ho_so: boolean;
  lan_cuoi: string | null;
  q: QuyenNguoi;
};

const bat = (ds: string[], x: string, on: boolean) => (on ? [...new Set([...ds, x])] : ds.filter((y) => y !== x));

/** Thẻ phân quyền của một người: tick xong bấm Lưu. */
export function TheNguoi({ n }: { n: Nguoi }) {
  const router = useRouter();
  const [q, setQ] = useState<QuyenNguoi>(n.q);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const doi = JSON.stringify(q) !== JSON.stringify(n.q);
  const tat = q.admin; // admin có hết → khóa các ô khác cho đỡ rối

  const O = ({ on, set, nhan, goiY }: { on: boolean; set: (v: boolean) => void; nhan: string; goiY?: string }) => (
    <label className="switch-row" title={goiY}>
      <input type="checkbox" checked={tat || on} disabled={tat || pending} onChange={(e) => set(e.target.checked)} />
      <span>
        {nhan}
        {goiY && <span className="meta"> — {goiY}</span>}
      </span>
    </label>
  );

  return (
    <div className="card settings wide">
      <div className="inline wrap">
        <strong>{q.ten || n.email}</strong>
        <span className="meta">{n.email}</span>
        {n.la_toi && <span className="badge">mày</span>}
        {n.chua_co_ho_so && <span className="badge warn">tài khoản mới — chưa có quyền gì</span>}
        <span className="meta">{n.lan_cuoi ? `đăng nhập lần cuối ${new Date(n.lan_cuoi).toLocaleString('vi-VN')}` : 'chưa đăng nhập lần nào'}</span>
      </div>
      <div className="inline wrap">
        <label>
          Tên hiển thị <input value={q.ten} disabled={pending} onChange={(e) => setQ({ ...q, ten: e.target.value })} placeholder="vd Hùng (post)" />
        </label>
        <label className="switch-row">
          <input type="checkbox" checked={q.admin} disabled={pending || n.la_toi} onChange={(e) => setQ({ ...q, admin: e.target.checked })} />
          <span>
            <strong>Admin — toàn quyền</strong>
            <span className="meta"> (gồm Cài đặt, trần chi phí, phân quyền, máy dựng){n.la_toi ? ' · không tự bỏ được' : ''}</span>
          </span>
        </label>
      </div>

      <div className="phan-quyen-luoi">
        {NHOM_QUYEN.map((g) => (
          <div key={g.nhom}>
            <strong>{g.nhom}</strong>
            {g.muc.map((m) => (
              <O key={m.ma} on={q.quyen.includes(m.ma)} set={(v) => setQ({ ...q, quyen: bat(q.quyen, m.ma, v) })} nhan={m.ten} goiY={m.mo_ta || undefined} />
            ))}
          </div>
        ))}
        <div>
          <strong>Video editor</strong>
          <O on={q.video.includes('lam')} set={(v) => setQ({ ...q, video: bat(q.video, 'lam', v) })} nhan="Làm" goiY="tạo video, duyệt dàn ý, tải cảnh trám, duyệt thẻ" />
          <O on={q.video.includes('duyet')} set={(v) => setQ({ ...q, video: bat(q.video, 'duyet', v) })} nhan="Duyệt bản nháp" />
        </div>
        <div>
          <strong>Dự án video</strong>
          <table className="phan-quyen-bang">
            <thead><tr><th></th><th>Làm</th><th>Duyệt</th></tr></thead>
            <tbody>
              {BUOC_DU_AN.map((b) => {
                const ds = q.duAn[b.ma] ?? [];
                const dat = (loai: string, v: boolean) => setQ({ ...q, duAn: { ...q.duAn, [b.ma]: bat(ds, loai, v) } });
                return (
                  <tr key={b.ma}>
                    <td>{b.ten}</td>
                    <td><input type="checkbox" checked={tat || ds.includes('lam')} disabled={tat || pending} onChange={(e) => dat('lam', e.target.checked)} /></td>
                    <td>{b.duyet && <input type="checkbox" checked={tat || ds.includes('duyet')} disabled={tat || pending} onChange={(e) => dat('duyet', e.target.checked)} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="inline wrap">
        <button
          disabled={pending || !doi}
          onClick={() =>
            start(async () => {
              const err = await luuQuyen(n.id, q);
              setMsg(err ?? '✓ Đã lưu — người này đăng nhập lại / tải lại trang là thấy quyền mới');
              router.refresh();
            })
          }
        >
          {pending ? 'Đang lưu…' : 'Lưu quyền'}
        </button>
        {doi && !pending && (
          <button className="ghost" onClick={() => (setQ(n.q), setMsg(null))}>Bỏ thay đổi</button>
        )}
        {msg && <span className={msg.startsWith('✓') ? 'on' : 'warn'}>{msg}</span>}
      </div>
    </div>
  );
}
