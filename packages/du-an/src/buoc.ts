import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { fetchProductFacts, type ProductFacts } from '@app/products';
import { anthropic, ghiChiPhi, kiemTraTran, MODEL_MANH } from './ai.ts';
import type { NoiDungKhanGia } from './khan-gia.ts';
import { khuonChoAI, type Khuon } from './khuon.ts';
import { thuongHieuChoAI, type TraLoiThuongHieu } from './thuong-hieu.ts';
import type { Brief, Buoc, DuyetYTuong, KeHoach, KichBan, YTuong } from './types.ts';
import { MUC_TIEU } from './types.ts';

/**
 * Các bước của một dự án video. Mỗi bước: đọc kho tri thức (thương hiệu, insight đã duyệt, khuôn) + brief
 * + dữ kiện sản phẩm + kết quả bước trước đã duyệt → Opus viết đầu ra có cấu trúc → lưu thành 1 phiên bản.
 */

// ───────────── Khung đầu ra (structured output) ─────────────

const YTuongSchema = z.object({
  tom_tat_brief: z.string(),
  insight: z.array(z.object({ noi_dung: z.string(), bang_chung: z.string(), gia_dinh: z.boolean() })),
  goc: z.array(
    z.object({
      ten: z.string(),
      mo_ta: z.string(),
      khuon: z.string(),
      vi_sao: z.string(),
      uu: z.array(z.string()),
      nhuoc: z.array(z.string()),
      rui_ro: z.array(z.string()),
      diem: z.object({ hap_dan: z.number(), ban_hang: z.number(), de_quay: z.number() }),
      hook: z.array(z.string()),
    }),
  ),
  de_xuat: z.object({ goc: z.number(), ly_do: z.string() }),
  cau_hoi: z.array(z.string()),
});

const KeHoachSchema = z.object({
  khuon: z.string(),
  ly_do_khuon: z.string(),
  do_dai: z.string(),
  nen_tang: z.array(z.string()),
  thong_diep: z.string(),
  cta: z.string(),
  nhan_vat: z.array(z.object({ vai: z.string(), mo_ta: z.string() })),
  nhip: z.array(z.object({ ten: z.string(), y_chinh: z.string(), giay: z.string() })),
  du_kien: z.array(z.object({ noi_dung: z.string(), nguon: z.enum(['web', 'kho-tri-thuc', 'can-xac-minh']), chi_tiet: z.string() })),
  luu_y_san_xuat: z.array(z.string()),
  goi_y_chuoi: z.array(z.string()),
});

const DoanSchema = z.object({
  nhip: z.string(),
  nguoi_noi: z.string(),
  loi: z.string(),
  hinh: z.string(),
  giay: z.number(),
  can_xac_minh: z.string(),
});
const KichBanSchema = z.object({
  tieu_de: z.string(),
  hook: z.array(z.object({ cau: z.string(), ly_do: z.string() })),
  hook_chon: z.number(),
  doan: z.array(DoanSchema),
  tong_giay: z.number(),
  ghi_chu_quay: z.array(z.string()),
  can_xac_minh: z.array(z.string()),
});

// ───────────── Bối cảnh chung (kho tri thức) ─────────────

const VAI_TRO = `Mày là đội tiền kỳ sản xuất video ngắn dọc (TikTok / Facebook Reels / YouTube Shorts) của Soccerstore.vn — shop giày & đồ bóng đá Việt Nam.
Người dùng là giám đốc marketing của shop. Mày tư duy như content strategist, scriptwriter và đạo diễn có kinh nghiệm với video bán hàng ngắn ở Việt Nam.

LOẠI VIDEO: người thật nói trước máy (1 người), hoặc hội thoại / hỏi đáp / phỏng vấn (2 người, gọi là A và B). Quay ở shop hoặc sân bóng, bằng máy quay / điện thoại.
KHÔNG làm video không lời, không dùng giọng AI, không dựng cảnh không quay được.

QUY TẮC CỨNG:
1. Không bịa thông tin. Giá, size, còn hàng, thông số chỉ lấy từ "Dữ kiện sản phẩm (từ web)". Chính sách, địa chỉ, cam kết chỉ lấy từ phần thương hiệu có nhãn NGUỒN CHUẨN.
   Điều gì không có nguồn mà cần nói thì đánh dấu "cần xác minh", không khẳng định.
2. Insight phải dựa trên bản insight khán giả đã duyệt; suy luận ngoài dữ liệu thì ghi rõ là giả định.
3. Giọng nói, xưng hô, CTA, từ nên / cấm dùng: theo đúng phần thương hiệu. Không chê hãng / shop khác đích danh.
4. Viết tiếng Việt tự nhiên kiểu NÓI, câu ngắn, như người thật nói trước máy — không văn viết, không sáo rỗng ("trải nghiệm tuyệt vời", "đỉnh cao công nghệ").
5. 3 giây đầu quyết định người xem có ở lại không: hook phải cụ thể, gây tò mò hoặc chạm đúng nỗi lo của khách.`;

