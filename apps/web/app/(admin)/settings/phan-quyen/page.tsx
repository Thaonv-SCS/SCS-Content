import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';
import { TheNguoi, type Nguoi } from './the-nguoi';

type Row = {
  user_id: string;
  email: string;
  ten: string | null;
  role: string | null;
  quyen: string[];
  video_quyen: string[];
  du_an_quyen: Record<string, string[]>;
  lan_cuoi: string | null;
};

/** Cài đặt → Phân quyền: mỗi người một thẻ, tick quyền theo module. Chỉ admin. */
export default async function PhanQuyenPage() {
  const me = await requireAdmin();
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('phan_quyen_ds');
  if (error) {
    return (
      <>
        <p><Link href="/settings">← Cài đặt</Link></p>
        <h1>Phân quyền</h1>
        <p className="warn">Chưa chạy migration 0027 (phân quyền) trên Supabase — chạy xong tải lại trang này.</p>
      </>
    );
  }
  const ds: Nguoi[] = ((data ?? []) as Row[]).map((r) => ({
    id: r.user_id,
    email: r.email,
    la_toi: r.user_id === me.id,
    chua_co_ho_so: !r.role,
    lan_cuoi: r.lan_cuoi,
    q: {
      ten: r.ten ?? '',
      admin: r.role === 'admin',
      quyen: r.quyen ?? [],
      video: r.video_quyen ?? [],
      duAn: r.du_an_quyen ?? {},
    },
  }));

  return (
    <>
      <p><Link href="/settings">← Cài đặt</Link></p>
      <h1>Phân quyền</h1>
      <div className="card meta">
        Mỗi người một thẻ: tick quyền rồi bấm <strong>Lưu quyền</strong>. Menu của người đó chỉ hiện mục được tick; database cũng chặn theo đúng các ô này.
        <br />
        <strong>Thêm người mới:</strong> tạo tài khoản ở Supabase → Authentication → Users → Add user (email + mật khẩu, tick Auto Confirm). Tải lại trang
        này là thấy người đó (chưa có quyền gì) — tick quyền là dùng được. <strong>Khóa người:</strong> bỏ hết các ô rồi Lưu. Quyền theo thư mục footage chỉnh
        ở Video editor → Máy worker.
      </div>
      {ds.map((n) => (
        <TheNguoi key={n.id} n={n} />
      ))}
    </>
  );
}
