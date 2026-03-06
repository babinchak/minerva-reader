-- Migration: Books anon policy for curated + remove duplicate SELECT policy
-- Date: 2025-03-05
-- Enables context route and client-side flows for anonymous users on curated books

-- Anon can read curated book metadata (context route, browse, etc.)
DROP POLICY IF EXISTS "Anon can read curated books" ON public.books;
CREATE POLICY "Anon can read curated books"
ON public.books FOR SELECT
TO anon
USING (is_curated = true);

-- Remove duplicate SELECT policy (identical to "Users can read books they have access to")
DROP POLICY IF EXISTS "Users can read their own books" ON public.books;
