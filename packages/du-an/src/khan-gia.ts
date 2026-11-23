import type { SupabaseClient } from '@supabase/supabase-js';
import { anthropic, ghiChiPhi, kiemTraTran, layChu, MODEL_MANH, MODEL_RE } from './ai.ts';
import { thuongHieuChoAI, type TraLoiThuongHieu } from './thuong-hieu.ts';

/**
 * Tóm tắt insight khán giả từ dữ liệu thô (bình luận, tin nhắn, số liệu FB / TikTok / YouTube).
 * Bước 1 (rẻ): mỗi file chưa tóm tắt → Haiku đọc từng đoạn ~60k ký tự → ghi chú, lưu vào du_an_khan_gia_du_lieu.tom_tat.
 * Bước 2 (mạnh): Opus đọc mọi ghi chú + thương hiệu → bản insight markdown → du_an_kien_thuc('khan-gia').noi_dung.ban_ai.
 * Chủ shop duyệt / sửa → noi_dung.da_duyet. Các bước sau (ý tưởng, kịch bản) chỉ đọc bản đã duyệt.
 */

export const NGUON_LABEL: Record<string, string> = {
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  'tin-nhan': 'Tin nhắn khách',
  khac: 'Khác',
};
export const LOAI_LABEL: Record<string, string> = {
  'binh-luan': 'Bình luận',
  'so-lieu': 'Số liệu video',
  'tin-nhan': 'Tin nhắn',
  khac: 'Khác',
};

const DOAN = 60_000; // ký tự mỗi lần Haiku đọc
const TOI_DA_DOAN = 25; // mỗi file tối đa ~1,5 triệu ký tự

export interface NoiDungKhanGia {
  ban_ai?: string;
  ban_ai_luc?: string;
  ban_ai_nguon?: { so_file: number; so_ky_tu: number };
  da_duyet?: string;
  da_duyet_luc?: string;
}

type DongDuLieu = { id: string; nguon: string; loai: string; ten: string; noi_dung: string; tu_ngay: string | null; den_ngay: string | null; tom_tat: string | null };

const HUONG_DAN_DOC = `Mày là chuyên viên nghiên cứu khán giả cho Soccerstore.vn (shop giày & đồ bóng đá Việt Nam, làm video TikTok / Facebook / YouTube).
Đọc đoạn dữ liệu thô dưới đây và ghi chú NGẮN, CỤ THỂ, bằng tiếng Việt (gạch đầu dòng), chỉ ghi điều có trong dữ liệu:
- Câu hỏi khách hay hỏi (ghi gần nguyên văn, kèm số lần gặp ước lượng)
- Nỗi lo / rào cản khi mua (size, thật giả, giá, ship, đổi trả, độ bền…)
- Chữ / cách nói khách hay dùng (giữ nguyên văn, kể cả tiếng lóng)
- Dấu hiệu chân dung khách (tuổi, sân đá, vị trí, mức chi, khu vực) — chỉ khi có bằng chứng
- Nếu là SỐ LIỆU video: video / chủ đề / định dạng nào chạy tốt hay kém (view, giữ chân, tương tác), kèm con số
- Trích 3–5 bình luận tiêu biểu nguyên văn
Không suy diễn ngoài dữ liệu. Không chào hỏi, chỉ trả ghi chú.`;

const HUONG_DAN_DOC_TIN_NHAN = `Mày là chuyên viên nghiên cứu khán giả cho Soccerstore.vn (shop giày & đồ bóng đá Việt Nam, làm video TikTok / Facebook / YouTube).
Dưới đây là các cuộc hội thoại TƯ VẤN qua Messenger giữa khách và shop (đã che thông tin cá nhân; "[tin mẫu #số]" là câu trả lời mẫu của shop, nội dung ở phần đầu).
Shop thường tư vấn lâu mới chốt được đơn — mục tiêu là hiểu khách băn khoăn gì và điều gì làm họ chốt, để làm video trả lời sẵn.
Ghi chú NGẮN, CỤ THỂ, tiếng Việt, gạch đầu dòng, chỉ điều có trong dữ liệu, kèm số hội thoại ước lượng:
- Câu mở đầu: khách hỏi gì đầu tiên (nhóm theo chủ đề, trích nguyên văn tiêu biểu)
- Băn khoăn trong lúc tư vấn: khách còn lo gì SAU câu hỏi đầu (form chân / size, thật giả, giá, ship, đổi trả, độ bền, so mẫu…)
- Điều giúp khách chốt: shop nói gì / gửi gì (ảnh thật, video, cam kết, chính sách…) ngay TRƯỚC khi khách chốt
  (dấu hiệu chốt: "[khách gửi địa chỉ…]", gửi [sđt], "lấy cho em", "chốt", hỏi số tài khoản) — trích nguyên văn
- Lý do khách bỏ đi / chưa chốt (im lặng sau báo giá, chê đắt, hết size, chờ sale, đi mua chỗ khác…)
- So sánh: mẫu / hãng / shop khác khách nhắc tới
- Vì sao tư vấn kéo dài: câu hỏi lặp đi lặp lại mà một video có thể trả lời sẵn
- Chữ khách hay dùng (nguyên văn, kể cả tiếng lóng, viết tắt)
- Trích 2–3 đoạn hội thoại ngắn tiêu biểu (vài dòng)
Không suy diễn ngoài dữ liệu. Không chào hỏi, chỉ trả ghi chú.`;

