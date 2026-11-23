import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { costOf, type TokenUsage } from '@app/core';

export const anthropic = new Anthropic();

/** Mô hình mạnh cho tư duy (insight, ý tưởng, kịch bản); mô hình rẻ cho đọc dữ liệu thô khối lượng lớn. */
export const MODEL_MANH = process.env.DU_AN_MODEL || 'claude-opus-5-5';
export const MODEL_RE = process.env.DU_AN_MODEL_RE || 'claude-haiku-5-5';

/** Trần chi phí riêng của Dự án video (settings.du_an_tran_ngay_usd, mặc định $3/ngày). */
export async function kiemTraTran(db: SupabaseClient) {
  const [{ data: chi }, { data: tran }] = await Promise.all([db.rpc('du_an_chi_hom_nay'), db.rpc('du_an_tran_ngay')]);
  if (Number(chi) >= Number(tran)) {
    throw new Error(`Dự án video đã chạm trần chi phí hôm nay ($${Number(tran).toFixed(2)}). Admin chỉnh trần ở trang Dự án video.`);
  }
}

/** Ghi chi phí: purpose luôn "du-an:<bước>" (tự hiện ở Cài đặt → Chi phí AI, loại "Dự án video"). */
export async function ghiChiPhi(db: SupabaseClient, buoc: string, model: string, usage: TokenUsage, duAnId?: string) {
  await db.from('llm_calls').insert({
    purpose: `du-an:${buoc}`,
    ...(duAnId ? { du_an_id: duAnId } : {}),
    model,
    tokens_in: usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
    tokens_out: usage.output_tokens,
    cost_usd: costOf(model, usage),
  });
}

export const layChu = (msg: Anthropic.Message) =>
  msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
