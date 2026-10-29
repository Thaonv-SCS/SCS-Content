import { htmlToText, parseDate, type Connector, type RawItemInput } from '@app/core';
import { fetchText } from './http.ts';
import { asArray, text, xmlParser } from './xml.ts';

type Node = Record<string, any>;

function imagesOf(entry: Node, html: string): string[] {
  const urls = [
    ...asArray(entry['media:content']).map((m: Node) => m['@_url']),
    ...asArray(entry['media:thumbnail']).map((m: Node) => m['@_url']),
    ...asArray(entry.enclosure)
      .filter((e: Node) => !e['@_type'] || String(e['@_type']).startsWith('image'))
      .map((e: Node) => e['@_url']),
    ...[...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]),
  ];
  return [...new Set(urls.filter((u): u is string => typeof u === 'string' && /^https?:/.test(u)))].slice(0, 6);
}

function atomLink(entry: Node): string | undefined {
  const links = asArray(entry.link) as Node[];
  const alt = links.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') ?? links[0];
  return alt?.['@_href'] ?? text(alt);
}

/** RSS 2.0 và Atom. */
export const rssConnector: Connector = {
  kind: 'rss',
  async fetch(source, ctx) {
    const doc = xmlParser.parse(await fetchText(source.url)) as Node;
    const isAtom = !!doc.feed;
    const entries: Node[] = isAtom ? asArray(doc.feed.entry) : asArray(doc.rss?.channel?.item ?? doc['rdf:RDF']?.item);
    if (!doc.feed && !doc.rss && !doc['rdf:RDF']) throw new Error('Không phải RSS/Atom');

    const items: RawItemInput[] = [];
    for (const e of entries) {
      const url = isAtom ? atomLink(e) : text(e.link) ?? text(e.guid);
      const title = text(e.title);
      if (!url || !title) continue;

      const html = text(e['content:encoded']) ?? text(e.content) ?? text(e.description) ?? text(e.summary) ?? '';
      const publishedAt = parseDate(text(e.pubDate) ?? text(e.published) ?? text(e.updated) ?? text(e['dc:date']));
      if (publishedAt && publishedAt < ctx.since) continue;

      items.push({
        sourceSlug: source.slug,
        url,
        title: htmlToText(title, 300),
        content: htmlToText(html),
        author: text(e['dc:creator']) ?? text(e.author?.name) ?? text(e.author),
        imageUrls: imagesOf(e, html),
        publishedAt,
      });
    }
    return items;
  },
};