/** Cắt thành đoạn ~DOAN ký tự, ưu tiên cắt ở ranh giới hội thoại ("=== Hội thoại") để không xé đôi 1 cuộc tư vấn.
 *  Với tin nhắn: phần đầu (tin mẫu của shop) gắn vào mọi đoạn để AI hiểu "[tin mẫu #số]". */
export function catDoan(f: DongDuLieu): string[] {
  const s = f.noi_dung;
  const dauTin = f.loai === 'tin-nhan' ? s.slice(0, Math.max(0, s.indexOf('\n=== Hội thoại'))) : '';
  const doan: string[] = [];
  let i = dauTin.length;
  while (i < s.length && doan.length < TOI_DA_DOAN) {
    let j = Math.min(s.length, i + DOAN);
    if (j < s.length) {
      const k = s.lastIndexOf('\n=== Hội thoại', j);
      if (k > i + DOAN / 2) j = k;
    }
    doan.push((dauTin && doan.length ? dauTin + '\n\n' : '') + s.slice(i, j).trim());
    i = j;
  }
  if (dauTin && doan.length) doan[0] = dauTin + '\n\n' + doan[0];
  return doan;
}

async function tomTatFile(db: SupabaseClient, f: DongDuLieu): Promise<string> {
  const doan = catDoan(f);
  const tinNhan = f.loai === 'tin-nhan';
  const docDoan = async (d: string, i: number): Promise<string> => {
    await kiemTraTran(db);
    const res = await anthropic.messages.create({
      model: MODEL_RE,
      max_tokens: tinNhan ? 4000 : 3000,
      system: tinNhan ? HUONG_DAN_DOC_TIN_NHAN : HUONG_DAN_DOC,
      messages: [
        {
          role: 'user',
          content: `Nguồn: ${NGUON_LABEL[f.nguon] ?? f.nguon} · Loại: ${LOAI_LABEL[f.loai] ?? f.loai} · Tên: ${f.ten}${f.tu_ngay ? ` · ${f.tu_ngay} → ${f.den_ngay ?? ''}` : ''}${doan.length > 1 ? ` · Đoạn ${i + 1}/${doan.length}` : ''}\n\n${d}`,
        },
      ],
    });
    await ghiChiPhi(db, 'doc-du-lieu', res.model, res.usage);
    return layChu(res);
  };
  // đọc song song 4 đoạn một lúc (file tin nhắn ~20 đoạn: tuần tự sẽ gần chạm giới hạn 15 phút của việc chạy nền)
  const ghiChu: string[] = new Array(doan.length);
  let tiep = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, doan.length) }, async () => {
      while (tiep < doan.length) {
        const i = tiep++;
        ghiChu[i] = await docDoan(doan[i]!, i);
      }
    }),
  );
  const daDoc = doan.reduce((n, d) => n + d.length, 0);
  const cat = f.noi_dung.length > daDoc + 1000 ? `\n(File dài, chỉ đọc khoảng ${daDoc.toLocaleString('vi-VN')} ký tự đầu)` : '';
  return ghiChu.join('\n\n') + cat;
}

