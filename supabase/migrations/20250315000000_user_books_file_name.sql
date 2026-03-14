-- Migration: Add file_name to user_books for per-user filename fallback
-- Date: 2025-03-15
-- file_name = uploader's filename (cleaned). Used when books.title came from filename fallback.
-- custom_title = only set when user explicitly edits; never auto-written on upload.

ALTER TABLE public.user_books
ADD COLUMN IF NOT EXISTS file_name text;
