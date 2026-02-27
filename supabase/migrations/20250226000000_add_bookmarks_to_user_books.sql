-- Migration: Add bookmarks column to user_books for PDF page bookmarks
-- Date: 2025-02-26
-- Run this in your Supabase SQL Editor

ALTER TABLE public.user_books
ADD COLUMN IF NOT EXISTS bookmarks integer[] DEFAULT '{}';
