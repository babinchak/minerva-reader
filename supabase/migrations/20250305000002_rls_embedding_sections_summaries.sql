-- Migration: Enable RLS on embedding_sections and summaries
-- Date: 2025-03-05
-- Secures book content; supports authenticated (user_books or curated) and anon (curated only)

-- embedding_sections
ALTER TABLE public.embedding_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read embedding_sections for accessible books" ON public.embedding_sections;
CREATE POLICY "Users can read embedding_sections for accessible books"
ON public.embedding_sections FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_books ub
    WHERE ub.book_id = embedding_sections.book_id AND ub.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.books b
    WHERE b.id = embedding_sections.book_id AND b.is_curated = true
  )
);

-- Service role and backend inserts/updates bypass RLS; no INSERT/UPDATE/DELETE for anon/authenticated

-- summaries
ALTER TABLE public.summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read summaries for accessible books" ON public.summaries;
CREATE POLICY "Users can read summaries for accessible books"
ON public.summaries FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_books ub
    WHERE ub.book_id = summaries.book_id AND ub.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.books b
    WHERE b.id = summaries.book_id AND b.is_curated = true
  )
);

DROP POLICY IF EXISTS "Anon can read summaries for curated books" ON public.summaries;
CREATE POLICY "Anon can read summaries for curated books"
ON public.summaries FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.books b
    WHERE b.id = summaries.book_id AND b.is_curated = true
  )
);
