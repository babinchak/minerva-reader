-- Curated Collections: admin-managed, globally visible groupings of books.
-- Separate from user `collections` table (different RLS, different purpose).

create table if not exists public.curated_collections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  slug text not null unique,
  cover_image_path text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.curated_collection_books (
  id uuid primary key default gen_random_uuid(),
  curated_collection_id uuid not null references public.curated_collections(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  sort_order integer not null default 0,
  added_at timestamptz not null default now(),
  unique (curated_collection_id, book_id)
);

-- Indexes
create index if not exists idx_curated_collections_slug on public.curated_collections(slug);
create index if not exists idx_curated_collections_sort on public.curated_collections(sort_order);
create index if not exists idx_curated_collection_books_collection on public.curated_collection_books(curated_collection_id);
create index if not exists idx_curated_collection_books_book on public.curated_collection_books(book_id);

-- RLS: everyone can read, writes only via service client (admin routes)
alter table public.curated_collections enable row level security;

create policy "Anyone can view curated collections"
  on public.curated_collections for select
  using (true);

alter table public.curated_collection_books enable row level security;

create policy "Anyone can view curated collection books"
  on public.curated_collection_books for select
  using (true);

-- updated_at trigger
create or replace function public.set_curated_collection_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger curated_collections_updated_at
  before update on public.curated_collections
  for each row
  execute function public.set_curated_collection_updated_at();
