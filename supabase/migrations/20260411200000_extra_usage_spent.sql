-- Track how much extra usage has been consumed this billing period.
-- Resets to 0 when subscription renews (alongside included_balance reset).
ALTER TABLE public.user_credits
  ADD COLUMN IF NOT EXISTS extra_usage_spent numeric NOT NULL DEFAULT 0;
