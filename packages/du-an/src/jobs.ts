import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { banMoiNhat, boiCanh, chayKeHoach, chayKichBan, chayShotlist, chayYTuong, layDuKienSanPham, vietLaiDoan, type DuAnRow } from './buoc.ts';
import { tomTatKhanGia } from './khan-gia.ts';
import { buocSau, tenBuoc, type Buoc, type DuyetYTuong, type KichBan, type YTuong } from './types.ts';

/** Việc chạy nền của Dự án video. */
export type DuAnJob =
  | { kind: 'khan-gia' }
  /** chạy 1 bước (và các bước sau nếu dự án ở chế độ làm nhanh); yeu_cau = góp ý khi làm lại */
  | { kind: 'buoc'; id: string; buoc: Buoc; yeu_cau?: string }
  /** viết lại 1 đoạn kịch bản (vị trí 0-based) */
  | { kind: 'doan'; id: string; doan: number; yeu_cau: string };

/** Client Supabase mang quyền của chính người bấm (RLS như trên web) — hàm nền nhận access token của người dùng. */
export function userClient(accessToken: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('Thiếu NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Làm nhanh: tự duyệt — bước ý tưởng lấy góc AI đề xuất. */
function tuDuyet(buoc: Buoc, noiDung: unknown): Record<string, unknown> {
  if (buoc === 'y-tuong') return { goc: (noiDung as YTuong).de_xuat.goc, ghi_chu: '(làm nhanh — tự chọn góc AI đề xuất)' } satisfies DuyetYTuong;
  return { ghi_chu: '(làm nhanh — tự duyệt)' };
}

async function chayDuAn(db: SupabaseClient, job: Extract<DuAnJob, { kind: 'buoc' | 'doan' }>) {
  const now = () => new Date().toISOString();
  const set = (patch: Record<string, unknown>) => db.from('du_an').update({ ...patch, cap_nhat_luc: now() }).eq('id', job.id);
  const { data, error } = await db.from('du_an').select('id,ten,brief,san_pham,che_do,buoc,trang_thai').eq('id', job.id).single();
  if (error || !data) return;
  if (data.trang_thai === 'huy') return;
  const d = data as DuAnRow & { trang_thai: string };
  // đọc riêng: chưa chạy migration 0026 thì vẫn chạy được (theo Cài đặt / mặc định)
  const { data: mh } = await db.from('du_an').select('mo_hinh').eq('id', job.id).maybeSingle();
  d.mo_hinh = (mh?.mo_hinh as Record<string, unknown> | undefined) ?? {};
  const trangThaiTruoc = d.trang_thai;

  try {
    const bc = await boiCanh(db);

    // ── Viết lại 1 đoạn kịch bản
    if (job.kind === 'doan') {
      await set({ trang_thai: 'dang-lam', thong_bao: `AI đang viết lại đoạn ${job.doan + 1}…`, job_started_at: now() });
      const cu = await banMoiNhat(db, d.id, 'kich-ban');
      if (!cu) throw new Error('Chưa có kịch bản.');
      const kb = cu.noi_dung as KichBan;
      const r = await vietLaiDoan(db, d, bc, kb, job.doan, job.yeu_cau);
      const doan = kb.doan.map((x, i) => (i === job.doan ? r.doan : x));
      await db.from('du_an_phien_ban').insert({
        du_an_id: d.id,
        buoc: 'kich-ban',
        nguon: 'ai',
        noi_dung: { ...kb, doan, tong_giay: doan.reduce((s, x) => s + (Number(x.giay) || 0), 0) },
        yeu_cau: `Viết lại đoạn ${job.doan + 1}: ${job.yeu_cau}`,
        model: r.model,
      });
      await set({ trang_thai: trangThaiTruoc === 'xong' ? 'xong' : 'cho-duyet', thong_bao: `Đã viết lại đoạn ${job.doan + 1}` });
      return;
    }

    // ── Chạy 1 bước (+ các bước sau nếu làm nhanh)
    let buoc: Buoc = job.buoc;
    let yeuCau = job.yeu_cau;
    let ghiChuSp: string | null = null;
    await set({ buoc, trang_thai: 'dang-lam', thong_bao: `AI đang làm: ${tenBuoc(buoc)}…`, job_started_at: now() });
    if (buoc === 'y-tuong' && !yeuCau) {
      const sp = await layDuKienSanPham(d.brief.san_pham_links ?? []);
      d.san_pham = sp.items;
      ghiChuSp = sp.ghi_chu;
      await set({ san_pham: sp.items });
    }

    for (;;) {
      await set({ buoc, thong_bao: `AI đang làm: ${tenBuoc(buoc)}…` });
      const r =
        buoc === 'y-tuong'
          ? await chayYTuong(db, d, bc, yeuCau)
          : buoc === 'ke-hoach'
            ? await chayKeHoach(db, d, bc, yeuCau)
            : buoc === 'kich-ban'
              ? await chayKichBan(db, d, bc, yeuCau)
              : await chayShotlist(db, d, bc, yeuCau);
      const nhanh = d.che_do === 'nhanh';
      const { error: e } = await db.from('du_an_phien_ban').insert({
        du_an_id: d.id,
        buoc,
        nguon: 'ai',
        noi_dung: r.noi_dung,
        yeu_cau: yeuCau ?? null,
        model: r.model,
        ...(nhanh ? { duyet: tuDuyet(buoc, r.noi_dung), duyet_luc: now() } : {}),
      });
      if (e) throw e;
      yeuCau = undefined;
      const sau = buocSau(buoc);
      if (nhanh && sau) {
        buoc = sau;
        continue;
      }
      if (nhanh) await set({ trang_thai: 'xong', thong_bao: `Xong (làm nhanh) — kịch bản + shotlist đã sẵn sàng${ghiChuSp ? ` · ⚠ ${ghiChuSp}` : ''}` });
      else await set({ trang_thai: 'cho-duyet', thong_bao: `Chờ duyệt: ${tenBuoc(buoc)}${ghiChuSp ? ` · ⚠ ${ghiChuSp}` : ''}` });
      return;
    }
  } catch (err) {
    await set({ trang_thai: 'loi', thong_bao: (err as Error).message.slice(0, 500) });
  }
}

export async function runDuAnJob(db: SupabaseClient, job: DuAnJob): Promise<void> {
  if (job.kind === 'khan-gia') {
    const set = (patch: Record<string, unknown>) => db.from('du_an_kien_thuc').update(patch).eq('muc', 'khan-gia');
    await set({ job_status: 'running', job_error: null, job_started_at: new Date().toISOString() });
    try {
      await tomTatKhanGia(db);
      await set({ job_status: 'done' });
    } catch (err) {
      await set({ job_status: 'failed', job_error: (err as Error).message.slice(0, 500) });
    }
    return;
  }
  await chayDuAn(db, job);
}
