'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';

export async function saveSettings(form: FormData) {
  const num = (key: string, min: number, max: number) => Math.min(max, Math.max(min, Number(form.get(key)) || 0));
  const rows = [
    { key: 'schedule_enabled', value: form.get('schedule_enabled') === 'on' },
    { key: 'auto_pause_days', value: Math.round(num('auto_pause_days', 0, 30)) },
    { key: 'daily_budget_usd', value: num('daily_budget_usd', 0, 20) },
  ].map((r) => ({ ...r, updated_at: new Date().toISOString() }));

  const supabase = await supabaseServer();
  await supabase.from('settings').upsert(rows, { onConflict: 'key' });
  revalidatePath('/settings');
}

/** Mốc số dư Claude do admin nhập từ console (Anthropic không có API đọc số dư) → app tự trừ chi phí ghi được từ mốc. */
export async function luuSoDuClaude(form: FormData) {
  const so = (k: string) => Number(String(form.get(k) ?? '').replace(',', '.'));
  const soDu = so('so_du');
  const thamChieu = so('tham_chieu');
  if (!(soDu >= 0)) return;
  const supabase = await supabaseServer();
  await supabase.from('settings').upsert(
    {
      key: 'so_du_claude',
      value: { so_du: soDu, tham_chieu: thamChieu > 0 ? Math.max(thamChieu, soDu) : soDu, luc: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  );
  revalidatePath('/settings');
}
