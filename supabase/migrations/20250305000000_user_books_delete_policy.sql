-- Migration: Allow users to delete their own user_books entries (remove from library)
-- Date: 2025-03-05
-- RLS may block DELETE without this policy; API can use service role as alternative

DROP POLICY IF EXISTS "Users can delete their own user_books" ON public.user_books;
CREATE POLICY "Users can delete their own user_books"
ON public.user_books
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
