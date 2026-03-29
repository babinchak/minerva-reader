-- Processing events table: tracks Lambda processing runs for summaries/vectors
-- with CloudWatch log references for direct deep-linking from admin UI.

create table if not exists public.processing_events (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  action text not null check (action in ('summaries', 'vectors', 'processing')),
  status text not null check (status in ('started', 'completed', 'failed')),
  error_message text,
  lambda_name text,
  log_group text,
  log_stream text,
  aws_region text default 'us-west-2',
  duration_ms integer,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Index for fast lookup by book
create index if not exists idx_processing_events_book_id on public.processing_events(book_id);

-- Index for recent events listing
create index if not exists idx_processing_events_created_at on public.processing_events(created_at desc);

-- Allow service role full access (lambdas use service role key)
alter table public.processing_events enable row level security;

create policy "Service role full access on processing_events"
  on public.processing_events
  for all
  using (true)
  with check (true);
