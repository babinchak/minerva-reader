-- Switch from derived balance to stored balances on user_credits.
-- included_balance: decremented on each usage, reset to allowance_dollars on subscription renewal.
-- extra_usage_balance: topped up via one-time payments, drawn from when included_balance is exhausted.

ALTER TABLE public.user_credits
  ADD COLUMN IF NOT EXISTS included_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_usage_balance numeric NOT NULL DEFAULT 0;

-- Remove metered billing column (no longer using Stripe metered overage)
ALTER TABLE public.user_credits
  DROP COLUMN IF EXISTS stripe_subscription_item_overage;
