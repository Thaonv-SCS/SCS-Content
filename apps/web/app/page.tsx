import { CATEGORY_LABEL, EXTRA_SLOTS, MAIN_SLOTS, type Category } from '@app/core';
import { supabaseServer } from '@/lib/supabase';
import { SuggestionCard, type Suggestion } from './suggestion-card';

type Digest = { id: string; date: string; status: string; stats: { cost_today_usd?: number; failed?: number } | null };

export default async function DigestPage() {
  const supabase = await supabaseServer();
  const { data: digest } = await supabase
    .from('digests')
    .select('id,date,status,stats')
    .eq('status', 'ready')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle<Digest>();

  if (!digest) {
    return (
      <>
        <h1>Bản tin</h1>
        <div className="card">Chưa có bản tin nào. Pipeline chạy lúc 6h sáng mỗi ngày.</div>
      </>
    );
  }

  // Đánh dấu đã xem — dùng cho cơ chế tự tạm dừng lịch chạy
  await supabase.from('digests').update({ viewed_at: new Date().toISOString() }).eq('id', digest.id).is('viewed_at', null);

  const { data } = await supabase
    .from('suggestions')
    .select('id,slot,rank,is_filler,score,title_vi,summary_vi,why,angles,caption_long,caption_short,to_verify,sources,image_urls,status')
    .eq('digest_id', digest.id)
    .order('rank');
  const all = (data ?? []) as Suggestion[];
  const main = all.filter((s) => MAIN_SLOTS.includes(s.slot));
  const count = (slot: Category) => all.filter((s) => s.slot === slot).length;
  const dateLabel = new Date(`${digest.date}T00:00:00+07:00`).toLocaleDateString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
  });

  const sections: [string, Suggestion[]][] = [
    ['Nổi bật', main.slice(0, 5)],
    ['Thêm lựa chọn', main.slice(5)],
    ...EXTRA_SLOTS.map((slot): [string, Suggestion[]] => [CATEGORY_LABEL[slot], all.filter((s) => s.slot === slot)]),
  ];

  return (
    <>
      <h1>Bản tin {dateLabel}</h1>
      <p className="muted">
        {(Object.keys(CATEGORY_LABEL) as Category[])
          .filter((slot) => count(slot))
          .map((slot) => `${count(slot)} ${CATEGORY_LABEL[slot].toLowerCase()}`)
          .join(' · ')}
        {' · '}đã chọn {all.filter((s) => s.status === 'picked').length}/{all.length}
      </p>
      {sections.map(([title, items]) =>
        items.length ? (
          <section key={title}>
            <h2>{title}</h2>
            <div className="sug-grid">
              {items.map((s) => (
                <SuggestionCard key={s.id} s={s} />
              ))}
            </div>
          </section>
        ) : null,
      )}
    </>
  );
}
