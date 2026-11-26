/**
 * Chèn video YouTube / TikTok vào mô tả sản phẩm: ngay DƯỚI bảng thông số (bảng đầu tiên; không có bảng thì ở ĐẦU mô tả), căn giữa.
 *
 * Ghi bằng LINK trên một dòng riêng (<p style="text-align: center;">link</p>) — WordPress tự biến link thành trình phát
 * khi hiện trang (oEmbed). KHÔNG ghi <iframe>: tài khoản API không có quyền chèn iframe nên WordPress lọc mất
 * (lỗi 2026-11-26: chỉ còn lại <div style="text-align: center"></div> rỗng).
 * File này không gọi mạng → dùng được cả ở trình duyệt (xem trước). Link rút gọn TikTok được giải ở máy chủ.
 */

export type VideoLink = { kieu: 'youtube' | 'youtube-doc' | 'tiktok'; id: string; /** link chuẩn để WordPress nhúng */ url: string };

/** Đọc link → loại + id + link chuẩn. Không nhận ra thì null. */
export function parseVideoLink(raw: string): VideoLink | null {
  let u: URL;
  try {
    u = new URL(raw.trim().replace(/^\/\//, 'https://'));
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m)\./, '');
  // YouTube (kể cả Shorts) ghi dạng watch?v= — dạng WordPress chắc chắn nhúng được
  const yt = (kieu: VideoLink['kieu'], id: string): VideoLink => ({ kieu, id, url: `https://www.youtube.com/watch?v=${id}` });
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    return id ? yt('youtube', id) : null;
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v');
    if (v) return yt('youtube', v);
    const m = u.pathname.match(/^\/(shorts|embed|live)\/([\w-]{6,})/);
    if (m) return yt(m[1] === 'shorts' ? 'youtube-doc' : 'youtube', m[2]!);
    return null;
  }
  if (host.endsWith('tiktok.com')) {
    const full = u.pathname.match(/^\/(@[^/]+)\/video\/(\d{8,})/);
    if (full) return { kieu: 'tiktok', id: full[2]!, url: `https://www.tiktok.com/${full[1]}/video/${full[2]}` };
    const m = u.pathname.match(/\/(?:video|v|player\/v1)\/(\d{8,})/) ?? u.pathname.match(/^\/embed\/(?:v2\/)?(\d{8,})/);
    return m ? { kieu: 'tiktok', id: m[1]!, url: `https://www.tiktok.com/@soccerstore.vn/video/${m[1]}` } : null;
  }
  return null;
}

/** Link rút gọn của TikTok (vt.tiktok.com, vm.tiktok.com, tiktok.com/t/...) cần mở ra mới thấy id video. */
export const canGiaiLink = (raw: string) => /^(https?:\/\/)?(vt|vm)\.tiktok\.com\/|tiktok\.com\/t\//i.test(raw.trim());

export const embedHtml = (v: VideoLink) => `<p style="text-align: center;">${v.url}</p>`;

/** Ô xám thay video khi xem trước trong app (khung xem trước không chạy được trình phát). */
function oXemTruoc(v: VideoLink): string {
  const ten = v.kieu === 'tiktok' ? 'TikTok' : v.kieu === 'youtube-doc' ? 'YouTube Shorts' : 'YouTube';
  return `<div style="text-align:center;margin:12px 0"><div style="display:inline-block;padding:28px 40px;background:#eee;border:1px dashed #999;border-radius:8px;color:#555">▶ Video ${ten} (${v.id}) — hiện ở đây trên web</div></div>`;
}

const LINK_VIDEO = String.raw`(?:https?:)?\/\/(?:[\w-]+\.)*(?:youtube(?:-nocookie)?\.com|youtu\.be|tiktok\.com)\/[^\s<>"]+`;

