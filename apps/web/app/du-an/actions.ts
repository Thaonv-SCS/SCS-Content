'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  buocSau,
  CAU_HOI_THUONG_HIEU,
  chuThanhNhip,
  khuonTrong,
  runDuAnJob,
  taoMaKhuon,
  tenBuoc,
  userClient,
  type Brief,
  type Buoc,
  type DuAnJob,
  type KichBan,
  type NoiDungKhanGia,
  type NoiDungKhuon,
  type VideoMau,
} from '@app/du-an';
import { currentUser } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';

/** Kho tri thức: chỉ admin sửa (database cũng chặn bằng RLS). */
async function chiAdmin(): Promise<string | null> {
  const me = await currentUser();
  return me?.role === 'admin' ? null : 'Chỉ admin được sửa kho tri thức.';
}

/**
 * Giao việc chạy nền (giống Post sản phẩm): trên Netlify gọi Background Function (tối đa 15 phút),
 * trên máy chạy luôn trong tiến trình dev. Hàm nền dùng access token của chính người bấm.
 */
async function giaoViec(job: DuAnJob): Promise<string | null> {
  const supabase = await supabaseServer();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return 'Phiên đăng nhập hết hạn, đăng nhập lại.';
  if (process.env.NETLIFY) {
    const h = await headers();
    const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
    const res = await fetch(`${origin}/.netlify/functions/du-an-job-background`, {
      method: 'POST',
      body: JSON.stringify({ job, token: session.access_token }),
    });
    if (!res.ok && res.status !== 202) return `Không khởi động được việc chạy nền (HTTP ${res.status}).`;
  } else {
    void runDuAnJob(userClient(session.access_token), job);
  }
  return null;
}

// ───────────── Thương hiệu ─────────────

export async function luuThuongHieu(_prev: string | null, form: FormData): Promise<string | null> {
  const loi = await chiAdmin();
  if (loi) return loi;
  const tra_loi = Object.fromEntries(CAU_HOI_THUONG_HIEU.map((c) => [c.ma, String(form.get(c.ma) ?? '').trim()]));
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from('du_an_kien_thuc')
    .update({ noi_dung: { tra_loi }, cap_nhat_luc: new Date().toISOString() })
    .eq('muc', 'thuong-hieu');
  if (error) return `Lỗi lưu: ${error.message}`;
  revalidatePath('/du-an', 'layout');
  return '✓ Đã lưu';
}

// ───────────── Dữ liệu khán giả ─────────────

const TOI_DA_KY_TU = 3_000_000;

export async function themDuLieu(input: {
  nguon: string;
  loai: string;
  ten: string;
  noi_dung: string;
  tu_ngay?: string;
  den_ngay?: string;
}): Promise<string | null> {
  const loi = await chiAdmin();
  if (loi) return loi;
  const noi_dung = input.noi_dung.trim();
  if (!input.ten.trim()) return 'Đặt tên cho dữ liệu (vd "Bình luận TikTok tháng 10").';
  if (!noi_dung) return 'Chưa có nội dung — dán chữ hoặc chọn file.';
  if (noi_dung.length > TOI_DA_KY_TU) return `Dữ liệu quá dài (${noi_dung.length.toLocaleString('vi-VN')} ký tự) — chia nhỏ, mỗi lần tối đa 3 triệu ký tự.`;
  const supabase = await supabaseServer();
  const { error } = await supabase.from('du_an_khan_gia_du_lieu').insert({
    nguon: input.nguon,
    loai: input.loai,
    ten: input.ten.trim(),
    noi_dung,
    tu_ngay: input.tu_ngay || null,
    den_ngay: input.den_ngay || null,
  });
  if (error) return `Lỗi lưu: ${error.message}`;
  revalidatePath('/du-an', 'layout');
  return null;
}

export async function xoaDuLieu(id: string): Promise<string | null> {
  const loi = await chiAdmin();
  if (loi) return loi;
  const supabase = await supabaseServer();
  const { error } = await supabase.from('du_an_khan_gia_du_lieu').delete().eq('id', id);
  if (error) return `Lỗi xóa: ${error.message}`;
  revalidatePath('/du-an', 'layout');
  return null;
}

