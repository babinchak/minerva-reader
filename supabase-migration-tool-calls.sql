-- Migration: Add tool_calls column to chat_messages for agentic mode
-- Date: 2025-02-22
-- Run this in your Supabase SQL Editor
-- Idempotent: safe to run multiple times

ALTER TABLE public.chat_messages
ADD COLUMN IF NOT EXISTS tool_calls jsonb;
