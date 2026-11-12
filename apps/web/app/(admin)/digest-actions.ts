'use server';

import { revalidatePath } from 'next/cache';
import { captionHash, SHORT_CAPTION_MAX } from '@app/core';
import { supabaseServer } from '@/lib/supabase';

export type EditableFields = {
  title_vi: string;
  summary_vi: string;
  caption_long: string;
  caption_short: string;
};

export async function decide(suggestionId: string, action: 'pick' | 'skip', tags: string[]) {
  const supabase = await supabaseServer();
  await supabase.from('suggestions').update({ status: action === 'pick' ? 'picked' : 'skipped' }).eq('id', suggestionId);
  await supabase.from('feedback').insert({ suggestion_id: suggestionId, action, tags });
  revalidatePath('/');
}

/**
 * Lưu bản sửa, giữ lại cả bản trước và bản sau.
 * Caption đã sửa được đưa vào kho caption làm mẫu giọng văn (bản sửa mới thay bản sửa cũ của cùng gợi ý).
 */
export async function saveEdit(suggestionId: string, after: EditableFields, tags: string[]) {
  const supabase = await supabaseServer();
  const { data: before } = await supabase
    .from('suggestions')
    .select('title_vi,summary_vi,caption_long,caption_short,slot')
    .eq('id', suggestionId)
    .single();
  await supabase.from('suggestions').update(after).eq('id', suggestionId);
  await supabase.from('feedback').insert({ suggestion_id: suggestionId, action: 'edit', tags, before, after });

  const changed = (['caption_long', 'caption_short'] as const)
    .filter((k) => after[k].trim() && after[k].trim() !== (before?.[k] ?? '').trim())
    .map((k) => after[k].trim());
  if (changed.length) {
    await supabase.from('captions').delete().eq('suggestion_id', suggestionId).eq('source', 'edited');
    await supabase.from('captions').upsert(
      changed.map((text) => ({
        text,
        text_hash: captionHash(text),
        source: 'edited',
        suggestion_id: suggestionId,
        kind: text.length <= SHORT_CAPTION_MAX ? 'short' : 'long',
        category: before?.slot ?? null,
      })),
      { onConflict: 'text_hash', ignoreDuplicates: true },
    );
  }
  revalidatePath('/');
}

export async function undo(suggestionId: string) {
  const supabase = await supabaseServer();
  await supabase.from('suggestions').update({ status: 'new' }).eq('id', suggestionId);
  revalidatePath('/');
}
