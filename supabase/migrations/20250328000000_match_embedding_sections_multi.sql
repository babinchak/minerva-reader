-- Multi-book similarity search function for library-wide AI.
-- Accepts an array of book_ids and returns results across all of them,
-- joining with the books table to include title and author.

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
  book_type text
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
    b.book_type as book_type
  from public.embedding_sections es
  join public.books b on b.id = es.book_id
  where es.book_id = any(match_book_ids)
    and es.embedding is not null
  order by es.embedding <=> query_embedding
  limit match_count;
$$;
