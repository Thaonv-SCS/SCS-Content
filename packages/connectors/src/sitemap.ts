import { canonicalizeUrl, parseDate, type Connector, type RawItemInput } from '@app/core';
import { fetchPageMeta, fetchText, mapPolite } from './http.ts';
import { asArray, text, xmlParser } from './xml.ts';

type Node = Record<string, any>;

interface SitemapConfig {
  /** Regex — chỉ giữ URL bài khớp mẫu này. */
  include?: string;
  /** Số bài mới tối đa lấy meta mỗi lượt. */
  maxNew?: number;
  /** Số sitemap con (mới nhất) đọc khi gặp sitemap index. */
  maxChildSitemaps?: number;
}

interface Entry {
  loc: string;
  lastmod: Date | null;
}

const byNewest = (a: Entry, b: Entry) => (b.lastmod?.getTime() ?? 0) - (a.lastmod?.getTime() ?? 0);

async function readSitemap(url: string): Promise<{ urls: Entry[]; children: Entry[] }> {
  const doc = xmlParser.parse(await fetchText(url)) as Node;
  const toEntry = (n: Node): Entry => ({ loc: text(n.loc) ?? '', lastmod: parseDate(text(n.lastmod)) });
  return {
    urls: asArray(doc.urlset?.url).map(toEntry).filter((e) => e.loc),
    children: asArray(doc.sitemapindex?.sitemap).map(toEntry).filter((e) => e.loc),
  };
}

/**
 * Dùng cho site không có RSS. Lấy URL mới theo `lastmod`, rồi đọc thẻ meta từng bài để có tiêu đề/ảnh/ngày đăng.
 * Site không có `lastmod` thì việc nhận biết bài mới dựa vào lọc trùng ở pipeline (URL đã thấy).
 */
export const sitemapConnector: Connector = {
  kind: 'sitemap',
  async fetch(source, ctx) {
    const cfg = (source.config ?? {}) as SitemapConfig;
    const include = cfg.include ? new RegExp(cfg.include) : null;

    let { urls, children } = await readSitemap(source.url);
    if (children.length) {
      const picked = children
        .filter((c) => !c.lastmod || c.lastmod >= ctx.since)
        .sort(byNewest)
        .slice(0, cfg.maxChildSitemaps ?? 3);
      for (const child of picked) urls.push(...(await readSitemap(child.loc)).urls);
    }

    const fresh = urls
      .filter((u) => !include || include.test(u.loc))
      .filter((u) => !u.lastmod || u.lastmod >= ctx.since)
      .filter((u) => !ctx.isKnown?.(canonicalizeUrl(u.loc)))
      // sort ổn định: lastmod bằng nhau (site build lại cả sitemap) thì giữ thứ tự trong sitemap
      .sort(byNewest)
      .slice(0, cfg.maxNew ?? 20);
    ctx.log(`${urls.length} URL trong sitemap, ${fresh.length} URL mới`);

    const items = await mapPolite(fresh, async (u): Promise<RawItemInput | null> => {
      try {
        const meta = await fetchPageMeta(u.loc);
        if (!meta.title) return null;
        // lastmod chỉ là lần sửa trang; ngày đăng trong chính bài mới là chuẩn
        if (meta.publishedAt && meta.publishedAt < ctx.since) return null;
        return {
          sourceSlug: source.slug,
          url: u.loc,
          title: meta.title,
          content: meta.description,
          imageUrls: meta.image ? [meta.image] : [],
          publishedAt: meta.publishedAt ?? u.lastmod,
        };
      } catch (err) {
        ctx.log(`bỏ qua ${u.loc}: ${(err as Error).message}`);
        return null;
      }
    });
    return items.filter((i): i is RawItemInput => i !== null);
  },
};
