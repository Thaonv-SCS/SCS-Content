'use server';

import { revalidatePath } from 'next/cache';
import { detectSource, previewSource, type DetectResult, type SourcePreview } from '@app/connectors';
import type { CategoryHint, SourceKind } from '@app/core';
import { supabaseServer } from '@/lib/supabase';

/** Loại nguồn mày tự thêm / sửa được trong app. Các loại khác (html, x, match_api) cần code riêng. */
const EDITABLE_KINDS: SourceKind[] = ['rss', 'sitemap'];

export type DetectState = (DetectResult & { input: string }) | null;

export async function detect(_prev: DetectState, form: FormData): Promise<DetectState> {
  const input = String(form.get('link') ?? '').trim();
  if (!input) return { input, ok: false, message: 'Dán link trang web vào đã.' };
  return { input, ...(await detectSource(input)) };
}

type Fields = {
  name: string;
  kind: SourceKind;
  url: string;
  category_hint: CategoryHint;
  weight: number;
  note: string | null;
  config: Record<string, unknown> | null;
};

/** Đọc và kiểm tra form; trả về lỗi (string) nếu dữ liệu không hợp lệ. */
function readFields(form: FormData): Fields | string {
  const name = String(form.get('name') ?? '').trim();
  const url = String(form.get('url') ?? '').trim();
  const kind = String(form.get('kind') ?? '') as SourceKind;
  const include = String(form.get('include') ?? '').trim();
  const maxNew = Number(form.get('maxNew') || 20);

  if (!name) return 'Thiếu tên nguồn.';
  if (!/^https?:\/\/\S+$/i.test(url)) return 'Link nguồn phải bắt đầu bằng http:// hoặc https://';
  if (!EDITABLE_KINDS.includes(kind)) return 'Loại nguồn phải là RSS hoặc sitemap.';
  if (include) {
    try {
      new RegExp(include);
    } catch {
      return `Bộ lọc link "${include}" không hợp lệ.`;
    }
  }
  return {
    name,
    url,
    kind,
    category_hint: String(form.get('category_hint') || 'mixed') as CategoryHint,
    weight: Math.min(1, Math.max(0, Number(form.get('weight')) || 0.5)),
    note: String(form.get('note') ?? '').trim() || null,
    config: kind === 'sitemap' ? { ...(include ? { include } : {}), maxNew: Math.min(50, Math.max(1, maxNew)) } : null,
  };
}

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'nguon';

export async function createSource(_prev: string | null, form: FormData): Promise<string | null> {
  const fields = readFields(form);
  if (typeof fields === 'string') return fields;

  const supabase = await supabaseServer();
  const { data: dup } = await supabase.from('sources').select('name').eq('url', fields.url).maybeSingle();
  if (dup) return `Nguồn này đã có: "${dup.name}".`;

  const { data: existing } = await supabase.from('sources').select('slug');
  const taken = new Set((existing ?? []).map((r) => r.slug));
  const base = slugify(fields.name);
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;

  const { error } = await supabase.from('sources').insert({ ...fields, slug, enabled: true });
  if (error) return `Lỗi lưu nguồn: ${error.message}`;
  revalidatePath('/sources');
  return null;
}

export async function updateSource(id: string, _prev: string | null, form: FormData): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data: current } = await supabase.from('sources').select('kind').eq('id', id).single();

  // Nguồn loại đặc biệt (football-data, X…): chỉ sửa tên, ngăn, trọng số, ghi chú
  if (current && !EDITABLE_KINDS.includes(current.kind)) {
    const { error } = await supabase
      .from('sources')
      .update({
        name: String(form.get('name') ?? '').trim(),
        category_hint: String(form.get('category_hint') || 'mixed'),
        weight: Math.min(1, Math.max(0, Number(form.get('weight')) || 0.5)),
        note: String(form.get('note') ?? '').trim() || null,
      })
      .eq('id', id);
    if (error) return `Lỗi: ${error.message}`;
  } else {
    const fields = readFields(form);
    if (typeof fields === 'string') return fields;
    // Đổi link / cách lấy thì xóa lỗi cũ để trạng thái phản ánh đúng lần chạy sau
    const { error } = await supabase.from('sources').update({ ...fields, last_error: null, fail_count: 0 }).eq('id', id);
    if (error) return `Lỗi: ${error.message}`;
  }
  revalidatePath('/sources');
  return null;
}

/** Xóa nguồn. Bài đã lấy từ nguồn này vẫn giữ (raw_items.source_id → null). */
export async function deleteSource(id: string) {
  const supabase = await supabaseServer();
  await supabase.from('sources').delete().eq('id', id);
  revalidatePath('/sources');
}

export async function testSource(id: string): Promise<{ preview?: SourcePreview; error?: string }> {
  const supabase = await supabaseServer();
  const { data: s } = await supabase.from('sources').select('kind,url,config').eq('id', id).single();
  if (!s) return { error: 'Không tìm thấy nguồn.' };
  try {
    return { preview: await previewSource({ kind: s.kind, url: s.url, config: s.config ?? undefined }) };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function setEnabled(id: string, enabled: boolean) {
  const supabase = await supabaseServer();
  await supabase.from('sources').update({ enabled }).eq('id', id);
  revalidatePath('/sources');
}
