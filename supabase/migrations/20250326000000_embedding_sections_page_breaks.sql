-- Add page_breaks column to embedding_sections.
-- Stores character offsets where each new page begins within the chunk text.
-- e.g. [512, 1087] means page startPage+1 begins at char 512, startPage+2 at char 1087.

alter table public.embedding_sections
  add column if not exists page_breaks integer[];

-- Drop old function signature so we can add page_breaks to return type
drop function if exists public.match_embedding_sections(vector, uuid, integer);

-- Recreate match_embedding_sections with page_breaks
create or replace function public.match_embedding_sections(
  query_embedding vector(1536),
  match_book_id uuid,
  match_count int default 10
)
returns table (
  id uuid,
  book_id uuid,
  content_text text,
  start_position text,
  end_position text,
  page_breaks integer[],
  similarity float
)
language sql stable
as $$
  select
    es.id,
    es.book_id,
    es.content_text,
    es.start_position,
    es.end_position,
    es.page_breaks,
    1 - (es.embedding <=> query_embedding) as similarity
  from public.embedding_sections es
  where es.book_id = match_book_id
    and es.embedding is not null
  order by es.embedding <=> query_embedding
  limit match_count;
$$;
