'use server';

import { revalidatePath } from 'next/cache';
import { captionHash, SHORT_CAPTION_MAX, type StyleNotes } from '@app/core';
import { supabaseServer } from '@/lib/supabase';

/** Dán nhiều caption một lúc, ngăn cách bằng một dòng chỉ có "---". */
export async function addCaptions(_prev: string | null, form: FormData): Promise<string | null> {
  const texts = String(form.get('captions') ?? '')
    .split(/^\s*-{3,}\s*$/m)
    .map((t) => t.trim())
    .filter((t) => t.length >= 10);
  if (!texts.length) return 'Chưa có caption nào (mỗi caption tối thiểu 10 ký tự).';

  const unique = [...new Map(texts.map((t) => [captionHash(t), t])).entries()];
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('captions')
    .upsert(
      unique.map(([hash, text]) => ({
        text,
        text_hash: hash,
        source: 'page',
        kind: text.length <= SHORT_CAPTION_MAX ? 'short' : 'long',
      })),
      { onConflict: 'text_hash', ignoreDuplicates: true },
    )
    .select('id');
  if (error) return `Lỗi: ${error.message}`;

  revalidatePath('/captions');
  const added = data?.length ?? 0;
  return `Đã thêm ${added} caption${texts.length > added ? ` (bỏ qua ${texts.length - added} caption trùng)` : ''}.`;
}

export async function deleteCaption(id: string) {
  const supabase = await supabaseServer();
  await supabase.from('captions').delete().eq('id', id);
  revalidatePath('/captions');
}

export async function saveStyleNotes(form: FormData) {
  const supabase = await supabaseServer();
  const { data: current } = await supabase.from('settings').select('value').eq('key', 'style_notes').maybeSingle();
  const { count } = await supabase.from('captions').select('*', { count: 'exact', head: true });
  const notes: StyleNotes = {
    text: String(form.get('notes') ?? '').trim(),
    updated_at: new Date().toISOString(),
    caption_count: (current?.value as StyleNotes | undefined)?.caption_count ?? count ?? 0,
    edited_by_admin: true,
  };
  await supabase.from('settings').upsert({ key: 'style_notes', value: notes, updated_at: notes.updated_at });
  revalidatePath('/captions');
}
