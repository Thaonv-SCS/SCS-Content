import { decodeEntities, type RawItemInput, type SourceConfig } from '@app/core';
import { fetchText, HttpError } from './http.ts';
import { rssConnector } from './rss.ts';
import { sitemapConnector } from './sitemap.ts';

export interface SourcePreview {
  count: number;
  samples: { title: string; url: string; publishedAt: string | null }[];
}

export interface DetectResult {
  ok: boolean;
  kind?: 'rss' | 'sitemap';
  /** Link feed / sitemap thực sự dùng để lấy bài (có thể khác link mày dán). */
  url?: string;
  config?: { include?: string; maxNew?: number };
  /** Tên gợi ý lấy từ tiêu đề trang / feed. */
  title?: string;
  preview?: SourcePreview;
  message: string;
}

const isFeed = (t: string) => /<rss|<feed[\s>]|<rdf:RDF/i.test(t.slice(0, 3000));
const isSitemap = (t: string) => /<urlset|<sitemapindex/i.test(t.slice(0, 3000));
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function tryFetch(url: string): Promise<string | null> {
  try {
    return await fetchText(url, { retries: 0, timeoutMs: 12_000 });
  } catch {
    return null;
  }
}

/** Chạy thử connector với một nguồn (chưa cần lưu) — lấy bài trong `days` ngày, tối đa vài bài để xem trước. */
export async function previewSource(source: Pick<SourceConfig, 'kind' | 'url' | 'config'>, days = 7): Promise<SourcePreview> {
  const connector = source.kind === 'rss' ? rssConnector : source.kind === 'sitemap' ? sitemapConnector : null;
  if (!connector) throw new Error(`Loại nguồn "${source.kind}" chưa thử được ở đây`);
  // Sitemap phải mở từng bài để lấy tiêu đề → chỉ xem trước 3 bài cho nhanh
  const config = source.kind === 'sitemap' ? { ...source.config, maxNew: 3 } : source.config;
  const items: RawItemInput[] = await connector.fetch(
    { slug: 'preview', name: 'preview', categoryHint: 'mixed', weight: 0.5, enabled: true, ...source, config },
    { since: new Date(Date.now() - days * 86400_000), log: () => {} },
  );
  items.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
  return {
    count: items.length,
    samples: items.slice(0, 5).map((i) => ({ title: i.title, url: i.url, publishedAt: i.publishedAt?.toISOString() ?? null })),
  };
}

/**
 * Từ một link bất kỳ (trang chủ, chuyên mục, hay chính link RSS), tự tìm cách lấy bài:
 * RSS/Atom trước (nhanh, có ngày đăng), không có thì sitemap (lọc theo đường dẫn của link đã dán).
 */
