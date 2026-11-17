'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { currentUser, type VideoQuyen } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';
import { BUOC } from '@/lib/video';

// Mọi thao tác đều gọi hàm video_* trong database — hàm tự kiểm tra quyền (giao diện chỉ là lớp ngoài).

async function can(q: VideoQuyen | 'admin'): Promise<string | null> {
  const me = await currentUser();
  if (!me) return 'Chưa đăng nhập.';
  if (q === 'admin') return me.role === 'admin' ? null : 'Chỉ admin.';
  return me.videoQuyen.includes(q) ? null : 'Tài khoản chưa có quyền này.';
}

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

// ───────────── Người làm ─────────────
export async function taoViec(_: string | null, f: FormData): Promise<string | null> {
  const denied = await can('lam');
  if (denied) return denied;
  const ten = s(f, 'ten');
  const footage = s(f, 'footage');
  if (!ten || !footage) return 'Cần tên video và thư mục footage.';
  const mo_hinh: Record<string, { model: string; effort: string }> = {};
  for (const b of BUOC) {
    const model = s(f, `model_${b.ma}`);
    const effort = s(f, `effort_${b.ma}`) || 'medium';
    if (model && (model !== b.macDinh || effort !== 'medium')) mo_hinh[b.ma] = { model, effort };
  }
  const supabase = await supabaseServer();
  const { data, error } = await supabase.from('video_jobs')
    .insert({ ten, footage, phong_cach: s(f, 'phong_cach') || 'co-ban', hook_goi_y: s(f, 'hook') || null, mo_hinh })
    .select('id').single();
  if (error) return error.message;
  revalidatePath('/video');
  redirect(`/video/${data.id}`);
}

async function goiRpc(fn: string, args: Record<string, unknown>, path: string): Promise<string | null> {
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc(fn, args);
  if (error) return error.message;
  revalidatePath(path);
  return null;
}

export async function duyetDanY(_: string | null, f: FormData): Promise<string | null> {
  const denied = await can('lam');
  if (denied) return denied;
  const job = s(f, 'job');
  const fn = s(f, 'hanh_dong') === 'lam-lai' ? 'video_lam_lai_dan_y' : 'video_duyet_dan_y';
  return goiRpc(fn, { p_job: job, p_ghi_chu: s(f, 'ghi_chu') }, `/video/${job}`);
}

export async function xongCanhTram(_: string | null, f: FormData): Promise<string | null> {
  const denied = await can('lam');
  if (denied) return denied;
  const job = s(f, 'job');
  return goiRpc('video_xong_canh_tram', { p_job: job, p_ghi_chu: s(f, 'ghi_chu') }, `/video/${job}`);
}

export async function duyetThe(_: string | null, f: FormData): Promise<string | null> {
  const denied = await can('lam');
  if (denied) return denied;
  const job = s(f, 'job');
  return goiRpc('video_duyet_the', { p_job: job, p_ghi_chu: s(f, 'ghi_chu') }, `/video/${job}`);
}

/** Hủy video: không làm nữa (máy bỏ qua; admin mở lại được bằng "đặt lại bước"). */
export async function huyViec(_: string | null, f: FormData): Promise<string | null> {
  const denied = await can('lam');
  if (denied) return denied;
  const job = s(f, 'job');
  const loi = await goiRpc('video_huy', { p_job: job, p_ly_do: s(f, 'ly_do') }, `/video/${job}`);
  if (!loi) revalidatePath('/video');
  return loi;
}

// ───────────── Người duyệt ─────────────
export async function gopY(_: string | null, f: FormData): Promise<string | null> {
  const denied = await can('duyet');
  if (denied) return denied;
  const job = s(f, 'job');
  if (!s(f, 'gop_y')) return 'Ghi góp ý trước đã (vd "giây 40 đổi tiếng khác").';
  return goiRpc('video_gop_y', { p_job: job, p_gop_y: s(f, 'gop_y') }, `/video/${job}`);
}

export async function chot(_: string | null, f: FormData): Promise<string | null> {
  const denied = await can('duyet');
  if (denied) return denied;
  const job = s(f, 'job');
  const phut = Number(s(f, 'phut'));
  if (!Number.isFinite(phut) || phut < 0) return 'Nhập số phút người đã bỏ ra cho video này.';
  return goiRpc('video_chot', { p_job: job, p_phut: Math.round(phut), p_dung_duoc: s(f, 'dung_duoc') || 'co' }, `/video/${job}`);
}

