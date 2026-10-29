'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';

export async function setEnabled(id: string, enabled: boolean) {
  const supabase = await supabaseServer();
  await supabase.from('sources').update({ enabled }).eq('id', id);
  revalidatePath('/sources');
}

export async function setWeight(form: FormData) {
  const weight = Math.min(1, Math.max(0, Number(form.get('weight'))));
  if (!Number.isFinite(weight)) return;
  const supabase = await supabaseServer();
  await supabase.from('sources').update({ weight }).eq('id', String(form.get('id')));
  revalidatePath('/sources');
}
