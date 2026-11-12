/**
 * Up ảnh chụp thật vào phần mô tả sản phẩm (đúng cách nhân viên đang làm trong trình soạn thảo WordPress):
 * ảnh vào Thư viện Media, rồi chèn <p><img class="aligncenter size-large wp-image-ID" …></p> xuống cuối mô tả.
 * Up ảnh cần Mật khẩu ứng dụng WordPress (WP_APP_USER / WP_APP_PASSWORD) — khóa WooCommerce không có quyền up.
 * Không đụng ảnh thumb (ảnh chính) của sản phẩm.
 */
import { WOO_URL, wc } from './woo.ts';

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; SoccerstoreContentApp/0.1)' };

function wpAuth(): string {
  const user = process.env.WP_APP_USER?.trim();
  const pass = process.env.WP_APP_PASSWORD?.trim();
  if (!user || !pass) throw new Error('Chưa cấu hình WP_APP_USER / WP_APP_PASSWORD (Mật khẩu ứng dụng WordPress).');
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}

export interface UploadedImage {
  id: number;
  url: string;
  width: number;
  height: number;
}

/** Up một ảnh (đã thu nhỏ ở trình duyệt) vào Thư viện Media, gắn với sản phẩm. */
export async function uploadMedia(file: Blob, filename: string, alt: string, productId: number): Promise<UploadedImage> {
  const fd = new FormData();
  fd.append('file', file, filename);
  fd.append('alt_text', alt);
  fd.append('title', filename.replace(/\.[a-z]+$/i, ''));
  fd.append('post', String(productId));
  const res = await fetch(`${WOO_URL}/wp-json/wp/v2/media`, {
    method: 'POST',
    headers: { ...UA, Authorization: wpAuth() },
    body: fd,
    signal: AbortSignal.timeout(60_000),
  });
  const j = (await res.json().catch(() => null)) as {
    id?: number;
    source_url?: string;
    media_details?: { width?: number; height?: number; sizes?: Record<string, { source_url: string; width: number; height: number }> };
    message?: string;
  } | null;
  if (!res.ok || !j?.id) {
    const hint = res.status === 403 && !j?.message ? ' (có thể bị Cloudflare chặn)' : '';
    throw new Error(`Up ảnh lỗi ${res.status}: ${j?.message ?? 'không rõ'}${hint}`);
  }
  // Ảnh đã thu nhỏ còn 1024px → bản gốc chính là cỡ "large" mà trình soạn thảo hay chèn
  const large = j.media_details?.sizes?.large;
  return large
    ? { id: j.id, url: large.source_url, width: large.width, height: large.height }
    : { id: j.id, url: j.source_url!, width: j.media_details?.width ?? 1024, height: j.media_details?.height ?? 0 };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Đúng khung trình soạn thảo cổ điển của WordPress đang tạo ra trên web. */
export function imageBlock(img: UploadedImage, alt: string): string {
  return `<p><img class="aligncenter size-large wp-image-${img.id}" src="${esc(img.url)}" alt="${esc(alt)}" width="${img.width}" height="${img.height}" /></p>`;
}

/** Bỏ mọi ảnh trong mô tả (ảnh thường, khung chú thích kiểu cũ, ảnh photobucket) — giữ nguyên chữ và bảng. */
export function stripImages(html: string): string {
  return html
    .replace(/\[caption[^\]]*\][\s\S]*?\[\/caption\]/gi, '')
    .replace(/<div[^>]*wp-caption[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<p[^>]*>\s*(<a[^>]*>\s*)?<img[^>]*>(\s*<\/a>)?\s*<\/p>/gi, '')
    .replace(/(<a[^>]*>\s*)?<img[^>]*>(\s*<\/a>)?/gi, '')
    .replace(/<p[^>]*>(\s|&nbsp;)*<\/p>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const countImages = (html: string) => (html.match(/<img[\s>]/gi) ?? []).length;

/** Số ảnh đang có trong mô tả của các sản phẩm. */
export async function descriptionImageCounts(ids: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  for (let i = 0; i < ids.length; i += 50) {
    const rows = await wc<{ id: number; description: string }[]>(
      'GET',
      `/products?per_page=100&context=edit&status=any&include=${ids.slice(i, i + 50).join(',')}&_fields=id,description`,
    );
    rows.forEach((r) => out.set(r.id, countImages(r.description)));
  }
  return out;
}

/** Chèn ảnh xuống cuối mô tả (thêm), hoặc bỏ hết ảnh cũ rồi chèn (thay). Chỉ đổi ô mô tả. */
export async function attachImagesToDescription(
  productId: number,
  images: UploadedImage[],
  mode: 'append' | 'replace',
): Promise<{ before: number; after: number }> {
  const p = await wc<{ id: number; name: string; description: string }>('GET', `/products/${productId}?context=edit&_fields=id,name,description`);
  const base = mode === 'replace' ? stripImages(p.description) : p.description.trimEnd();
  const alt = p.name.replace(/&#8211;/g, '–').replace(/&amp;/g, '&');
  const description = `${base}\n${images.map((img) => imageBlock(img, alt)).join('\n')}`;
  await wc('POST', `/products/${productId}`, { description });
  return { before: countImages(p.description), after: countImages(description) };
}
