-- 1. Create app_config table for runtime settings
CREATE TABLE IF NOT EXISTS public.app_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Seed the usage cost rate (multiplier applied to raw cost for balance deduction)
INSERT INTO public.app_config (key, value, description)
VALUES ('usage_cost_rate', '1', 'Multiplier applied to raw usage cost when deducting from user balance')
ON CONFLICT (key) DO NOTHING;

-- 2. Add columns to usage_records for trigger stamping
ALTER TABLE public.usage_records
  ADD COLUMN IF NOT EXISTS billed_dollars numeric,
  ADD COLUMN IF NOT EXISTS deduction_type text,
  ADD COLUMN IF NOT EXISTS processed boolean DEFAULT false;

-- 3. Updated trigger: reads cost rate from app_config, applies multiplier, stamps row
CREATE OR REPLACE FUNCTION public.deduct_usage_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_included_balance numeric;
  v_extra_balance numeric;
  v_extra_spent numeric;
  v_on_demand_limit_type text;
  v_on_demand_limit_dollars numeric;
  v_cost_rate numeric;
  v_billed numeric;
  v_deduct_included numeric := 0;
  v_deduct_extra numeric := 0;
  v_deduction_type text := 'none';
BEGIN
  -- Skip for anonymous or zero-cost
  IF NEW.user_id IS NULL OR NEW.cost_dollars <= 0 THEN
    NEW.billed_dollars := 0;
    NEW.deduction_type := 'none';
    NEW.processed := true;
    RETURN NEW;
  END IF;

  -- Read cost rate from app_config (default 1 if missing)
  SELECT COALESCE(value::numeric, 1) INTO v_cost_rate
    FROM public.app_config WHERE key = 'usage_cost_rate';
  IF v_cost_rate IS NULL OR v_cost_rate <= 0 THEN
    v_cost_rate := 1;
  END IF;

  v_billed := NEW.cost_dollars * v_cost_rate;

  -- Lock the user_credits row to prevent concurrent deduction races
  SELECT included_balance, extra_usage_balance, extra_usage_spent,
         on_demand_limit_type, on_demand_limit_dollars
    INTO v_included_balance, v_extra_balance, v_extra_spent,
         v_on_demand_limit_type, v_on_demand_limit_dollars
    FROM public.user_credits
    WHERE user_id = NEW.user_id
    FOR UPDATE;

  -- No credits row exists — no deduction
  IF NOT FOUND THEN
    NEW.billed_dollars := v_billed;
    NEW.deduction_type := 'none';
    NEW.processed := true;
    RETURN NEW;
  END IF;

  -- Deduction logic: included first, then extra (if allowed)
  IF v_included_balance >= v_billed THEN
    v_deduct_included := v_billed;
    v_deduction_type := 'included';
  ELSIF v_included_balance > 0 THEN
    v_deduct_included := v_included_balance;
    IF v_on_demand_limit_type IS DISTINCT FROM 'disabled' THEN
      v_deduct_extra := v_billed - v_included_balance;
      v_deduction_type := 'both';
    ELSE
      v_deduction_type := 'included';
    END IF;
  ELSE
    IF v_on_demand_limit_type IS DISTINCT FROM 'disabled' THEN
      v_deduct_extra := v_billed;
      v_deduction_type := 'extra';
    END IF;
  END IF;

  -- Apply deductions
  UPDATE public.user_credits
    SET included_balance = GREATEST(0, included_balance - v_deduct_included),
        extra_usage_balance = GREATEST(0, extra_usage_balance - v_deduct_extra),
        extra_usage_spent = extra_usage_spent + v_deduct_extra,
        updated_at = now()
    WHERE user_id = NEW.user_id;

  -- Stamp the row
  NEW.billed_dollars := v_billed;
  NEW.deduction_type := v_deduction_type;
  NEW.processed := true;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
