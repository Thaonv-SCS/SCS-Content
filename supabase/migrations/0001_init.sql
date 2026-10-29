-- Giai đoạn 1: nguồn, bài thô, cụm tin, gợi ý, bản tin, phản hồi, danh mục.
-- Bảng media_assets tạo sẵn cho giai đoạn 2.

create extension if not exists vector;

-- ───────────── Nguồn ─────────────
create table sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kind text not null check (kind in ('rss', 'sitemap', 'html', 'manual', 'x', 'match_api')),
  url text not null,
  category_hint text not null check (category_hint in ('boots', 'player', 'event', 'kits', 'match', 'mixed')),
  weight real not null default 0.5 check (weight between 0 and 1),
  enabled boolean not null default true,
  config jsonb,
  note text,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  fail_count int not null default 0,
  created_at timestamptz not null default now()
);

-- ───────────── Bài thô ─────────────
create table raw_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources(id) on delete set null,
  url text not null,
  canonical_url text not null unique,
  title text not null,
  title_hash text not null,
  content text,
  author text,
  image_urls text[] not null default '{}',
  published_at timestamptz,
  discovered_at timestamptz not null default now(),
  raw jsonb
);
create index raw_items_discovered_idx on raw_items (discovered_at desc);
create index raw_items_title_hash_idx on raw_items (title_hash);

-- ───────────── Cụm tin (cùng một sự kiện từ nhiều nguồn) ─────────────
create table stories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text check (category in ('boots', 'player', 'event', 'kits', 'discard')),
  entities jsonb,            -- { players: [], brands: [], boot_lines: [], clubs: [], competitions: [] }
  embedding vector,          -- số chiều tùy model embedding, chốt ở bước gom cụm
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table story_items (
  story_id uuid not null references stories(id) on delete cascade,
  raw_item_id uuid not null references raw_items(id) on delete cascade,
  primary key (story_id, raw_item_id)
);

-- ───────────── Trận đấu (football-data.org) ─────────────
create table matches (
  id bigint primary key,     -- id của football-data.org
  competition text not null,
  home text not null,
  away text not null,
  home_score int,
  away_score int,
  played_at timestamptz not null,
  scorers jsonb,
  raw jsonb
);

-- ───────────── Bản tin & gợi ý ─────────────
create table digests (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  status text not null default 'draft' check (status in ('draft', 'ready', 'failed')),
  stats jsonb,
  created_at timestamptz not null default now()
);

create table suggestions (
  id uuid primary key default gen_random_uuid(),
  digest_id uuid references digests(id) on delete cascade,
  story_id uuid not null references stories(id) on delete cascade,
  slot text not null check (slot in ('boots', 'player', 'event', 'kits')),
  rank int not null,
  is_filler boolean not null default false,      -- nhãn "bổ sung" khi lấp chỗ ngăn thiếu
  score real not null,
  score_breakdown jsonb,
  title_vi text,
  summary_vi text,
  why text,
  angles jsonb,              -- string[]
  caption_long text,
  caption_short text,
  to_verify jsonb,           -- [{ claim, reason }]
  prompt_version text,
  created_at timestamptz not null default now()
);
create index suggestions_digest_idx on suggestions (digest_id, rank);

-- ───────────── Phản hồi ─────────────
create table feedback (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references suggestions(id) on delete cascade,
  action text not null check (action in ('pick', 'skip', 'edit')),
  tags text[] not null default '{}',
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

-- ───────────── Danh mục ─────────────
create table players (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  aliases text[] not null default '{}',
  club text,
  league text,
  is_legend boolean not null default false,
  watch boolean not null default true,           -- trong danh sách theo dõi của mày
  boot_brand text,
  boot_model text,
  boot_updated_at date,
  boot_source text
);

create table boot_lines (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  line text not null,
  aliases text[] not null default '{}',
  unique (brand, line)
);

create table glossary (
  term_en text primary key,
  term_vi text not null
);

-- ───────────── Giai đoạn 2 (tạo sẵn) ─────────────
create table media_assets (
  id uuid primary key default gen_random_uuid(),
  raw_item_id uuid references raw_items(id) on delete cascade,
  url text not null,
  cached_path text,
  width int,
  height int,
  created_at timestamptz not null default now()
);

-- ───────────── Theo dõi chi phí AI ─────────────
create table llm_calls (
  id uuid primary key default gen_random_uuid(),
  purpose text not null,
  model text not null,
  tokens_in int not null,
  tokens_out int not null,
  cost_usd numeric(10, 5) not null,
  created_at timestamptz not null default now()
);

-- ───────────── RLS: app 1 người dùng ─────────────
-- Pipeline dùng service role (bỏ qua RLS). Web app: chỉ user đã đăng nhập được đọc/ghi.
-- Nhớ TẮT đăng ký tài khoản mới trong Supabase Auth sau khi tạo tài khoản của mày.
do $$
declare t text;
begin
  foreach t in array array['sources','raw_items','stories','story_items','matches','digests','suggestions',
                           'feedback','players','boot_lines','glossary','media_assets','llm_calls']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "owner_all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
