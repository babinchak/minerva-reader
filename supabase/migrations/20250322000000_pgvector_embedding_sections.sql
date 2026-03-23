-- Add embedding vector column to embedding_sections and create similarity search function.
-- Replaces Supabase Storage Vectors (alpha) with stable pgvector.

-- Add vector column (3072 dims for text-embedding-3-large)
alter table public.embedding_sections
  add column if not exists embedding vector(1536);

-- HNSW index for fast cosine similarity search
create index if not exists embedding_sections_embedding_hnsw_idx
  on public.embedding_sections
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- RPC function for similarity search
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
    1 - (es.embedding <=> query_embedding) as similarity
  from public.embedding_sections es
  where es.book_id = match_book_id
    and es.embedding is not null
  order by es.embedding <=> query_embedding
  limit match_count;
$$;
