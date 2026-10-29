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
