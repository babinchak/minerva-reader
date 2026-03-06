-- Migration: Add created_at to user_books for "date added to library" sorting
-- Date: 2025-03-05
-- Run this in your Supabase SQL Editor

ALTER TABLE public.user_books
ADD COLUMN IF NOT EXISTS created_at timestamp with time zone;

-- Backfill existing rows: use updated_at as best approximation for when added
UPDATE public.user_books
SET created_at = updated_at
WHERE created_at IS NULL;

-- Set default for new rows
ALTER TABLE public.user_books
ALTER COLUMN created_at SET DEFAULT now();
