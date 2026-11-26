'use server';

import { revalidatePath } from 'next/cache';
import {
  attachImagesToDescription,
  canGiaiLink,
  descriptionImageCounts,
  featuredImages,
  findBySkus,
  ganVideo,
  parseVideoLink,
  setFeaturedImage,
  uploadMedia,
  videoCuaSanPham,
  type UploadedImage,
} from '@app/products';
import { currentUser } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function team(): Promise<string | null> {
  const me = await currentUser();
  return me && (me.role === 'admin' || me.role === 'staff') ? null : 'Tài khoản chưa được cấp quyền.';
}

/** Alt ảnh viết trong app (Post sản phẩm) theo SKU — không có thì để tên sản phẩm. */
async function altTheoSku(skus: string[]): Promise<Map<string, string>> {
  const ra = new Map<string, string>();
  if (!skus.length) return ra;
  const supabase = await supabaseServer();
  const { data } = await supabase.from('products').select('sku,output,updated_at').in('sku', skus).order('updated_at', { ascending: true });
  for (const r of data ?? []) {
    const alt = (r.output as { image_alt?: string } | null)?.image_alt?.trim();
    if (alt && r.sku) ra.set(String(r.sku).toLowerCase(), alt); // bản sửa mới nhất ghi sau cùng
  }
  return ra;
}

