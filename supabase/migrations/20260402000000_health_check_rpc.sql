-- Replaces client-side health check logic with a single efficient SQL function.
-- Fixes false-positive orphan detection caused by PostgREST row limits / silent errors.

CREATE OR REPLACE FUNCTION health_check_issues()
RETURNS TABLE(issue_type text, severity text, description text, resource_id uuid, resource_name text)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  -- Orphaned books (0 users linked)
  SELECT 'orphaned_book'::text, 'warning'::text,
         format('"%s" has no users linked', b.title), b.id, b.title
  FROM books b
  LEFT JOIN user_books ub ON ub.book_id = b.id
  WHERE ub.id IS NULL

  UNION ALL

  -- Orphaned user_books (book deleted)
  SELECT 'orphaned_user_book', 'error',
         'User-book link references deleted book', ub.id, NULL
  FROM user_books ub
  LEFT JOIN books b ON ub.book_id = b.id
  WHERE b.id IS NULL

  UNION ALL

  -- Orphaned embeddings (book deleted) - deduplicated by book_id
  SELECT 'orphaned_embedding', 'error',
         'Embedding sections reference deleted book', es.book_id, NULL
  FROM (SELECT DISTINCT book_id FROM embedding_sections) es
  LEFT JOIN books b ON es.book_id = b.id
  WHERE b.id IS NULL

  UNION ALL

  -- Orphaned summaries (book deleted)
  SELECT 'orphaned_summary', 'error',
         'Summaries reference deleted book', s.book_id, NULL
  FROM (SELECT DISTINCT book_id FROM summaries) s
  LEFT JOIN books b ON s.book_id = b.id
  WHERE b.id IS NULL

  UNION ALL

  -- Orphaned chats (book deleted)
  SELECT 'orphaned_chat', 'error',
         'Chat references deleted book', c.id, NULL
  FROM chats c
  LEFT JOIN books b ON c.book_id = b.id
  WHERE b.id IS NULL

  UNION ALL

  -- Empty chats (no messages)
  SELECT 'empty_chat', 'warning',
         'Chat has no messages', c.id, NULL
  FROM chats c
  LEFT JOIN chat_messages cm ON cm.chat_id = c.id
  WHERE cm.id IS NULL

  UNION ALL

  -- Missing storage path
  SELECT 'missing_storage', 'warning',
         format('"%s" has no storage_path', b.title), b.id, b.title
  FROM books b
  WHERE b.storage_path IS NULL

  UNION ALL

  -- No embeddings (not yet processed)
  SELECT 'no_embeddings', 'warning',
         format('"%s"', b.title), b.id, b.title
  FROM books b
  WHERE b.vectors_processed_at IS NULL

  UNION ALL

  -- No summaries (not yet processed)
  SELECT 'no_summaries', 'warning',
         format('"%s"', b.title), b.id, b.title
  FROM books b
  WHERE b.summaries_processed_at IS NULL

  UNION ALL

  -- Inconsistent embeddings (marked processed but 0 rows)
  SELECT 'inconsistent_embeddings', 'error',
         format('"%s" marked as processed but has no embedding rows', b.title), b.id, b.title
  FROM books b
  WHERE b.vectors_processed_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM embedding_sections es WHERE es.book_id = b.id)

  UNION ALL

  -- Inconsistent summaries (marked processed but 0 rows)
  SELECT 'inconsistent_summaries', 'error',
         format('"%s" marked as processed but has no summary rows', b.title), b.id, b.title
  FROM books b
  WHERE b.summaries_processed_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM summaries s WHERE s.book_id = b.id);
$$;
