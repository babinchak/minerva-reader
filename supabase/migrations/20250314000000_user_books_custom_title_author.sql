-- Migration: Add custom title/author to user_books, title_source to books
-- Date: 2025-03-14
-- Enables per-user display overrides when canonical title came from filename fallback

-- books: track whether title came from metadata or filename
ALTER TABLE public.books
ADD COLUMN IF NOT EXISTS title_source text CHECK (title_source IS NULL OR title_source IN ('metadata', 'filename'));

-- user_books: per-user display overrides (used when title_source = 'filename')
ALTER TABLE public.user_books
ADD COLUMN IF NOT EXISTS custom_title text;

ALTER TABLE public.user_books
ADD COLUMN IF NOT EXISTS custom_author text;