const HUONG_DAN_INSIGHT = `Mày là content strategist của Soccerstore.vn (shop giày & đồ bóng đá Việt Nam). Từ ghi chú nghiên cứu khán giả bên dưới (đã tóm tắt từ bình luận, tin nhắn, số liệu video thật), viết BẢN INSIGHT KHÁN GIẢ bằng tiếng Việt, markdown, đúng các mục:

## Chân dung khách
2–4 nhóm khách chính: là ai, đá sân gì, quan tâm gì, mức chi. Mỗi nhóm ghi bằng chứng.
## Nỗi lo & rào cản khi mua
Xếp theo mức độ hay gặp, kèm bằng chứng.
## Câu hỏi hay gặp
Gần nguyên văn, kèm tần suất ước lượng — đây là nguồn ý tưởng video Hỏi đáp.
## Hành trình tư vấn → chốt đơn
Từ tin nhắn tư vấn (nếu có): khách thường hỏi gì đầu tiên → băn khoăn gì tiếp theo → điều gì (câu trả lời, bằng chứng, chính sách) làm khách chốt → vì sao khách bỏ đi. Kèm trích nguyên văn ngắn.
Kết thúc bằng: những băn khoăn nào nên có video trả lời SẴN để rút ngắn thời gian tư vấn. Không có dữ liệu tin nhắn thì ghi "chưa có dữ liệu tin nhắn".
## Chữ khách hay dùng
Từ ngữ, tiếng lóng, cách gọi sản phẩm — để kịch bản nói giống khách.
## Nội dung chạy tốt / kém
Từ số liệu (nếu có): chủ đề, định dạng, hook, độ dài nào hiệu quả — kèm con số. Không có số liệu thì ghi "chưa có số liệu".
## Cơ hội nội dung
5–8 hướng video cụ thể rút ra từ insight trên (ghi khuôn phù hợp: Review / Top sản phẩm / Hỏi đáp / Storytelling / So sánh / Mẹo).

QUY TẮC: mỗi nhận định phải dựa trên ghi chú (trích ngắn hoặc nêu nguồn: Facebook / TikTok / YouTube / tin nhắn). Điều suy luận chưa chắc thì ghi rõ "(giả định)". Không bịa số liệu.`;

export async function tomTatKhanGia(db: SupabaseClient): Promise<void> {
  await kiemTraTran(db);
  const { data, error } = await db
    .from('du_an_khan_gia_du_lieu')
    .select('id,nguon,loai,ten,noi_dung,tu_ngay,den_ngay,tom_tat')
    .order('tao_luc', { ascending: true });
  if (error) throw error;
  const files = (data ?? []) as DongDuLieu[];
  if (!files.length) throw new Error('Chưa có dữ liệu khán giả nào — dán hoặc tải file lên trước.');

  // Bước 1: file nào chưa có ghi chú thì đọc (lưu lại ngay, lỗi giữa chừng vẫn giữ phần đã đọc)
  for (const f of files) {
    if (f.tom_tat) continue;
    f.tom_tat = await tomTatFile(db, f);
    await db.from('du_an_khan_gia_du_lieu').update({ tom_tat: f.tom_tat }).eq('id', f.id);
  }

  // Bước 2: gộp thành insight
  await kiemTraTran(db);
  const { data: th } = await db.from('du_an_kien_thuc').select('noi_dung').eq('muc', 'thuong-hieu').maybeSingle();
  const traLoi = ((th?.noi_dung as { tra_loi?: TraLoiThuongHieu } | null)?.tra_loi ?? {}) as TraLoiThuongHieu;
  const ghiChu = files
    .map((f) => `### ${NGUON_LABEL[f.nguon] ?? f.nguon} — ${LOAI_LABEL[f.loai] ?? f.loai} — ${f.ten}${f.tu_ngay ? ` (${f.tu_ngay} → ${f.den_ngay ?? ''})` : ''}\n${f.tom_tat}`)
    .join('\n\n');

  const res = await anthropic.messages
    .stream({
      model: MODEL_MANH,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: HUONG_DAN_INSIGHT,
      messages: [
        {
          role: 'user',
          content: `## Thông tin thương hiệu (chủ shop tự khai)\n${thuongHieuChoAI(traLoi)}\n\n## Ghi chú nghiên cứu khán giả (${files.length} file)\n${ghiChu}\n\nViết bản insight.`,
        },
      ],
    })
    .finalMessage();
  await ghiChiPhi(db, 'insight', res.model, res.usage);
  if (res.stop_reason === 'refusal') throw new Error('AI từ chối viết bản insight.');
  const ban = layChu(res);
  if (!ban) throw new Error('AI không trả về nội dung — thử lại.');

  const { data: cu } = await db.from('du_an_kien_thuc').select('noi_dung').eq('muc', 'khan-gia').maybeSingle();
  const noiDung: NoiDungKhanGia = {
    ...((cu?.noi_dung as NoiDungKhanGia | null) ?? {}),
    ban_ai: ban,
    ban_ai_luc: new Date().toISOString(),
    ban_ai_nguon: { so_file: files.length, so_ky_tu: files.reduce((s, f) => s + f.noi_dung.length, 0) },
  };
  const { error: e2 } = await db.from('du_an_kien_thuc').update({ noi_dung: noiDung }).eq('muc', 'khan-gia');
  if (e2) throw e2;
}
