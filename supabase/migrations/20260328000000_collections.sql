-- Collections: user-created groups of books for scoped AI search.

-- Collections table
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Junction table linking collections to books
create table if not exists public.collection_books (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  added_at timestamptz not null default now(),
  unique (collection_id, book_id)
);

-- Indexes
create index if not exists idx_collections_user_id on public.collections(user_id);
create index if not exists idx_collection_books_collection_id on public.collection_books(collection_id);
create index if not exists idx_collection_books_book_id on public.collection_books(book_id);

-- RLS for collections
alter table public.collections enable row level security;

create policy "Users can view their own collections"
  on public.collections for select
  using (user_id = auth.uid());

create policy "Users can create their own collections"
  on public.collections for insert
  with check (user_id = auth.uid());

create policy "Users can update their own collections"
  on public.collections for update
  using (user_id = auth.uid());

create policy "Users can delete their own collections"
  on public.collections for delete
  using (user_id = auth.uid());

-- RLS for collection_books
alter table public.collection_books enable row level security;

create policy "Users can view books in their collections"
  on public.collection_books for select
  using (
    exists (
      select 1 from public.collections c
      where c.id = collection_id and c.user_id = auth.uid()
    )
  );

create policy "Users can add books to their collections"
  on public.collection_books for insert
  with check (
    exists (
      select 1 from public.collections c
      where c.id = collection_id and c.user_id = auth.uid()
    )
  );

create policy "Users can remove books from their collections"
  on public.collection_books for delete
  using (
    exists (
      select 1 from public.collections c
      where c.id = collection_id and c.user_id = auth.uid()
    )
  );