export type FolderMatch = {
  folder: string;
  product: { id: number; name: string; sku: string; status: string; permalink: string; images: number; alt: string; altApp: boolean } | null;
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
    const alts = await altTheoSku(items.map((p) => p.sku));
    return {
      ok: true,
      data: folders.map((folder) => {
        const p = candidates(folder).map((c) => bySku.get(c.toLowerCase())).find(Boolean);
        return {
          folder,
          product: p
            ? {
                id: p.id, name: p.name, sku: p.sku, status: p.status, permalink: p.permalink, images: counts.get(p.id) ?? 0,
                alt: alts.get(p.sku.toLowerCase()) ?? p.name, altApp: alts.has(p.sku.toLowerCase()),
              }
            : null,
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
  product: { id: number; sku: string; name: string; alt?: string },
  images: UploadedImage[],
  mode: 'append' | 'replace',
): Promise<Result<{ before: number; after: number }>> {
  const denied = await team();
  if (denied) return { ok: false, error: denied };
  if (!images.length) return { ok: false, error: 'Chưa có ảnh nào up thành công.' };
  try {
    const r = await attachImagesToDescription(product.id, images, mode, product.alt);
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

// ───────────── Ảnh đại diện (thumb) ─────────────

export type ThumbMatch = {
  /** tên file (không đuôi) */
  file: string;
  product: { id: number; name: string; sku: string; status: string; permalink: string; thumb: string | null; alt: string; altApp: boolean } | null;
};

/** "BAR2627-TI-1" / "BAR2627-TI (1)" / "bar2627-ti_2" → thử cả tên đầy đủ lẫn tên đã bỏ đuôi số. */
const ungVienSku = (f: string) => {
  const t = f.trim();
  const bo = t.replace(/\s*\(\d+\)$/, '').replace(/[-_ ]\d{1,2}$/, '').replace(/[-_ ]+$/, '');
  return [...new Set([t, bo].filter(Boolean))];
};

/** Tên file ảnh → sản phẩm có SKU đó trên web, kèm ảnh đại diện hiện tại. */
export async function matchThumbs(files: string[]): Promise<Result<ThumbMatch[]>> {
  const denied = await team();
  if (denied) return { ok: false, error: denied };
  if (files.length > 300) return { ok: false, error: 'Tối đa 300 ảnh mỗi lần.' };
  try {
    const { items } = await findBySkus([...new Set(files.flatMap(ungVienSku))]);
    const bySku = new Map(items.map((p) => [p.sku.toLowerCase(), p]));
    const thumbs = await featuredImages(items.map((p) => p.id));
    const alts = await altTheoSku(items.map((p) => p.sku));
    return {
      ok: true,
      data: files.map((file) => {
        const p = ungVienSku(file).map((c) => bySku.get(c.toLowerCase())).find(Boolean);
        return {
          file,
          product: p
            ? {
                id: p.id, name: p.name, sku: p.sku, status: p.status, permalink: p.permalink, thumb: thumbs.get(p.id)?.preview ?? null,
                alt: alts.get(p.sku.toLowerCase()) ?? p.name, altApp: alts.has(p.sku.toLowerCase()),
              }
            : null,
        };
      }),
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Up một ảnh gốc vào Thư viện Media rồi đặt làm ảnh đại diện (giữ gallery), ghi lịch sử. */
export async function setThumb(form: FormData): Promise<Result<{ cu: number | null }>> {
  const denied = await team();
  if (denied) return { ok: false, error: denied };
  const file = form.get('file');
  const product = { id: Number(form.get('productId')), sku: String(form.get('sku') ?? ''), name: String(form.get('name') ?? '') };
  if (!(file instanceof Blob) || !product.id) return { ok: false, error: 'Thiếu ảnh hoặc sản phẩm.' };
  if (file.size > 4 * 1024 * 1024) return { ok: false, error: 'Ảnh quá lớn (> 4MB).' };
  try {
    const alt = String(form.get('alt') ?? '').trim() || product.name;
    const img = await uploadMedia(file, String(form.get('filename') ?? `${product.sku}.png`), alt, product.id);
    const { cu } = await setFeaturedImage(product.id, img.id);
    const supabase = await supabaseServer();
    // Lịch sử không bắt buộc: chưa chạy migration 0023 thì vẫn đổi ảnh được
    await supabase.from('image_uploads').insert({
      woo_id: product.id,
      sku: product.sku,
      name: product.name,
      mode: 'thumb',
      added: 1,
      images_before: cu ? 1 : 0,
      images_after: 1,
      media_ids: [img.id],
      thumb_cu: cu,
    });
    return { ok: true, data: { cu } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ───────────── Video theo SKU ─────────────

export type VideoRow = {
  sku: string;
  links: { url: string; ok: boolean; coSan: boolean }[];
  product: { id: number; name: string; sku: string; status: string; permalink: string; soVideo: number } | null;
};

/** "SKU | link" mỗi dòng (dán từ Excel: SKU một cột, link cột bên cạnh). Một SKU nhiều video = nhiều dòng. */
export async function matchVideos(text: string): Promise<Result<{ rows: VideoRow[]; loi: string[] }>> {
  const denied = await team();
  if (denied) return { ok: false, error: denied };
  const loi: string[] = [];
  const nhom = new Map<string, { sku: string; links: string[] }>();
  for (const dong of text.split('\n').map((d) => d.trim()).filter(Boolean)) {
    const urls = dong.match(/(?:https?:\/\/)?(?:[\w-]+\.)*(?:youtube\.com|youtu\.be|tiktok\.com)\/[^\s|,;]+/gi) ?? [];
    const sku = dong.split(/[\s|,;\t]+/)[0]!.trim();
    if (!urls.length || !sku || /youtu|tiktok/i.test(sku)) {
      loi.push(dong.slice(0, 80));
      continue;
    }
    const k = sku.toLowerCase();
    const g = nhom.get(k) ?? { sku, links: [] };
    g.links.push(...urls.map((u) => (/^https?:/i.test(u) ? u : `https://${u}`)));
    nhom.set(k, g);
  }
  if (nhom.size > 200) return { ok: false, error: 'Tối đa 200 SKU mỗi lần.' };
  try {
    // link rút gọn TikTok → mở ra lấy link đầy đủ
    for (const g of nhom.values()) {
      g.links = await Promise.all(
        g.links.map(async (l) => {
          if (!canGiaiLink(l)) return l;
          try {
            return (await fetch(l, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15_000) })).url;
          } catch {
            return l;
          }
        }),
      );
    }
    const { items } = await findBySkus([...nhom.values()].map((g) => g.sku));
    const bySku = new Map(items.map((p) => [p.sku.toLowerCase(), p]));
    const coSan = await videoCuaSanPham(items.map((p) => p.id));
    const rows: VideoRow[] = [...nhom.values()].map((g) => {
      const p = bySku.get(g.sku.toLowerCase());
      const cu = new Set((p ? coSan.get(p.id) ?? [] : []).map((v) => v.id));
      return {
        sku: g.sku,
        links: g.links.map((url) => {
          const v = parseVideoLink(url);
          return { url, ok: !!v, coSan: !!v && cu.has(v.id) };
        }),
        product: p
          ? { id: p.id, name: p.name, sku: p.sku, status: p.status, permalink: p.permalink, soVideo: coSan.get(p.id)?.length ?? 0 }
          : null,
      };
    });
    return { ok: true, data: { rows, loi } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Chèn video cho một sản phẩm trên web, ghi lịch sử, và lưu link vào sản phẩm cùng SKU trong app (đẩy lại không mất video). */
export async function applyVideos(
  product: { id: number; sku: string; name: string },
  links: string[],
  kieu: 'them' | 'thay',
): Promise<Result<{ them: number; bo: number }>> {
  const denied = await team();
  if (denied) return { ok: false, error: denied };
  const ok = links.filter((l) => parseVideoLink(l));
  if (!ok.length) return { ok: false, error: 'Không có link video hợp lệ.' };
  try {
    const r = await ganVideo(product.id, ok, kieu);
    const supabase = await supabaseServer();
    if (r.them || r.bo) {
      await supabase.from('image_uploads').insert({
        woo_id: product.id, sku: product.sku, name: product.name, mode: 'video',
        added: r.them, images_before: r.bo, images_after: r.them, media_ids: [],
      });
    }
    const { data: app } = await supabase.from('products').select('id,video_links').eq('sku', product.sku);
    for (const a of app ?? []) {
      const cu = kieu === 'thay' ? [] : ((a.video_links as string[] | null) ?? []);
      const gop = [...cu, ...ok.filter((l) => !cu.includes(l))];
      await supabase.from('products').update({ video_links: gop }).eq('id', a.id);
    }
    return { ok: true, data: r };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
