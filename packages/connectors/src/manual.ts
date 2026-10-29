import type { RawItemInput } from '@app/core';
import { fetchPageMeta } from './http.ts';

/** Connector "dán link tay": mày dán URL bài viết, app tự đọc tiêu đề/ảnh/ngày đăng. */
export async function fetchManualLink(url: string, sourceSlug = 'manual'): Promise<RawItemInput> {
  const meta = await fetchPageMeta(url);
  return {
    sourceSlug,
    url,
    title: meta.title ?? url,
    content: meta.description,
    imageUrls: meta.image ? [meta.image] : [],
    publishedAt: meta.publishedAt,
  };
}
