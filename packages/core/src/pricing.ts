/** $ / 1 triệu token (input, output). Cache write ×1.25, cache read ×0.1 giá input. */
const PRICES: Record<string, { in: number; out: number }> = {
  'claude-haiku-5-5': { in: 0.1, out: 0.5 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-opus-5-5': { in: 4, out: 20 },
  'claude-opus-4-8': { in: 5, out: 25 },
};

/** Phí tìm kiếm web của Claude: $10 / 1.000 lượt. */
export const WEB_SEARCH_COST_USD = 0.01;

export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export function costOf(model: string, u: TokenUsage): number {
  const p = PRICES[model] ?? PRICES['claude-opus-5-5']!;
  const input = u.input_tokens + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1;
  return (input * p.in + u.output_tokens * p.out) / 1_000_000;
}
