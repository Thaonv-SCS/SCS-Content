import { CATEGORY_LABEL } from '@app/core';
import { supabaseServer } from '@/lib/supabase';
import { formatDateTime } from '@/lib/format';

type RawItemRow = {
  id: string;
  url: string;
  title: string;
  image_urls: string[];
  published_at: string | null;
  discovered_at: string;
  classification: { category: string; newsworthiness: number; reason: string } | null;
  sources: { name: string } | null;
};

const LABEL: Record<string, string> = { ...CATEGORY_LABEL, discard: 'Loại' };

export default async function RawItemsPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('raw_items')
    .select('id,url,title,image_urls,published_at,discovered_at,classification,sources(name)')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(100);
  const items = (data ?? []) as unknown as RawItemRow[];

  return (
    <>
      <h1>Bài thô</h1>
      <p className="muted">{items.length} bài mới nhất từ các nguồn, kèm kết quả phân loại của AI (nếu đã chạy)</p>
      <div className="feed">
        {items.map((i) => (
          <article key={i.id} className="card feed-item">
            {i.image_urls[0] ? (
              <a href={i.image_urls[0]} target="_blank" rel="noreferrer">
                {/* no-referrer: tránh bị site chặn hotlink ảnh */}
                <img src={i.image_urls[0]} alt="" loading="lazy" referrerPolicy="no-referrer" />
              </a>
            ) : (
              <div className="ph" />
            )}
            <div>
              <h3>
                <a href={i.url} target="_blank" rel="noreferrer">{i.title}</a>
              </h3>
              <div className="meta">
                {i.sources?.name} · đăng {i.published_at ? formatDateTime(i.published_at) : 'không rõ'} · lấy lúc{' '}
                {formatDateTime(i.discovered_at)}
              </div>
              {i.classification && (
                <div className="meta">
                  <span className="badge">{LABEL[i.classification.category] ?? i.classification.category}</span>{' '}
                  {i.classification.newsworthiness}/10 — {i.classification.reason}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
