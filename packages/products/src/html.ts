import type { WooCategory } from './woo.ts';

export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** **chữ đậm** → <strong>, giữ nguyên phần còn lại (đã escape). */
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

/** Bảng thông số đúng khung đang dùng trên soccerstore.vn: 3 cột (STT · nhãn · giá trị). */
export function renderSpecTable(rows: { label: string; value: string }[], lineLink?: string): string {
  const body = rows
    .map((r, i) => {
      const lines = r.value.split(/\n+/).filter(Boolean);
      let value = lines.map((l) => `<p>${inline(l)}</p>`).join('\n');
      // Dòng đầu (Dòng giày / Dòng bóng…) gắn link về danh mục dòng, như sản phẩm cũ
      if (i === 0 && lineLink && lines.length) value = `<p><a href="${esc(lineLink)}">${esc(lines[0]!)}</a></p>`;
      return `<tr>\n<td>\n<p>${i + 1}</p>\n</td>\n<td>\n<p>${esc(r.label)}</p>\n</td>\n<td>\n${value}\n</td>\n</tr>`;
    })
    .join('\n');
  return `<table border="1" cellspacing="0" cellpadding="0">\n<tbody>\n${body}\n</tbody>\n</table>`;
}

/** Một đích link được phép trong đoạn văn: khóa marker (ID danh mục hoặc "brand") → đường dẫn + số lần tối đa. */
export interface LinkTarget {
  link: string;
  max: number;
}

/**
 * Đoạn văn AI viết dùng marker [[link:KHÓA|chữ gắn link]]. Chỉ nhận khóa có trong `targets` (do code quyết định),
 * mỗi đích tối đa `max` lần, cả bài tối đa `maxLinks` link; marker sai hoặc thừa thì chỉ giữ lại chữ.
 */
export function renderParagraphs(
  paragraphs: string[],
  targets: Map<string, LinkTarget>,
  maxLinks: number,
): { html: string; linked: string[] } {
  const linked: string[] = [];
  const html = paragraphs
    .map((p) => {
      const parts = p.split(/(\[\[link:[^|\]]+\|[^\]]+\]\])/g).map((part) => {
        const m = part.match(/^\[\[link:([^|\]]+)\|([^\]]+)\]\]$/);
        if (!m) return inline(part);
        const key = m[1]!.trim();
        const t = targets.get(key);
        if (!t || linked.length >= maxLinks || linked.filter((k) => k === key).length >= t.max) return inline(m[2]!);
        linked.push(key);
        return `<a href="${esc(t.link)}">${inline(m[2]!)}</a>`;
      });
      return `<p>${parts.join('')}</p>`;
    })
    .join('\n');
  return { html, linked };
}

/** Rút gọn mô tả sản phẩm mẫu thành văn bản cho AI đọc (bỏ ảnh, giữ bảng, in đậm, link). */
export function exampleToText(html: string, maxLen = 2200): string {
  const text = html
    .replace(/<div[^>]*wp-caption[\s\S]*?<\/div>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<tr[^>]*>/gi, '\n| ')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<a [^>]*>([\s\S]*?)<\/a>/gi, '[$1]')
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<\/p>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8211;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}

/** Đường dẫn đầy đủ của danh mục, vd "Giày Bóng Đá > Giày Cỏ Nhân Tạo". */
export function categoryPath(cat: WooCategory, all: Map<number, WooCategory>): string {
  const names = [cat.name];
  for (let p = all.get(cat.parent); p && names.length < 6; p = all.get(p.parent)) names.unshift(p.name);
  return names.join(' > ');
}
