-- Fix multi-book vector search performance.
-- The previous version used row_number() window function even when max_per_book
-- was NULL, which forced a full table scan instead of using the HNSW index.
-- Split into two code paths: fast index-accelerated path when no per-book cap,
-- and windowed path only when max_per_book is set (uses HNSW for candidate pool
-- then applies window function on the smaller result set).

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
  book_type text,
  section_index integer
)
language plpgsql stable
as $$
begin
  if max_per_book is null then
    -- Fast path: simple ORDER BY + LIMIT lets Postgres use the HNSW index
    return query
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
  else
    -- Windowed path: first use HNSW index to get top candidates, then apply per-book cap.
    -- The inner LIMIT ensures the HNSW index is used for the heavy lifting.
    return query
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
        r.book_type,
        r.section_index
      from (
        select
          c.id,
          c.book_id,
          c.content_text,
          c.start_position,
          c.end_position,
          c.page_breaks,
          c.similarity,
          c.book_title,
          c.book_author,
          c.book_type,
          c.section_index,
          row_number() over (partition by c.book_id order by c.similarity desc) as rank_in_book
        from (
          -- Use HNSW index to get a candidate pool
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
          limit greatest(match_count, max_per_book * array_length(match_book_ids, 1)) * 3
        ) c
      ) r
      where r.rank_in_book <= max_per_book
      order by r.similarity desc
      limit match_count;
  end if;
end;
$$;