export async function detectSource(input: string): Promise<DetectResult> {
  let page: URL;
  try {
    page = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    return { ok: false, message: 'Link không hợp lệ.' };
  }
  const origin = page.origin;
  const base = page.href.replace(/\/$/, '');

  let html: string;
  try {
    html = await fetchText(page.href, { retries: 0, timeoutMs: 15_000 });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : null;
    return {
      ok: false,
      message:
        status === 403 || status === 503
          ? `Trang chặn truy cập tự động (HTTP ${status}) — thường do Cloudflare. Nguồn này cần connector riêng.`
          : `Không mở được trang: ${(err as Error).message}`,
    };
  }
  const title = decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').trim() || page.hostname;

  // 1. Chính link đã dán là RSS
  if (isFeed(html)) {
    return withPreview({ ok: true, kind: 'rss', url: page.href, title, message: 'Link này là RSS.' });
  }

  // 2. RSS khai báo trong trang hoặc ở các đường dẫn quen thuộc
  const declared = [...html.matchAll(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi)]
    .map((m) => m[0].match(/href=["']([^"']+)/i)?.[1])
    .filter((h): h is string => !!h && !/comments/i.test(h))
    .map((h) => new URL(decodeEntities(h), origin).href);
  const shopifyBlog = page.pathname.match(/^\/blogs\/[^/]+/)?.[0];
  const feedCandidates = [
    ...declared,
    `${base}/feed`,
    `${base}/rss`,
    ...(shopifyBlog ? [`${origin}${shopifyBlog}.atom`] : []),
    // Kiểu báo Việt Nam: /the-thao → /rss/the-thao.rss
    ...(page.pathname.length > 1 ? [`${origin}/rss${page.pathname.replace(/\/$/, '').replace(/\.html?$/, '')}.rss`] : []),
    `${origin}/feed`,
    `${origin}/rss.xml`,
    `${origin}/feed.xml`,
    `${origin}/atom.xml`,
    `${origin}/feeds/posts/default`,
  ];
  // Thử song song cho nhanh, nhưng vẫn ưu tiên theo thứ tự (feed khai báo trong trang trước)
  const feedUrls = [...new Set(feedCandidates)];
  const feedTexts = await Promise.all(feedUrls.map(tryFetch));
  const feedIndex = feedTexts.findIndex((t) => t && isFeed(t));
  if (feedIndex >= 0) {
    return withPreview({ ok: true, kind: 'rss', url: feedUrls[feedIndex], title, message: 'Tìm thấy RSS.' });
  }

  // 3. Sitemap — lọc link bài theo đường dẫn của trang đã dán (vd dán /articles → chỉ lấy /articles/…)
  const robots = (await tryFetch(`${origin}/robots.txt`)) ?? '';
  const sitemapCandidates = [
    ...[...robots.matchAll(/^sitemap:\s*(\S+)/gim)].map((m) => m[1]!),
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/news-sitemap.xml`,
  ];
  const path = page.pathname.replace(/\/$/, '');
  const config = { maxNew: 20, ...(path ? { include: `${escapeRe(path)}/.` } : {}) };
  const sitemapUrls = [...new Set(sitemapCandidates)].slice(0, 6);
  const sitemapTexts = await Promise.all(sitemapUrls.map(tryFetch));
  for (const [i, candidate] of sitemapUrls.entries()) {
    const text = sitemapTexts[i];
    if (text && isSitemap(text)) {
      // Sitemap dạng danh mục (chứa nhiều sitemap con): chọn sitemap con có link bài khớp đường dẫn đã dán
      const url = config.include && /<sitemapindex/i.test(text) ? ((await findChildSitemap(text, new RegExp(config.include))) ?? candidate) : candidate;
      return withPreview({
        ok: true,
        kind: 'sitemap',
        url,
        config,
        title,
        message: `Không có RSS — dùng sitemap${path ? `, chỉ lấy link bắt đầu bằng ${path}/` : ''}.`,
      });
    }
  }

  return { ok: false, title, message: 'Không tìm thấy RSS hay sitemap. Nguồn này cần connector riêng — báo Claude.' };
}

async function findChildSitemap(indexXml: string, include: RegExp): Promise<string | null> {
  const children = [...indexXml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decodeEntities(m[1]!));
  // Thử sitemap có tên gợi ý bài viết trước (blog, news, stories…)
  children.sort((a, b) => Number(/blog|news|stor|article|post/i.test(b)) - Number(/blog|news|stor|article|post/i.test(a)));
  for (const child of children.slice(0, 12)) {
    const text = await tryFetch(child);
    const locs = text ? [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!) : [];
    if (locs.some((l) => include.test(l))) return child;
  }
  return null;
}

async function withPreview(r: DetectResult): Promise<DetectResult> {
  try {
    r.preview = await previewSource({ kind: r.kind!, url: r.url!, config: r.config });
    if (!r.preview.count) r.message += ' Nhưng 7 ngày qua chưa lấy được bài nào — kiểm tra lại link hoặc bộ lọc.';
  } catch (err) {
    r.message += ` Lỗi khi đọc thử: ${(err as Error).message}`;
  }
  return r;
}