export interface BoiCanh {
  system: Anthropic.TextBlockParam[];
  khuon: Khuon[];
}

export async function boiCanh(db: SupabaseClient): Promise<BoiCanh> {
  const [{ data: kt }, { data: khuon }] = await Promise.all([
    db.from('du_an_kien_thuc').select('muc,noi_dung'),
    db.from('du_an_khuon').select('ma,ten,thu_tu,noi_dung,video_mau').order('thu_tu'),
  ]);
  const muc = new Map((kt ?? []).map((r) => [r.muc as string, r.noi_dung as Record<string, unknown>]));
  const traLoi = ((muc.get('thuong-hieu') as { tra_loi?: TraLoiThuongHieu } | undefined)?.tra_loi ?? {}) as TraLoiThuongHieu;
  const kg = (muc.get('khan-gia') ?? {}) as NoiDungKhanGia;
  const baiHoc = ((muc.get('bai-hoc') as { luat?: string[] } | undefined)?.luat ?? []).filter(Boolean);
  const ds = (khuon ?? []) as Khuon[];
  const kho = [
    `## THƯƠNG HIỆU (chủ shop tự khai)\n${thuongHieuChoAI(traLoi)}`,
    `## INSIGHT KHÁN GIẢ (đã duyệt)\n${kg.da_duyet?.trim() || '(chưa có bản insight đã duyệt — mọi nhận định về khán giả phải ghi là giả định)'}`,
    `## CÁC KHUÔN VIDEO CỦA SHOP\n${ds.map(khuonChoAI).join('\n\n')}`,
    baiHoc.length ? `## BÀI HỌC TỪ CÁC LẦN CHỦ SHOP SỬA (ưu tiên làm theo)\n${baiHoc.map((l) => `- ${l}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  return {
    system: [
      { type: 'text', text: VAI_TRO },
      { type: 'text', text: `# KHO TRI THỨC\n\n${kho}`, cache_control: { type: 'ephemeral' } },
    ],
    khuon: ds,
  };
}

// ───────────── Gọi AI ─────────────

async function goi<T>(
  db: SupabaseClient,
  duAnId: string,
  buoc: string,
  system: Anthropic.TextBlockParam[],
  noiDung: string,
  schema: z.ZodType<T>,
): Promise<{ data: T; model: string }> {
  await kiemTraTran(db);
  const res = await anthropic.messages.parse({
    model: MODEL_MANH,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system,
    messages: [{ role: 'user', content: noiDung }],
    output_config: { format: zodOutputFormat(schema), effort: 'high' },
  });
  await ghiChiPhi(db, buoc, res.model, res.usage, duAnId);
  if (res.stop_reason === 'refusal') throw new Error('AI từ chối làm bước này.');
  if (res.stop_reason === 'max_tokens') throw new Error('AI viết quá dài, bị cắt giữa chừng — bấm làm lại.');
  if (!res.parsed_output) throw new Error('AI trả về sai định dạng — bấm làm lại.');
  return { data: res.parsed_output as T, model: res.model };
}

// ───────────── Dữ liệu dự án ─────────────

export interface DuAnRow {
  id: string;
  ten: string;
  brief: Brief;
  san_pham: ProductFacts[];
  che_do: 'duyet' | 'nhanh';
  buoc: Buoc;
}

export interface PhienBanRow {
  id: string;
  buoc: Buoc;
  nguon: 'ai' | 'sua-tay';
  noi_dung: unknown;
  yeu_cau: string | null;
  duyet: Record<string, unknown> | null;
  tao_luc: string;
}

export async function banMoiNhat(db: SupabaseClient, duAnId: string, buoc: Buoc): Promise<PhienBanRow | null> {
  const { data } = await db
    .from('du_an_phien_ban')
    .select('id,buoc,nguon,noi_dung,yeu_cau,duyet,tao_luc')
    .eq('du_an_id', duAnId)
    .eq('buoc', buoc)
    .order('tao_luc', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as PhienBanRow | null) ?? null;
}

function briefChoAI(d: DuAnRow): string {
  const b = d.brief;
  return [
    `## BRIEF DỰ ÁN "${d.ten}"`,
    `Ý tưởng ban đầu: ${b.y_tuong}`,
    `Mục tiêu: ${MUC_TIEU[b.muc_tieu] ?? b.muc_tieu ?? '(chưa ghi)'}`,
    `Nền tảng: ${b.nen_tang?.length ? b.nen_tang.join(', ') : '(không giới hạn)'}`,
    `Khuôn mong muốn: ${b.khuon || '(để mày chọn)'}`,
    b.ghi_chu ? `Ghi chú: ${b.ghi_chu}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function sanPhamChoAI(d: DuAnRow): string {
  if (!d.san_pham.length) return '## DỮ KIỆN SẢN PHẨM (từ web)\n(dự án không gắn sản phẩm cụ thể — không được nêu giá / size / tình trạng hàng)';
  return (
    '## DỮ KIỆN SẢN PHẨM (từ web — nguồn chuẩn duy nhất cho giá, size, còn hàng)\n' +
    d.san_pham
      .map(
        (p) =>
          `### ${p.name}${p.sku ? ` (mã ${p.sku})` : ''}\nLink: ${p.link}\nGiá: ${p.gia}${p.gia_goc ? ` (giá gốc ${p.gia_goc})` : ''} · ${p.con_hang ? 'Còn hàng' : 'HẾT HÀNG'}${p.size.length ? ` · Size: ${p.size.join(', ')}` : ''}\nMô tả ngắn: ${p.mo_ta_ngan || '—'}\nMô tả trên web:\n${p.mo_ta || '—'}`,
      )
      .join('\n\n')
  );
}

