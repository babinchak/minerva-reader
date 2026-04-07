-- Add max_per_book parameter to multi-book vector search.
-- Uses a window function to limit results from any single book,
-- ensuring diverse results across the collection/library.

create or replace function public.match_embedding_sections_multi(
  query_embedding vector(1536),
  match_book_ids uuid[],
  match_count int default 10,
  max_per_book int default null
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
    r.id,
    r.book_id,
    r.content_text,
    r.start_position,
    r.end_position,
    r.page_breaks,
    r.similarity,
    r.book_title,
    r.book_author,
    r.book_type
  from (
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
      row_number() over (partition by es.book_id order by es.embedding <=> query_embedding) as rank_in_book
    from public.embedding_sections es
    join public.books b on b.id = es.book_id
    where es.book_id = any(match_book_ids)
      and es.embedding is not null
  ) r
  where max_per_book is null or r.rank_in_book <= max_per_book
  order by r.similarity desc
  limit match_count;
$$;
