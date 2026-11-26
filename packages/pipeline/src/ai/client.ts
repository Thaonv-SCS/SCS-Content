import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { costOf, moHinhCho, type CauHinhMoHinh, type TokenUsage } from '@app/core';

export const anthropic = new Anthropic();

/** Model rẻ cho việc khối lượng lớn (phân loại, gom cụm), model mạnh cho việc viết. Đổi được qua .env. */
export const MODELS = {
  classify: process.env.CLASSIFY_MODEL || 'claude-haiku-5-5',
  write: process.env.WRITE_MODEL || 'claude-opus-5-5',
};

type Usage = TokenUsage;

export class BudgetExceededError extends Error {}

/** Ghi mọi lần gọi AI vào bảng llm_calls và chặn khi vượt trần chi phí trong ngày (giờ VN). */
export class Budget {
  private spent = 0;

  constructor(
    private db: SupabaseClient,
    readonly dailyLimitUsd = Number(process.env.DAILY_BUDGET_USD || 3),
  ) {}

  async init() {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
    const { data, error } = await this.db
      .from('llm_calls')
      .select('cost_usd')
      .is('job_id', null) // tiền video có trần riêng (video_tran_ngay_usd), không tính vào trần bản tin
      .not('purpose', 'like', 'du-an:%') // Dự án video cũng có trần riêng (du_an_tran_ngay_usd)
      .gte('created_at', new Date(`${today}T00:00:00+07:00`).toISOString());
    if (error) throw error;
    this.spent = (data ?? []).reduce((s, r: { cost_usd: number | string }) => s + Number(r.cost_usd), 0);
  }

  private moHinhCaiDat: Promise<unknown> | null = null;

  /** Mô hình + mức suy nghĩ cho một việc theo Cài đặt → Mô hình AI (đọc settings 1 lần mỗi lần chạy). */
  async moHinh(ma: string): Promise<CauHinhMoHinh> {
    this.moHinhCaiDat ??= Promise.resolve(this.db.from('settings').select('value').eq('key', 'mo_hinh_ai').maybeSingle()).then((r) => r.data?.value ?? null);
    return moHinhCho(ma, await this.moHinhCaiDat);
  }

  get spentToday() {
    return this.spent;
  }

  assertAvailable() {
    if (this.spent >= this.dailyLimitUsd) {
      throw new BudgetExceededError(`Đã chạm trần $${this.dailyLimitUsd}/ngày (đã dùng $${this.spent.toFixed(3)})`);
    }
  }

  async record(purpose: string, model: string, usage: Usage) {
    const cost = costOf(model, usage);
    this.spent += cost;
    await this.db.from('llm_calls').insert({
      purpose,
      model,
      tokens_in: usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
      tokens_out: usage.output_tokens,
      cost_usd: cost,
    });
    return cost;
  }
}