function gocDaChon(y: YTuong | null, duyet: DuyetYTuong | null): string {
  if (duyet?.goc_rieng?.trim()) return `Góc do chủ shop tự đặt: ${duyet.goc_rieng.trim()}`;
  const g = y?.goc[(duyet?.goc ?? y?.de_xuat.goc ?? 1) - 1];
  if (!g) return '(chưa có góc)';
  return `Góc "${g.ten}" (khuôn ${g.khuon}): ${g.mo_ta}\nVì sao hợp: ${g.vi_sao}\nHook thử: ${g.hook.join(' · ')}`;
}

// ───────────── Từng bước ─────────────

export async function chayYTuong(db: SupabaseClient, d: DuAnRow, bc: BoiCanh, yeuCau?: string): Promise<{ noi_dung: YTuong; model: string }> {
  const cu = yeuCau ? await banMoiNhat(db, d.id, 'y-tuong') : null;
  const r = await goi(
    db,
    d.id,
    'y-tuong',
    bc.system,
    [
      briefChoAI(d),
      sanPhamChoAI(d),
      cu ? `## BẢN TRƯỚC (chủ shop chưa hài lòng)\n${JSON.stringify(cu.noi_dung)}\n\n## YÊU CẦU LÀM LẠI\n${yeuCau}` : '',
      `## VIỆC CỦA MÀY: PHÁT TRIỂN Ý TƯỞNG (vai content strategist)
1. tom_tat_brief: hiểu brief thế nào, 2–3 câu.
2. insight: 2–4 insight người xem liên quan ý tưởng này. bang_chung = trích / dẫn từ insight khán giả đã duyệt; gia_dinh = true nếu là suy luận chưa có dữ liệu.
3. goc: ĐÚNG 3 góc khai thác khác hẳn nhau. Mỗi góc: khuon = mã khuôn (review / top / hoi-dap / storytelling / so-sanh / meo${d.brief.khuon ? `; chủ shop muốn khuôn "${d.brief.khuon}", ít nhất 2 góc dùng khuôn này` : ''}); vi_sao hợp với khách và mục tiêu; uu / nhuoc / rui_ro (cụ thể, mỗi mục 1–3 ý; rủi ro gồm cả khó quay, dễ nói sai, dễ nhàm);
   diem 1–5: hap_dan (giữ người xem), ban_hang (đẩy mục tiêu), de_quay (5 = quay một buổi ở shop là xong); hook = 2–3 câu mở đầu nói được trong 3 giây.
4. de_xuat: góc số mấy (1–3) là tốt nhất + lý do so với 2 góc kia.
5. cau_hoi: điều cần chủ shop trả lời / xác nhận trước khi viết kịch bản (vd cam kết, có quay được ở sân không). Không có thì để mảng rỗng.`,
    ]
      .filter(Boolean)
      .join('\n\n'),
    YTuongSchema,
  );
  return { noi_dung: r.data as YTuong, model: r.model };
}

