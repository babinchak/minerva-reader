-- Usage records: single source of truth for all billable usage (chat, uploads, summaries, embeddings)
create table if not exists public.usage_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cost_dollars numeric not null default 0,
  usage_type text not null check (usage_type in ('chat', 'upload', 'summary_book', 'summary_chapter', 'embedding')),
  model text,
  input_tokens integer,
  output_tokens integer,
  reference_id uuid,
  included boolean not null default true,
  created_at timestamptz not null default now()
);

-- Index for user's usage history (usage API)
create index idx_usage_records_user_type on public.usage_records(user_id, usage_type, created_at desc);

-- Index for per-book cost lookups
create index idx_usage_records_reference_id_type on public.usage_records(reference_id, usage_type);

-- RLS: users can read their own records, service role can insert
alter table public.usage_records enable row level security;

create policy "Users can read own usage_records"
  on public.usage_records
  for select
  using (auth.uid() = user_id);

create policy "Service role full access on usage_records"
  on public.usage_records
  for all
  using (true)
  with check (true);
