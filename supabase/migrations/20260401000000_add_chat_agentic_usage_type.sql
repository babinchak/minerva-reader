-- Add 'chat_agentic' to usage_records usage_type constraint
ALTER TABLE public.usage_records DROP CONSTRAINT IF EXISTS usage_records_usage_type_check;
ALTER TABLE public.usage_records ADD CONSTRAINT usage_records_usage_type_check
  CHECK (usage_type IN ('chat', 'chat_agentic', 'upload', 'summary_book', 'summary_chapter', 'embedding'));

-- Partial index for counting agentic requests today (used by countAgenticRequestsToday)
CREATE INDEX IF NOT EXISTS idx_usage_records_agentic_today
  ON public.usage_records(user_id, usage_type, created_at)
  WHERE usage_type = 'chat_agentic';
