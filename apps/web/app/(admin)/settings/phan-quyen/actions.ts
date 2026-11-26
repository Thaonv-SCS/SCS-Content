'use server';

import { revalidatePath } from 'next/cache';
import { kiemAdmin } from '@/lib/auth';
import { BUOC_DU_AN, MA_QUYEN } from '@/lib/quyen';
import { supabaseServer } from '@/lib/supabase';

export type QuyenNguoi = {
  ten: string;
  admin: boolean;
  quyen: string[];
  video: string[];
  duAn: Record<string, string[]>;
};

/** Lưu quyền một người (database kiểm lại: chỉ admin, không tự bỏ admin của chính mình). */
export async function luuQuyen(userId: string, q: QuyenNguoi): Promise<string | null> {
  const loi = await kiemAdmin();
  if (loi) return loi;
  const duAn: Record<string, string[]> = {};
  for (const b of BUOC_DU_AN) {
    const ds = (q.duAn[b.ma] ?? []).filter((x) => x === 'lam' || (b.duyet && x === 'duyet'));
    if (ds.length) duAn[b.ma] = ds;
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('phan_quyen_luu', {
    p_user: userId,
    p_ten: q.ten,
    p_admin: q.admin,
    p_quyen: q.quyen.filter((x) => (MA_QUYEN as string[]).includes(x)),
    p_video: q.video.filter((x) => x === 'lam' || x === 'duyet'),
    p_du_an: duAn,
  });
  if (error) return /Không tự bỏ/.test(error.message) ? 'Không tự bỏ quyền admin của chính mình được.' : `Lỗi lưu: ${error.message}`;
  revalidatePath('/', 'layout');
  return null;
}
