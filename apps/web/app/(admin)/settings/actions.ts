'use server';

import { kiemAdmin } from '@/lib/auth';

import { revalidatePath } from 'next/cache';
import { DS_MO_HINH, DS_SUY_NGHI, VIEC_AI, type CauHinhMoHinh, type MucSuyNghi } from '@app/core';
import { supabaseServer } from '@/lib/supabase';

export async function saveSettings(form: FormData) {
  if (await kiemAdmin()) return;
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

/** Cài đặt → Mô hình AI: lưu mô hình + mức suy nghĩ cho từng việc. */
export async function luuMoHinh(form: FormData) {
  if (await kiemAdmin()) return;
  const value: Record<string, CauHinhMoHinh> = {};
  for (const v of VIEC_AI) {
    const model = String(form.get(`model_${v.ma}`) ?? '');
    const effort = String(form.get(`effort_${v.ma}`) ?? '') as MucSuyNghi;
    if (DS_MO_HINH.some((m) => m.ma === model) && DS_SUY_NGHI.some((s) => s.ma === effort)) value[v.ma] = { model, effort };
  }
  const supabase = await supabaseServer();
  await supabase.from('settings').upsert({ key: 'mo_hinh_ai', value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  revalidatePath('/settings');
}

/** Mốc số dư Claude do admin nhập từ console (Anthropic không có API đọc số dư) → app tự trừ chi phí ghi được từ mốc. */
export async function luuSoDuClaude(form: FormData) {
  if (await kiemAdmin()) return;
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