export async function chayKeHoach(db: SupabaseClient, d: DuAnRow, bc: BoiCanh, yeuCau?: string): Promise<{ noi_dung: KeHoach; model: string }> {
  const y = await banMoiNhat(db, d.id, 'y-tuong');
  const duyetY = (y?.duyet ?? null) as DuyetYTuong | null;
  const cu = yeuCau ? await banMoiNhat(db, d.id, 'ke-hoach') : null;
  const r = await goi(
    db,
    d.id,
    'ke-hoach',
    bc.system,
    [
      briefChoAI(d),
      sanPhamChoAI(d),
      `## Ý TƯỞNG ĐÃ DUYỆT\n${gocDaChon((y?.noi_dung ?? null) as YTuong | null, duyetY)}${duyetY?.ghi_chu ? `\nGhi chú của chủ shop khi duyệt: ${duyetY.ghi_chu}` : ''}`,
      cu ? `## BẢN KẾ HOẠCH TRƯỚC (chưa đạt)\n${JSON.stringify(cu.noi_dung)}\n\n## YÊU CẦU LÀM LẠI\n${yeuCau}` : '',
      `## VIỆC CỦA MÀY: KẾ HOẠCH NỘI DUNG (vai content strategist)
- khuon: mã khuôn dùng (theo góc đã duyệt) + ly_do_khuon.
- do_dai: vd "75–90 giây" — theo khuôn và nền tảng. nen_tang: nền tảng phù hợp nhất.
- thong_diep: MỘT câu người xem phải nhớ. cta: lời kêu gọi theo CTA chuẩn của shop.
- nhan_vat: ai nói. 1 người thì 1 dòng (vai "A"); hội thoại / hỏi đáp / phỏng vấn thì A và B, mô tả vai từng người (vd A = nhân viên tư vấn, B = khách).
- nhip: các nhịp theo khuôn, mỗi nhịp ý chính sẽ nói + khoảng giây.
- du_kien: MỌI dữ kiện sẽ nói trong video (giá, công nghệ, chính sách, số liệu…). nguon = 'web' (có trong dữ kiện sản phẩm), 'kho-tri-thuc' (thương hiệu / insight), 'can-xac-minh' (không có nguồn); chi_tiet = trích nguồn hoặc cần kiểm tra gì.
- luu_y_san_xuat: điều cần chuẩn bị để quay (đạo cụ, địa điểm, sản phẩm mẫu, người).
- goi_y_chuoi: nếu ý tưởng đủ lớn để làm thành chuỗi nhiều video thì gợi ý 2–4 tập tiếp theo; không thì mảng rỗng.`,
    ]
      .filter(Boolean)
      .join('\n\n'),
    KeHoachSchema,
  );
  return { noi_dung: r.data as KeHoach, model: r.model };
}

