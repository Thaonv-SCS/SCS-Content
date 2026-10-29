import { decodeEntities, parseDate } from '@app/core';

const UA = 'Mozilla/5.0 (compatible; SoccerstoreContentBot/0.1; personal content digest)';

export class HttpError extends Error {
  constructor(public status: number, public url: string) {
    super(`HTTP ${status} ${url}`);
  }
}

export async function fetchText(url: string, { timeoutMs = 20_000, retries = 1 } = {}): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: '*/*' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new HttpError(res.status, url);
      return await res.text();
    } catch (err) {
      // 4xx không thử lại — nguồn chặn hoặc sai URL
      const retryable = !(err instanceof HttpError && err.status < 500);
      if (attempt >= retries || !retryable) throw err;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}

function metaContent(html: string, key: string): string | undefined {
  const tag = html.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${key}["'][^>]*>`, 'i'))?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decodeEntities(content).trim() : undefined;
}

export interface PageMeta {
  title?: string;
  description?: string;
  image?: string;
  publishedAt: Date | null;
}

/** Lấy tiêu đề / ảnh / ngày đăng từ thẻ meta (OpenGraph, article:*, JSON-LD) của một trang bài viết. */
export async function fetchPageMeta(url: string): Promise<PageMeta> {
  const html = await fetchText(url);
  const jsonLdDate = html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1];
  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  return {
    title: metaContent(html, 'og:title') ?? (titleTag ? decodeEntities(titleTag).trim() : undefined),
    description: metaContent(html, 'og:description') ?? metaContent(html, 'description'),
    image: metaContent(html, 'og:image'),
    publishedAt:
      parseDate(metaContent(html, 'article:published_time')) ??
      parseDate(jsonLdDate) ??
      parseDate(metaContent(html, 'datePublished')),
  };
}

/** Chạy tuần tự với khoảng nghỉ, tránh dội request vào một site. */
export async function mapPolite<T, R>(items: T[], fn: (item: T) => Promise<R>, delayMs = 400): Promise<R[]> {
  const out: R[] = [];
  for (const item of items) {
    out.push(await fn(item));
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return out;
}
