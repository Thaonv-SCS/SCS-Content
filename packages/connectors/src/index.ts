import type { Connector, SourceKind } from '@app/core';
import { rssConnector } from './rss.ts';
import { sitemapConnector } from './sitemap.ts';

export { fetchManualLink } from './manual.ts';
export { fetchPageMeta, HttpError } from './http.ts';
export { fetchMatches, type MatchResult } from './football-data.ts';

/** Mỗi loại nguồn một connector. Thêm loại mới = thêm module + đăng ký ở đây. */
const registry: Partial<Record<SourceKind, Connector>> = {
  rss: rssConnector,
  sitemap: sitemapConnector,
  // match_api: không trả bài viết — xử lý riêng bằng fetchMatches()
  // html, x: sẽ thêm ở các bước sau
};

export function getConnector(kind: SourceKind): Connector | undefined {
  return registry[kind];
}
