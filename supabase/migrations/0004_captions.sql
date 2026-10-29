-- Kho caption: caption admin đã đăng (dán tay) + caption admin sửa trong bản tin. Dùng làm mẫu giọng văn cho AI.

create table captions (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  text_hash text not null unique,                 -- chống dán trùng
  source text not null check (source in ('page', 'edited')),
  suggestion_id uuid references suggestions(id) on delete set null,
  kind text not null check (kind in ('long', 'short')),
  category text check (category in ('boots', 'player', 'event', 'kits', 'other')),
  brands text[] not null default '{}',
  players text[] not null default '{}',
  boot_lines text[] not null default '{}',
  tagged_at timestamptz,                          -- null = AI chưa gắn nhãn
  created_at timestamptz not null default now()
);
create index captions_created_idx on captions (created_at desc);

alter table captions enable row level security;
create policy "owner_all" on captions for all to authenticated using (true) with check (true);