export async function chayKichBan(db: SupabaseClient, d: DuAnRow, bc: BoiCanh, yeuCau?: string): Promise<{ noi_dung: KichBan; model: string }> {
  const [y, k] = await Promise.all([banMoiNhat(db, d.id, 'y-tuong'), banMoiNhat(db, d.id, 'ke-hoach')]);
  const kh = (k?.noi_dung ?? null) as KeHoach | null;
  const khuon = bc.khuon.find((x) => x.ma === kh?.khuon);
  const cu = yeuCau ? await banMoiNhat(db, d.id, 'kich-ban') : null;
  const r = await goi(
    db,
    d.id,
    'kich-ban',
    bc.system,
    [
      briefChoAI(d),
      sanPhamChoAI(d),
      `## Ý TƯỞNG ĐÃ DUYỆT\n${gocDaChon((y?.noi_dung ?? null) as YTuong | null, (y?.duyet ?? null) as DuyetYTuong | null)}`,
      `## KẾ HOẠCH ĐÃ DUYỆT\n${JSON.stringify(kh)}${(k?.duyet as { ghi_chu?: string } | null)?.ghi_chu ? `\nGhi chú của chủ shop khi duyệt: ${(k!.duyet as { ghi_chu: string }).ghi_chu}` : ''}`,
      khuon ? `## KHUÔN ĐANG DÙNG\n${khuonChoAI(khuon)}` : '',
      cu ? `## BẢN KỊCH BẢN TRƯỚC (chưa đạt)\n${JSON.stringify(cu.noi_dung)}\n\n## YÊU CẦU LÀM LẠI\n${yeuCau}` : '',
      `## VIỆC CỦA MÀY: VIẾT KỊCH BẢN QUAY (vai scriptwriter)
- tieu_de: tên video ngắn gọn.
- hook: 3 phương án câu mở đầu (≤ 3 giây khi nói), ly_do mỗi câu; hook_chon = số thứ tự (1–3) mày khuyên dùng. Đoạn đầu tiên trong "doan" dùng đúng hook đã chọn.
- doan: kịch bản chia theo nhịp của kế hoạch, mỗi đoạn 1–3 câu nói:
  · nhip = tên nhịp · nguoi_noi = "A" / "B" (video 2 người) hoặc "" (1 người)
  · loi = NGUYÊN VĂN câu nói, văn nói tự nhiên, đúng xưng hô của shop, đọc thành tiếng ~3–4 chữ / giây
  · hinh = người quay thấy gì trên hình (cận sản phẩm, tay chỉ vào đế, 2 đôi đặt cạnh nhau, chữ trên màn hình…) — phải quay được ở shop / sân
  · giay = số giây ước của đoạn · can_xac_minh = điều trong đoạn chưa có nguồn chuẩn (rỗng nếu không có)
- tong_giay: tổng số giây, phải nằm trong độ dài của kế hoạch.
- ghi_chu_quay: lưu ý cho người nói / người quay (nhấn giọng chỗ nào, cầm sản phẩm thế nào, cần quay thêm cảnh gì).
- can_xac_minh: gom mọi điều cần kiểm tra trước khi quay.`,
    ]
      .filter(Boolean)
      .join('\n\n'),
    KichBanSchema,
  );
  return { noi_dung: r.data as KichBan, model: r.model };
}

/** Viết lại MỘT đoạn kịch bản theo góp ý, giữ nguyên các đoạn khác. */
export async function vietLaiDoan(db: SupabaseClient, d: DuAnRow, bc: BoiCanh, kb: KichBan, viTri: number, yeuCau: string) {
  const r = await goi(
    db,
    d.id,
    'kich-ban',
    bc.system,
    [
      briefChoAI(d),
      sanPhamChoAI(d),
      `## KỊCH BẢN HIỆN TẠI\n${JSON.stringify(kb)}`,
      `## VIỆC CỦA MÀY: chỉ viết lại ĐOẠN SỐ ${viTri + 1} (nhịp "${kb.doan[viTri]?.nhip}") theo góp ý của chủ shop, khớp mạch với đoạn trước và sau, giữ đúng quy tắc.
Góp ý: ${yeuCau}
Trả về đúng 1 đoạn.`,
    ].join('\n\n'),
    DoanSchema,
  );
  return { doan: r.data, model: r.model };
}

/** Lấy dữ kiện sản phẩm từ link trong brief (một lần, lưu vào dự án). */
export async function layDuKienSanPham(links: string[]): Promise<{ items: ProductFacts[]; ghi_chu: string | null }> {
  if (!links.length) return { items: [], ghi_chu: null };
  try {
    const r = await fetchProductFacts(links);
    return { items: r.items, ghi_chu: r.khong_thay.length ? `Không đọc được ${r.khong_thay.length} link sản phẩm: ${r.khong_thay.join(', ')}` : null };
  } catch (e) {
    return { items: [], ghi_chu: `Không lấy được dữ kiện sản phẩm từ web: ${(e as Error).message}` };
  }
}
