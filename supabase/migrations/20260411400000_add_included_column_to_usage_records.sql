ALTER TABLE public.usage_records
  ADD COLUMN IF NOT EXISTS included boolean NOT NULL DEFAULT true;
