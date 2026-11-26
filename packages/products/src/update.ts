/**
 * Đẩy lại nội dung lên sản phẩm ĐÃ CÓ trên web (nháp app tạo, hoặc sản phẩm cũ trùng SKU).
 * - 'cap-nhat': ghi đè chữ từ app, GIỮ ảnh (và video tự chèn tay) đang có trong mô tả trên web → nối xuống cuối.
 * - 'thay-the': mô tả trên web thay toàn bộ bằng bản trong app.
 * Không bao giờ đổi: trạng thái (nháp / đã đăng), ảnh đại diện + gallery, SKU; slug chỉ đổi khi sản phẩm còn là nháp.
 * Thuộc tính khác trên web (vd Màu) được giữ, chỉ thay "Chọn Size" / "Loại Đinh".
 */
import { boVideo, datVideo, videoTrongMoTa, type VideoLink } from './video.ts';
import { WOO_URL, detectBrand, thuocTinh, truongNoiDung, wc, type DraftInput } from './woo.ts';

export type KieuDayLai = 'cap-nhat' | 'thay-the';

export interface SanPhamWeb {
  id: number;
  name: string;
  status: string;
  permalink: string;
  edit_url: string;
  /** mô tả trên web có chữ / ảnh không (trống thì đẩy lại = thêm mới) */
  co_noi_dung: boolean;
  so_anh_mo_ta: number;
}

const giaiMa = (s: string) => s.replace(/&#8211;/g, '–').replace(/&#8217;/g, '’').replace(/&amp;/g, '&').replace(/&quot;/g, '"');

/** Khối ảnh / video trong mô tả (giữ nguyên HTML, theo thứ tự xuất hiện). */
export function khoiAnhVideo(html: string): string[] {
  const re =
    /\[caption[^\]]*\][\s\S]*?\[\/caption\]|<div[^>]*wp-caption[^>]*>[\s\S]*?<\/div>|<div style="text-align: center;">\s*<iframe[\s\S]*?<\/iframe>\s*<\/div>|<p style="text-align: center;">\s*https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|tiktok\.com)\/[^\s<]+\s*<\/p>|<iframe[\s\S]*?<\/iframe>|<p[^>]*>\s*(?:<a[^>]*>\s*)?<img[^>]*>(?:\s*<\/a>)?\s*<\/p>|(?:<a[^>]*>\s*)?<img[^>]*>(?:\s*<\/a>)?/gi;
  return html.match(re) ?? [];
}

/** Tìm sản phẩm trên web: theo id app đã lưu (nếu còn), không thì theo SKU. */
export async function timTrenWeb(wooId: number | null, sku: string | null): Promise<SanPhamWeb | null> {
  type Raw = { id: number; name: string; status: string; permalink: string; description: string };
  const f = '_fields=id,name,status,permalink,description&context=edit';
  let p: Raw | undefined;
  if (wooId) {
    try {
      p = await wc<Raw>('GET', `/products/${wooId}?${f}`);
      if (p.status === 'trash') p = undefined;
    } catch {
      p = undefined; // đã bị xóa hẳn trên web
    }
  }
  if (!p && sku) {
    const ds = await wc<Raw[]>('GET', `/products?sku=${encodeURIComponent(sku)}&status=any&${f}`);
    p = ds.find((x) => x.status !== 'trash');
  }
  if (!p) return null;
  const chu = p.description.replace(/<[^>]+>|\[[^\]]+\]|&nbsp;/g, ' ').trim();
  return {
    id: p.id,
    name: giaiMa(p.name),
    status: p.status,
    permalink: p.permalink,
    edit_url: `${WOO_URL}/wp-admin/post.php?post=${p.id}&action=edit`,
    co_noi_dung: !!chu || khoiAnhVideo(p.description).length > 0,
    so_anh_mo_ta: (p.description.match(/<img[\s>]/gi) ?? []).length,
  };
}

export async function capNhatSanPham(
  wooId: number,
  input: DraftInput,
  kieu: KieuDayLai,
  /** app có chèn video riêng → bỏ video cũ trên web để khỏi trùng */
  coVideoApp: boolean,
): Promise<{ brand: string | null; giu_anh: number }> {
  const cu = await wc<{ status: string; description: string; attributes: { id: number; name: string; options: string[]; visible: boolean }[] }>(
    'GET',
    `/products/${wooId}?context=edit&_fields=status,description,attributes`,
  );
  let description = input.description_html;
  let giu = 0;
  if (kieu === 'cap-nhat') {
    // giữ ảnh / video trên web mà bản app chưa có (so theo link ảnh / link video)
    const daCo = new Set((description.match(/(?:src|href)="([^"]+)"/gi) ?? []).map((x) => x.toLowerCase()));
    const nguon = coVideoApp ? boVideo(cu.description) : cu.description;
    const them = khoiAnhVideo(nguon).filter((k) => {
      const src = k.match(/src="([^"]+)"/i)?.[0]?.toLowerCase();
      const link = k.match(/https?:\/\/[^\s<"]+/)?.[0]?.toLowerCase();
      if (!src && link) return !description.toLowerCase().includes(link); // video dạng link
      return !src || !daCo.has(src);
    });
    giu = them.length;
    if (them.length) description = `${description.trimEnd()}\n${them.join('\n')}`;
  }
  const moi = await thuocTinh(input);
  const idMoi = new Set(moi.map((a) => a.id).filter(Boolean));
  const tenMoi = new Set(moi.map((a) => a.name?.toLowerCase()).filter(Boolean));
  const attributes = [
    ...cu.attributes.filter((a) => !(a.id ? idMoi.has(a.id) : tenMoi.has(a.name.toLowerCase()))),
    ...moi,
  ];
  const brand = await detectBrand(input.name);
  await wc('POST', `/products/${wooId}`, {
    ...(await truongNoiDung({ ...input, description_html: description }, attributes, brand)),
    // đổi slug sản phẩm đã đăng sẽ làm hỏng link cũ (Google, bài đã chia sẻ) → chỉ đổi khi còn nháp
    ...(cu.status === 'publish' ? {} : { slug: input.slug }),
  });
  return { brand: brand?.name ?? null, giu_anh: giu };
}

// ───────────── Video theo SKU (menu Up ảnh) ─────────────

/** Video đang nhúng trong mô tả của các sản phẩm. */
export async function videoCuaSanPham(ids: number[]): Promise<Map<number, VideoLink[]>> {
  const ra = new Map<number, VideoLink[]>();
  for (let i = 0; i < ids.length; i += 50) {
    const rows = await wc<{ id: number; description: string }[]>(
      'GET',
      `/products?per_page=100&context=edit&status=any&include=${ids.slice(i, i + 50).join(',')}&_fields=id,description`,
    );
    rows.forEach((r) => ra.set(r.id, videoTrongMoTa(r.description)));
  }
  return ra;
}

/** Chèn video vào mô tả trên web: 'them' giữ video cũ, 'thay' bỏ hết video cũ. Chỉ đổi ô mô tả. */
export async function ganVideo(wooId: number, links: string[], kieu: 'them' | 'thay'): Promise<{ them: number; bo: number }> {
  const p = await wc<{ description: string }>('GET', `/products/${wooId}?context=edit&_fields=description`);
  const r = datVideo(p.description, links, kieu);
  if (r.them || r.bo) await wc('POST', `/products/${wooId}`, { description: r.html });
  return { them: r.them, bo: r.bo };
}
