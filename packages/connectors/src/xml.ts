import { XMLParser } from 'fast-xml-parser';

const ARRAY_TAGS = new Set(['item', 'entry', 'url', 'sitemap', 'link', 'category', 'media:content', 'media:thumbnail', 'enclosure']);

export const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) => ARRAY_TAGS.has(name),
  processEntities: true,
  htmlEntities: true,
});

/** Lấy text của một node đã parse — có thể là string, number hoặc object có `#text`. */
export function text(node: unknown): string | undefined {
  if (node == null) return undefined;
  if (typeof node === 'string' || typeof node === 'number') return String(node).trim() || undefined;
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === 'object' && '#text' in node) return text((node as Record<string, unknown>)['#text']);
  return undefined;
}

export function asArray<T>(v: T | T[] | undefined): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}
