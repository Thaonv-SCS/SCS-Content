'use server';

import { revalidatePath } from 'next/cache';
import { attachImagesToDescription, descriptionImageCounts, findBySkus, uploadMedia, type UploadedImage } from '@app/products';
import { currentUser } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function team(): Promise<string | null> {
  const me = await currentUser();
  return me && (me.role === 'admin' || me.role === 'staff') ? null : 'Tài khoản chưa được cấp quyền.';
}

export type FolderMatch = {
  folder: string;
  product: { id: number; name: string; sku: string; status: string; permalink: string; images: number } | null;
};

/**
 * Tên thư mục → mã trên web. Thử cả tên đầy đủ lẫn từng cụm trong tên
 * ("FQ8687-446 xanh" → thử "FQ8687-446 xanh", "FQ8687-446", "xanh").
 */
export async function matchFolders(folders: string[]): Promise<Result<FolderMatch[]>> {
  const denied = await team();
  if (denied) return { ok: false, error: denied };
  if (folders.length > 100) return { ok: false, error: 'Tối đa 100 thư mục mỗi lần.' };
  const candidates = (f: string) => [f.trim(), ...f.split(/[\s_]+/).filter((x) => x.length >= 4)];
  try {
    const { items } = await findBySkus([...new Set(folders.flatMap(candidates))]);
    const bySku = new Map(items.map((p) => [p.sku.toLowerCase(), p]));
    const counts = await descriptionImageCounts(items.map((p) => p.id));
    return {
      ok: true,
      data: folders.map((folder) => {
        const p = candidates(folder).map((c) => bySku.get(c.toLowerCase())).find(Boolean);
        return {
          folder,
          product: p ? { id: p.id, name: p.name, sku: p.sku, status: p.status, permalink: p.permalink, images: counts.get(p.id) ?? 0 } : null,
        };
      }),
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Up một ảnh (đã thu nhỏ ở trình duyệt). Mỗi lần gọi một ảnh → không bị giới hạn thời gian / dung lượng. */
export async function uploadOne(form: FormData): Promise<Result<UploadedImage>> {
  const denied = await team();
  if (denied) return { ok: false, error: denied };
  const file = form.get('file');
  const productId = Number(form.get('productId'));
  if (!(file instanceof Blob) || !productId) return { ok: false, error: 'Thiếu ảnh hoặc sản phẩm.' };
  if (file.size > 3 * 1024 * 1024) return { ok: false, error: 'Ảnh quá lớn sau khi thu nhỏ (> 3MB).' };
  try {
    return { ok: true, data: await uploadMedia(file, String(form.get('filename') ?? 'anh.jpg'), String(form.get('alt') ?? ''), productId) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Chèn các ảnh đã up vào cuối mô tả (hoặc thay toàn bộ ảnh cũ), ghi lịch sử. */
export async function attachToProduct(
  product: { id: number; sku: string; name: string },
  images: UploadedImage[],
  mode: 'append' | 'replace',
): Promise<Result<{ before: number; after: number }>> {
  const denied = await team();
  if (denied) return { ok: false, error: denied };
  if (!images.length) return { ok: false, error: 'Chưa có ảnh nào up thành công.' };
  try {
    const r = await attachImagesToDescription(product.id, images, mode);
    const supabase = await supabaseServer();
    await supabase.from('image_uploads').insert({
      woo_id: product.id,
      sku: product.sku,
      name: product.name,
      mode,
      added: images.length,
      images_before: r.before,
      images_after: r.after,
      media_ids: images.map((i) => i.id),
    });
    return { ok: true, data: r };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function refreshImagesHistory() {
  revalidatePath('/images');
}
