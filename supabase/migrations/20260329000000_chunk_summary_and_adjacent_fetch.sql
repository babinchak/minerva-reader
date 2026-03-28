-- Update match functions to return section_index for range-based passage fetching.

-- Recreate match_embedding_sections with section_index
drop function if exists public.match_embedding_sections(vector, uuid, integer);

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
  similarity float,
  section_index integer
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
    1 - (es.embedding <=> query_embedding) as similarity,
    es.section_index
  from public.embedding_sections es
  where es.book_id = match_book_id
    and es.embedding is not null
  order by es.embedding <=> query_embedding
  limit match_count;
$$;

-- Recreate match_embedding_sections_multi with section_index
drop function if exists public.match_embedding_sections_multi(vector, uuid[], integer);

create or replace function public.match_embedding_sections_multi(
  query_embedding vector(1536),
  match_book_ids uuid[],
  match_count int default 10
)
returns table (
  id uuid,
  book_id uuid,
  content_text text,
  start_position text,
  end_position text,
  page_breaks integer[],
  similarity float,
  book_title text,
  book_author text,
  book_type text,
  section_index integer
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
    1 - (es.embedding <=> query_embedding) as similarity,
    b.title as book_title,
    b.author as book_author,
    b.book_type as book_type,
    es.section_index
  from public.embedding_sections es
  join public.books b on b.id = es.book_id
  where es.book_id = any(match_book_ids)
    and es.embedding is not null
  order by es.embedding <=> query_embedding
  limit match_count;
$$;
