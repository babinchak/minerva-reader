-- Drop the included column from usage_records
ALTER TABLE public.usage_records DROP COLUMN IF EXISTS included;

-- Update trigger function to remove included references
CREATE OR REPLACE FUNCTION public.deduct_usage_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_included_balance numeric;
  v_extra_balance numeric;
  v_extra_spent numeric;
  v_deduct_included numeric := 0;
  v_deduct_extra numeric := 0;
BEGIN
  -- Skip for anonymous or zero-cost
  IF NEW.user_id IS NULL OR NEW.cost_dollars <= 0 THEN
    RETURN NEW;
  END IF;

  -- Lock the user_credits row to prevent concurrent deduction races
  SELECT included_balance, extra_usage_balance, extra_usage_spent
    INTO v_included_balance, v_extra_balance, v_extra_spent
    FROM public.user_credits
    WHERE user_id = NEW.user_id
    FOR UPDATE;

  -- No credits row exists — no deduction
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Deduction logic: included first, then extra
  IF v_included_balance >= NEW.cost_dollars THEN
    v_deduct_included := NEW.cost_dollars;
  ELSIF v_included_balance > 0 THEN
    v_deduct_included := v_included_balance;
    v_deduct_extra := NEW.cost_dollars - v_included_balance;
  ELSE
    v_deduct_extra := NEW.cost_dollars;
  END IF;

  -- Apply deductions
  UPDATE public.user_credits
    SET included_balance = GREATEST(0, included_balance - v_deduct_included),
        extra_usage_balance = GREATEST(0, extra_usage_balance - v_deduct_extra),
        extra_usage_spent = extra_usage_spent + v_deduct_extra,
        updated_at = now()
    WHERE user_id = NEW.user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
