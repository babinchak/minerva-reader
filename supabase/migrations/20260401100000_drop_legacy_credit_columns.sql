-- Drop legacy credit columns from user_credits (replaced by cents-based system)
ALTER TABLE public.user_credits DROP COLUMN IF EXISTS balance;
ALTER TABLE public.user_credits DROP COLUMN IF EXISTS monthly_allowance;
ALTER TABLE public.user_credits DROP COLUMN IF EXISTS on_demand_credits_this_period;