export async function tomTatInsight(): Promise<string | null> {
  const loi = await chiAdmin();
  if (loi) return loi;
  const supabase = await supabaseServer();
  const { data } = await supabase.from('du_an_kien_thuc').select('job_status,job_started_at').eq('muc', 'khan-gia').single();
  const dangChay =
    data && ['queued', 'running'].includes(data.job_status) && data.job_started_at && Date.now() - new Date(data.job_started_at).getTime() < 15 * 60_000;
  if (dangChay) return 'Đang tóm tắt rồi, đợi xong đã.';
  await supabase
    .from('du_an_kien_thuc')
    .update({ job_status: 'queued', job_error: null, job_started_at: new Date().toISOString() })
    .eq('muc', 'khan-gia');
  const err = await giaoViec({ kind: 'khan-gia' });
  if (err) await supabase.from('du_an_kien_thuc').update({ job_status: 'failed', job_error: err }).eq('muc', 'khan-gia');
  revalidatePath('/du-an', 'layout');
  return err;
}

/** Lưu bản insight đã duyệt (sửa tay hoặc lấy nguyên bản AI). Các bước sau chỉ đọc bản này. */
export async function duyetInsight(_prev: string | null, form: FormData): Promise<string | null> {
  const loi = await chiAdmin();
  if (loi) return loi;
  const ban = String(form.get('da_duyet') ?? '').trim();
  if (!ban) return 'Bản duyệt đang trống.';
  const supabase = await supabaseServer();
  const { data: cu } = await supabase.from('du_an_kien_thuc').select('noi_dung').eq('muc', 'khan-gia').single();
  const noi_dung: NoiDungKhanGia = { ...((cu?.noi_dung as NoiDungKhanGia | null) ?? {}), da_duyet: ban, da_duyet_luc: new Date().toISOString() };
  const { error } = await supabase.from('du_an_kien_thuc').update({ noi_dung, cap_nhat_luc: new Date().toISOString() }).eq('muc', 'khan-gia');
  if (error) return `Lỗi lưu: ${error.message}`;
  revalidatePath('/du-an', 'layout');
  return '✓ Đã duyệt — các bước dự án sẽ dùng bản này';
}

// ───────────── Khuôn video ─────────────