// ───────────── Admin ─────────────
export async function themMay(_: { khoa?: string; loi?: string } | null, f: FormData): Promise<{ khoa?: string; loi?: string }> {
  const denied = await can('admin');
  if (denied) return { loi: denied };
  if (!s(f, 'ten')) return { loi: 'Đặt tên máy (vd "Máy công ty").' };
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('video_tao_may', { p_ten: s(f, 'ten') });
  if (error) return { loi: error.message };
  revalidatePath('/video/may');
  return { khoa: data as string };
}

export async function thaoTacMay(_: string | null, f: FormData): Promise<string | null> {
  const denied = await can('admin');
  if (denied) return denied;
  const may = s(f, 'may');
  switch (s(f, 'hanh_dong')) {
    case 'chon': return goiRpc('video_chon_may', { p_may: may }, '/video/may');
    case 'bo-nhan': return goiRpc('video_bo_nhan_viec', { p_may: may }, '/video/may');
    case 'tam-ngung': return goiRpc('video_tam_ngung_may', { p_may: may, p_tam_ngung: true }, '/video/may');
    case 'bat-lai': return goiRpc('video_tam_ngung_may', { p_may: may, p_tam_ngung: false }, '/video/may');
    case 'thu-hoi': return goiRpc('video_thu_hoi_may', { p_may: may }, '/video/may');
    default: return 'Thao tác không hợp lệ.';
  }
}

export async function datQuyen(_: string | null, f: FormData): Promise<string | null> {
  const denied = await can('admin');
  if (denied) return denied;
  const quyen = (['lam', 'duyet'] as const).filter((q) => f.get(q) === 'on');
  return goiRpc('video_dat_quyen', { p_user: s(f, 'user'), p_quyen: quyen }, '/video/may');
}

export async function datTrangThai(_: string | null, f: FormData): Promise<string | null> {
  const denied = await can('admin');
  if (denied) return denied;
  const job = s(f, 'job');
  return goiRpc('video_dat_trang_thai', { p_job: job, p_trang_thai: s(f, 'trang_thai'), p_ly_do: s(f, 'ly_do') || 'Admin chạy lại' }, `/video/${job}`);
}

/** Admin: chuyển 1 video sang máy khác (máy mới phải có footage đó; video làm lại từ dàn ý). */
export async function chuyenMay(_: string | null, f: FormData): Promise<string | null> {
  const denied = await can('admin');
  if (denied) return denied;
  const job = s(f, 'job');
  return goiRpc('video_chuyen_may', { p_job: job, p_may: s(f, 'may') }, `/video/${job}`);
}

/** Admin: quyền 1 thư mục footage — moi-nguoi / an (chỉ admin) / chi-cho (các tài khoản được tick). */
export async function datQuyenFootage(_: string | null, f: FormData): Promise<string | null> {
  const denied = await can('admin');
  if (denied) return denied;
  const nguoi = f.getAll('nguoi').map(String).filter(Boolean);
  const loi = await goiRpc('video_dat_quyen_footage',
    { p_footage: s(f, 'footage'), p_che_do: s(f, 'che_do'), p_nguoi: nguoi }, '/video/may');
  return loi ?? 'Đã lưu.';
}

export async function luuCaiDat(_: string | null, f: FormData): Promise<string | null> {
  const denied = await can('admin');
  if (denied) return denied;
  const supabase = await supabaseServer();
  const rows = [
    { key: 'video_tran_ngay_usd', value: Number(s(f, 'tran')) || 8 },
    { key: 'video_phien_ban_toi_thieu', value: Number(s(f, 'phien_ban')) || 0 },
    { key: 'video_giu_ban_xem_ngay', value: Number(s(f, 'giu_ngay')) || 14 },
  ].map((r) => ({ ...r, updated_at: new Date().toISOString() }));
  const { error } = await supabase.from('settings').upsert(rows);
  if (error) return error.message;
  revalidatePath('/video/may');
  return 'Đã lưu.';
}