/** Bỏ video app đã chèn (kiểu link mới, kiểu iframe cũ, khung rỗng do WordPress lọc iframe) — để đẩy lại không trùng. */
export const boVideo = (html: string) =>
  html
    .replace(new RegExp(String.raw`<p style="text-align: center;">\s*${LINK_VIDEO}\s*<\/p>\s*`, 'gi'), '')
    .replace(/<div style="text-align: center;?">\s*<iframe[^>]*(?:youtube\.com\/embed|tiktok\.com\/player)[^>]*><\/iframe>\s*<\/div>\s*/gi, '')
    .replace(/<div style="text-align: center;?">\s*<\/div>\s*/gi, '');

/** Chỗ chèn: ngay sau bảng đầu tiên; không có bảng thì đầu mô tả. */
function chenSauBang(goc: string, khoi: string): string {
  const i = goc.search(/<\/table>/i);
  if (i < 0) return `${khoi.trim()}\n${goc.trimStart()}`;
  const het = i + '</table>'.length;
  return goc.slice(0, het) + khoi + goc.slice(het);
}

/** Chèn video của app (Post sản phẩm). */
export function chenVideo(html: string, links: string[], xemTruoc = false): string {
  const ds = links.map(parseVideoLink).filter((v): v is VideoLink => !!v);
  if (!ds.length) return html;
  return chenSauBang(boVideo(html), '\n' + ds.map((v) => (xemTruoc ? oXemTruoc(v) : embedHtml(v))).join('\n') + '\n');
}

/** Mọi video YouTube / TikTok trong mô tả: iframe dán tay, hoặc link đứng riêng một dòng (WordPress tự nhúng). */
export function videoTrongMoTa(html: string): VideoLink[] {
  const ra: VideoLink[] = [];
  for (const m of html.matchAll(/<iframe[^>]*src="([^"]+)"/gi)) {
    const v = parseVideoLink(m[1]!);
    if (v) ra.push(v);
  }
  for (const m of html.matchAll(new RegExp(String.raw`(?:<p[^>]*>|^)\s*(${LINK_VIDEO})\s*(?:<\/p>|$)`, 'gim'))) {
    const v = parseVideoLink(m[1]!);
    if (v) ra.push(v);
  }
  return ra;
}

/** Bỏ MỌI video YouTube / TikTok trong mô tả (kể cả iframe / link dán tay). */
export const boMoiVideo = (html: string) =>
  boVideo(html)
    .replace(/<div[^>]*>\s*<iframe[^>]*(?:youtube(?:-nocookie)?\.com|youtu\.be|tiktok\.com)[^>]*>\s*<\/iframe>\s*<\/div>\s*/gi, '')
    .replace(/<iframe[^>]*(?:youtube(?:-nocookie)?\.com|youtu\.be|tiktok\.com)[^>]*>\s*<\/iframe>\s*/gi, '')
    .replace(new RegExp(String.raw`<p[^>]*>\s*${LINK_VIDEO}\s*<\/p>\s*`, 'gi'), '')
    .replace(new RegExp(String.raw`^\s*${LINK_VIDEO}\s*$\n?`, 'gim'), '');

/**
 * Chèn video theo SKU (menu Up ảnh): 'them' = giữ video đang có, chỉ chèn video chưa có;
 * 'thay' = bỏ hết video cũ rồi chèn danh sách mới.
 */
export function datVideo(html: string, links: string[], kieu: 'them' | 'thay'): { html: string; them: number; bo: number } {
  const moi = links.map(parseVideoLink).filter((v): v is VideoLink => !!v);
  const cu = videoTrongMoTa(html);
  // luôn dọn khung rỗng do lần chèn iframe trước bị WordPress lọc
  const goc = kieu === 'thay' ? boMoiVideo(html) : html.replace(/<div style="text-align: center;?">\s*<\/div>\s*/gi, '');
  const coSan = new Set((kieu === 'thay' ? [] : cu).map((v) => v.id));
  const can = moi.filter((v, i, a) => !coSan.has(v.id) && a.findIndex((x) => x.id === v.id) === i);
  const bo = kieu === 'thay' ? cu.length : 0;
  if (!can.length) return { html: goc, them: 0, bo: goc !== html ? Math.max(bo, 1) : bo };
  return { html: chenSauBang(goc, '\n' + can.map(embedHtml).join('\n') + '\n'), them: can.length, bo };
}
