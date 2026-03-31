-- Drop processing_cost columns from books table.
-- Cost data now lives exclusively in usage_records.
ALTER TABLE public.books DROP COLUMN IF EXISTS processing_cost_cents;
ALTER TABLE public.books DROP COLUMN IF EXISTS processing_cost_included;
