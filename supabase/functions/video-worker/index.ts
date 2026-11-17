// "Cổng" duy nhất cho máy worker của SCS Video Studio (module Video).
// Máy worker gửi POST JSON {"hanh_dong": "...", ...} kèm header  x-worker-key: <chìa khóa máy admin cấp>.
// Function kiểm tra chìa khóa (so sha256 với video_workers.khoa_bam, máy phải đang "hoat-dong") rồi mới làm.
// Khóa toàn quyền (SUPABASE_SERVICE_ROLE_KEY) do Supabase tự cấp cho Edge Function — không nằm trên máy worker hay Netlify.
//
// Triển khai: Supabase Dashboard → Edge Functions → Deploy a new function → Via Editor → tên "video-worker",
// dán file này → Deploy; rồi Details → tắt "Enforce JWT verification" (máy worker xác thực bằng chìa khóa máy).
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const KHO = "video-xem";
// trạng thái mà máy worker cần làm việc (các trạng thái khác là đang chờ người)
const CAN_MAY = ["moi", "dang-chuan-bi", "canh-tram-xong", "dang-lam-the", "dang-dung", "gop-y", "dang-sua"];

const tra = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

async function bam(khoa: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(khoa));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function viecCuaMay(mayId: string, jobId: string) {
  const { data } = await db.from("video_jobs").select("id").eq("id", jobId).eq("worker_id", mayId).maybeSingle();
  return !!data;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return tra({ loi: "Chỉ nhận POST" }, 405);
  const khoa = req.headers.get("x-worker-key") ?? "";
  if (!khoa.startsWith("scsw_")) return tra({ loi: "Thiếu chìa khóa máy" }, 401);
  const { data: may } = await db.from("video_workers").select("*").eq("khoa_bam", await bam(khoa)).maybeSingle();
  if (!may) return tra({ loi: "Chìa khóa máy không hợp lệ" }, 401);
  if (may.trang_thai !== "hoat-dong") return tra({ loi: `Máy đã bị ${may.trang_thai}` }, 403);

  let b: Record<string, any>;
  try {
    b = await req.json();
  } catch {
    return tra({ loi: "Body phải là JSON" }, 400);
  }
  const cfg = (await db.rpc("video_chi_hom_nay")).data ?? {};

  switch (b.hanh_dong) {
    // Máy báo đang bật + phiên bản code + footage/phong cách có trên máy
    case "chao": {
      const lauRoi = !may.lan_cuoi || Date.now() - new Date(may.lan_cuoi).getTime() > 10 * 60_000;
      await db.from("video_workers").update({
        lan_cuoi: new Date().toISOString(), phien_ban: b.phien_ban ?? null,
        footage: b.footage ?? [], phong_cach: b.phong_cach ?? [],
        // cấu hình máy (kiem-tra-may.py): chỉ ghi khi máy có gửi, để máy chạy code cũ không xóa mất
        ...(b.cau_hinh && Object.keys(b.cau_hinh).length ? { cau_hinh: b.cau_hinh } : {}),
      }).eq("id", may.id);
      if (lauRoi) await db.from("video_worker_nhat_ky").insert({ worker_id: may.id, su_kien: "bat", chi_tiet: { phien_ban: b.phien_ban } });
      // dọn bản xem thử cũ (thỉnh thoảng)
      if (Math.random() < 0.05) {
        const { data: cu } = await db.rpc("video_file_cu", { p_ngay: cfg.giu_ngay ?? 14 });
        if (cu?.length) await db.storage.from(KHO).remove(cu);
      }
      return tra({
        ok: true, ten: may.ten, nhan_viec: may.dang_nhan_viec,
        phien_ban_toi_thieu: cfg.phien_ban_toi_thieu ?? 0,
        het_ngan_sach: Number(cfg.da_chi ?? 0) >= Number(cfg.tran ?? 8), da_chi: cfg.da_chi, tran: cfg.tran,
      });
    }

    // Việc tiếp theo của máy này cần máy làm (+ lịch sử để đọc ý kiến duyệt)
    case "lay_viec": {
      if ((b.phien_ban ?? 0) < (cfg.phien_ban_toi_thieu ?? 0)) return tra({ viec: null, ly_do: "code cũ, cần cập nhật" });
      const { data: viec } = await db.from("video_jobs").select("*").eq("worker_id", may.id)
        .in("trang_thai", CAN_MAY).order("created_at").limit(1).maybeSingle();
      if (!viec) return tra({ viec: null });
      const { data: sk } = await db.from("video_su_kien").select("loai, noi_dung, created_at").eq("job_id", viec.id).order("id");
      return tra({ viec, su_kien: sk ?? [] });
    }

    // Máy cập nhật trạng thái / thông báo / kết quả, và nộp sự kiện (dàn ý, thẻ, bản nháp...)
    case "cap_nhat": {
      if (!(await viecCuaMay(may.id, b.job_id))) return tra({ loi: "Không phải việc của máy này" }, 403);
      const sua: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of ["trang_thai", "thong_bao", "ket_qua"]) if (b[k] !== undefined) sua[k] = b[k];
      await db.from("video_jobs").update(sua).eq("id", b.job_id);
      if (b.su_kien) await db.from("video_su_kien").insert({ job_id: b.job_id, loai: b.su_kien.loai, noi_dung: b.su_kien.noi_dung ?? {}, nguoi: null });
      return tra({ ok: true });
    }

    // Link để máy tải file nhẹ LÊN kho (ảnh duyệt, bản xem thử 480p)
    case "link_tai_len": {
      if (!(await viecCuaMay(may.id, b.job_id))) return tra({ loi: "Không phải việc của máy này" }, 403);
      const duong = `${b.job_id}/${String(b.ten_file).replace(/[^\w.\-]/g, "_")}`;
      const { data, error } = await db.storage.from(KHO).createSignedUploadUrl(duong, { upsert: true });
      if (error) return tra({ loi: error.message }, 500);
      return tra({ url: data.signedUrl, duong });
    }

    // Danh sách cảnh trám người làm đã tải lên (link tải VỀ có hạn 1 giờ)
    case "ds_canh_tram": {
      if (!(await viecCuaMay(may.id, b.job_id))) return tra({ loi: "Không phải việc của máy này" }, 403);
      const { data: ds } = await db.storage.from(KHO).list(`${b.job_id}/canh-tram`, { limit: 200 });
      const kq = [];
      for (const f of ds ?? []) {
        if (!f.id) continue; // bỏ thư mục con
        const p = `${b.job_id}/canh-tram/${f.name}`;
        const { data } = await db.storage.from(KHO).createSignedUrl(p, 3600);
        if (data) kq.push({ ten: f.name, url: data.signedUrl, kich_thuoc: f.metadata?.size });
      }
      return tra({ files: kq });
    }

    // Ghi chi phí AI của việc (bảng llm_calls dùng chung với app)
    case "chi_phi": {
      if (!(await viecCuaMay(may.id, b.job_id))) return tra({ loi: "Không phải việc của máy này" }, 403);
      const dong = (b.ban_ghi ?? []).map((r: any) => ({
        purpose: `video:${r.buoc}`, model: r.model, tokens_in: r.tokens_in ?? 0, tokens_out: r.tokens_out ?? 0,
        cost_usd: r.cost_usd ?? 0, job_id: b.job_id,
      }));
      if (dong.length) await db.from("llm_calls").insert(dong);
      return tra({ ok: true });
    }

    default:
      return tra({ loi: `Hành động không hỗ trợ: ${b.hanh_dong}` }, 400);
  }
});