const dongs = (v: FormDataEntryValue | null) =>
  String(v ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

export async function luuKhuon(ma: string, _prev: string | null, form: FormData): Promise<string | null> {
  const loi = await chiAdmin();
  if (loi) return loi;
  const supabase = await supabaseServer();
  const { data: cu } = await supabase.from('du_an_khuon').select('noi_dung').eq('ma', ma).single();
  if (!cu) return 'Không tìm thấy khuôn.';
  const s = (k: string) => String(form.get(k) ?? '').trim();
  const noi_dung: NoiDungKhuon = {
    ...(cu.noi_dung as NoiDungKhuon),
    muc_tieu: s('muc_tieu'),
    khi_nao_dung: s('khi_nao_dung'),
    do_dai: s('do_dai'),
    nguoi_noi: s('nguoi_noi'),
    nhip: chuThanhNhip(s('nhip')),
    hook_mau: dongs(form.get('hook_mau')),
    nen_tranh: dongs(form.get('nen_tranh')),
    phong_cach_dung: s('phong_cach_dung') || 'co-ban',
    ghi_chu: s('ghi_chu'),
  };
  const ten = s('ten');
  const thuTu = Number(s('thu_tu'));
  const { error } = await supabase
    .from('du_an_khuon')
    .update({
      noi_dung,
      ...(ten ? { ten } : {}),
      ...(Number.isFinite(thuTu) && s('thu_tu') ? { thu_tu: Math.round(thuTu) } : {}),
      cap_nhat_luc: new Date().toISOString(),
    })
    .eq('ma', ma);
  if (error) return `Lỗi lưu: ${error.message}`;
  revalidatePath('/du-an', 'layout');
  return '✓ Đã lưu';
}

/** Thêm khuôn mới: trống hoặc chép từ một khuôn có sẵn (bỏ video mẫu). Xong chuyển sang trang sửa. */
export async function taoKhuon(_prev: string | null, form: FormData): Promise<string | null> {
  const loi = await chiAdmin();
  if (loi) return loi;
  const ten = String(form.get('ten') ?? '').trim();
  if (!ten) return 'Nhập tên khuôn.';
  const tu = String(form.get('tu') ?? '');
  const supabase = await supabaseServer();
  const { data: ds } = await supabase.from('du_an_khuon').select('ma,thu_tu,noi_dung');
  const co = new Set((ds ?? []).map((k) => k.ma as string));
  const goc = taoMaKhuon(ten);
  let ma = goc;
  for (let i = 2; co.has(ma); i++) ma = `${goc}-${i}`;
  const mau = (ds ?? []).find((k) => k.ma === tu);
  const noi_dung: NoiDungKhuon = mau ? { ...(mau.noi_dung as NoiDungKhuon), trang_thai: 'nhap', ghi_chu: '' } : khuonTrong();
  const thu_tu = Math.max(0, ...(ds ?? []).map((k) => Number(k.thu_tu) || 0)) + 1;
  const { error } = await supabase.from('du_an_khuon').insert({ ma, ten, thu_tu, noi_dung, video_mau: [] });
  if (error) return `Lỗi tạo: ${error.message}`;
  revalidatePath('/du-an', 'layout');
  redirect(`/du-an/kho/khuon/${ma}`);
}

/** Xóa khuôn. Dự án cũ vẫn giữ nguyên kịch bản, chỉ hiện mã khuôn thay cho tên. */
export async function xoaKhuon(ma: string): Promise<string | null> {
  const loi = await chiAdmin();
  if (loi) return loi;
  const supabase = await supabaseServer();
  const { count } = await supabase.from('du_an_khuon').select('ma', { count: 'exact', head: true });
  if ((count ?? 0) <= 1) return 'Phải còn ít nhất 1 khuôn.';
  const { error } = await supabase.from('du_an_khuon').delete().eq('ma', ma);
  if (error) return `Lỗi xóa: ${error.message}`;
  revalidatePath('/du-an', 'layout');
  redirect('/du-an/kho/khuon');
}

export async function themVideoMau(ma: string, _prev: string | null, form: FormData): Promise<string | null> {
  const loi = await chiAdmin();
  if (loi) return loi;
  const link = String(form.get('link') ?? '').trim();
  if (!/^https?:\/\//i.test(link)) return 'Dán link video (bắt đầu bằng http).';
  const supabase = await supabaseServer();
  const { data: cu } = await supabase.from('du_an_khuon').select('video_mau').eq('ma', ma).single();
  const ds = ((cu?.video_mau as VideoMau[] | null) ?? []).concat({
    link,
    ghi_chu: String(form.get('ghi_chu') ?? '').trim(),
    them_luc: new Date().toISOString(),
  });
  const { error } = await supabase.from('du_an_khuon').update({ video_mau: ds, cap_nhat_luc: new Date().toISOString() }).eq('ma', ma);
  if (error) return `Lỗi lưu: ${error.message}`;
  revalidatePath('/du-an', 'layout');
  return null;
}

export async function xoaVideoMau(ma: string, link: string): Promise<void> {
  if (await chiAdmin()) return;
  const supabase = await supabaseServer();
  const { data: cu } = await supabase.from('du_an_khuon').select('video_mau').eq('ma', ma).single();
  const ds = ((cu?.video_mau as VideoMau[] | null) ?? []).filter((v) => v.link !== link);
  await supabase.from('du_an_khuon').update({ video_mau: ds }).eq('ma', ma);
  revalidatePath('/du-an', 'layout');
}

// ───────────── Cài đặt ─────────────

export async function luuTran(_prev: string | null, form: FormData): Promise<string | null> {
  const loi = await chiAdmin();
  if (loi) return loi;
  const tran = Number(String(form.get('tran') ?? '').replace(',', '.'));
  if (!(tran >= 0 && tran <= 50)) return 'Trần từ 0 đến 50 $/ngày.';
  const supabase = await supabaseServer();
  const { error } = await supabase.from('settings').upsert({ key: 'du_an_tran_ngay_usd', value: tran });
  if (error) return `Lỗi lưu: ${error.message}`;
  revalidatePath('/du-an', 'layout');
  return `✓ Trần mới: $${tran}/ngày`;
}

// ───────────── Dự án ─────────────

type Loai = 'lam' | 'duyet';
async function coQuyen(buoc: Buoc, loai: Loai): Promise<string | null> {
  const me = await currentUser();
  if (!me) return 'Phiên đăng nhập hết hạn.';
  if (me.role === 'admin' || me.duAnQuyen[buoc]?.includes(loai)) return null;
  return `Tài khoản này không có quyền ${loai === 'lam' ? 'làm' : 'duyệt'} bước "${tenBuoc(buoc)}".`;
}

const DANG_CHAY_TOI_DA = 15 * 60_000;
async function dangChay(id: string): Promise<boolean> {
  const supabase = await supabaseServer();
  const { data } = await supabase.from('du_an').select('trang_thai,job_started_at').eq('id', id).single();
  return !!data && data.trang_thai === 'dang-lam' && !!data.job_started_at && Date.now() - new Date(data.job_started_at).getTime() < DANG_CHAY_TOI_DA;
}

/** Giao việc + ghi trạng thái ngay (để trang hiện "AI đang làm" liền, không đợi hàm nền khởi động). */
async function chayBuoc(id: string, job: DuAnJob, thongBao: string): Promise<string | null> {
  const supabase = await supabaseServer();
  await supabase
    .from('du_an')
    .update({ trang_thai: 'dang-lam', thong_bao: thongBao, job_started_at: new Date().toISOString(), cap_nhat_luc: new Date().toISOString(), ...(job.kind === 'buoc' ? { buoc: job.buoc } : {}) })
    .eq('id', id);
  const err = await giaoViec(job);
  if (err) await supabase.from('du_an').update({ trang_thai: 'loi', thong_bao: err }).eq('id', id);
  revalidatePath(`/du-an/${id}`);
  return err;
}

export async function taoDuAn(_prev: string | null, form: FormData): Promise<string | null> {
  const loi = await coQuyen('y-tuong', 'lam');
  if (loi) return loi;
  const s = (k: string) => String(form.get(k) ?? '').trim();
  const ten = s('ten');
  const y_tuong = s('y_tuong');
  if (!ten || !y_tuong) return 'Cần tên dự án và ý tưởng ban đầu.';
  const brief: Brief = {
    y_tuong,
    muc_tieu: s('muc_tieu'),
    san_pham_links: s('san_pham_links').split(/\s+/).filter((l) => /^https?:\/\//i.test(l)),
    nen_tang: form.getAll('nen_tang').map(String),
    khuon: s('khuon'),
    ghi_chu: s('ghi_chu'),
  };
  const che_do = s('che_do') === 'nhanh' ? 'nhanh' : 'duyet';
  // Tự sinh id, không đọc lại sau khi thêm (tránh kiểu lỗi quyền xem dòng vừa thêm từng gặp ở Video editor)
  const id = crypto.randomUUID();
  const supabase = await supabaseServer();
  const { error } = await supabase.from('du_an').insert({ id, ten, brief, che_do });
  if (error) return `Lỗi tạo dự án: ${error.message}`;
  const err = await chayBuoc(id, { kind: 'buoc', id, buoc: 'y-tuong' }, 'AI đang làm: Phát triển ý tưởng…');
  if (err) return err;
  redirect(`/du-an/${id}`);
}

/** Duyệt bước đang chờ → chạy bước sau (kịch bản thì chốt xong). */
export async function duyetBuoc(id: string, buoc: Buoc, _prev: string | null, form: FormData): Promise<string | null> {
  const loi = await coQuyen(buoc, 'duyet');
  if (loi) return loi;
  if (await dangChay(id)) return 'AI đang làm, đợi xong đã.';
  const supabase = await supabaseServer();
  const { data: pb } = await supabase
    .from('du_an_phien_ban')
    .select('id')
    .eq('du_an_id', id)
    .eq('buoc', buoc)
    .order('tao_luc', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pb) return 'Bước này chưa có bản nào để duyệt.';
  const me = await currentUser();
  const ghi_chu = String(form.get('ghi_chu') ?? '').trim();
  const duyet: Record<string, unknown> = { ghi_chu };
  if (buoc === 'y-tuong') {
    const gocRieng = String(form.get('goc_rieng') ?? '').trim();
    if (gocRieng) duyet.goc_rieng = gocRieng;
    else duyet.goc = Number(form.get('goc')) || 1;
  }
  await supabase.from('du_an_phien_ban').update({ duyet, duyet_boi: me?.id ?? null, duyet_luc: new Date().toISOString() }).eq('id', pb.id);
  const sau = buocSau(buoc);
  if (!sau) {
    await supabase.from('du_an').update({ trang_thai: 'xong', thong_bao: 'Kịch bản đã chốt', cap_nhat_luc: new Date().toISOString() }).eq('id', id);
    revalidatePath(`/du-an/${id}`);
    return null;
  }
  const loiSau = await coQuyen(sau, 'lam');
  if (loiSau) {
    await supabase.from('du_an').update({ buoc: sau, trang_thai: 'cho-duyet', thong_bao: `Đã duyệt — chờ người có quyền làm "${tenBuoc(sau)}"` }).eq('id', id);
    revalidatePath(`/du-an/${id}`);
    return null;
  }
  return chayBuoc(id, { kind: 'buoc', id, buoc: sau }, `AI đang làm: ${tenBuoc(sau)}…`);
}

/** Làm lại một bước (kèm góp ý). Các bước sau sẽ được làm lại khi duyệt tới. */
export async function lamLaiBuoc(id: string, buoc: Buoc, _prev: string | null, form: FormData): Promise<string | null> {
  const loi = await coQuyen(buoc, 'lam');
  if (loi) return loi;
  if (await dangChay(id)) return 'AI đang làm, đợi xong đã.';
  const yeu_cau = String(form.get('yeu_cau') ?? '').trim();
  if (!yeu_cau) return 'Ghi góp ý để AI biết sửa gì.';
  return chayBuoc(id, { kind: 'buoc', id, buoc, yeu_cau }, `AI đang làm lại: ${tenBuoc(buoc)}…`);
}

/** Chạy lại bước đang dở (sau khi lỗi hoặc bị treo). */
export async function chayLai(id: string): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase.from('du_an').select('buoc').eq('id', id).single();
  if (!data) return 'Không tìm thấy dự án.';
  const loi = await coQuyen(data.buoc as Buoc, 'lam');
  if (loi) return loi;
  if (await dangChay(id)) return 'AI đang làm, đợi xong đã.';
  return chayBuoc(id, { kind: 'buoc', id, buoc: data.buoc as Buoc }, `AI đang làm: ${tenBuoc(data.buoc)}…`);
}

export async function vietLaiDoanKB(id: string, doan: number, yeu_cau: string): Promise<string | null> {
  const loi = await coQuyen('kich-ban', 'lam');
  if (loi) return loi;
  if (await dangChay(id)) return 'AI đang làm, đợi xong đã.';
  if (!yeu_cau.trim()) return 'Ghi góp ý cho đoạn này.';
  return chayBuoc(id, { kind: 'doan', id, doan, yeu_cau: yeu_cau.trim() }, `AI đang viết lại đoạn ${doan + 1}…`);
}

/** Lưu kịch bản sửa tay thành phiên bản mới (giữ bản AI cũ để học văn phong ở A4). */
export async function luuKichBanSuaTay(id: string, kb: KichBan): Promise<string | null> {
  const loi = await coQuyen('kich-ban', 'lam');
  if (loi) return loi;
  if (await dangChay(id)) return 'AI đang làm, đợi xong đã.';
  const doan = kb.doan
    .map((d) => ({ ...d, loi: d.loi.trim(), hinh: d.hinh.trim(), giay: Number(d.giay) || 0 }))
    .filter((d) => d.loi || d.hinh);
  const supabase = await supabaseServer();
  const { error } = await supabase.from('du_an_phien_ban').insert({
    du_an_id: id,
    buoc: 'kich-ban',
    nguon: 'sua-tay',
    noi_dung: { ...kb, doan, tong_giay: doan.reduce((s, d) => s + d.giay, 0) },
    yeu_cau: 'Sửa tay',
  });
  if (error) return `Lỗi lưu: ${error.message}`;
  revalidatePath(`/du-an/${id}`);
  return null;
}

export async function huyDuAn(id: string): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.from('du_an').update({ trang_thai: 'huy', thong_bao: 'Đã hủy', cap_nhat_luc: new Date().toISOString() }).eq('id', id);
  revalidatePath(`/du-an/${id}`);
  revalidatePath('/du-an');
}
