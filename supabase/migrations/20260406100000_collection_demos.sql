-- Demo Q&A entries for curated collections, configurable from admin.
-- Displayed on the landing page marketing section.

create table if not exists public.collection_demos (
  id uuid primary key default gen_random_uuid(),
  curated_collection_id uuid not null references public.curated_collections(id) on delete cascade,
  question text not null,
  tool_calls jsonb not null default '[]',
  answer text not null,
  books jsonb not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_collection_demos_collection on public.collection_demos(curated_collection_id);
create index if not exists idx_collection_demos_sort on public.collection_demos(sort_order);

-- RLS: everyone can read, writes only via service client (admin routes)
alter table public.collection_demos enable row level security;

create policy "Anyone can view collection demos"
  on public.collection_demos for select
  using (true);
