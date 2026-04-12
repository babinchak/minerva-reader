-- Add cached_input_tokens column if missing (code writes it but migration never created it)
ALTER TABLE public.usage_records
  ADD COLUMN IF NOT EXISTS cached_input_tokens integer;

-- Allow anonymous usage records (lambdas may not have a user_id)
ALTER TABLE public.usage_records
  ALTER COLUMN user_id DROP NOT NULL;

-- Trigger function: on usage_records INSERT, deduct from user_credits balances.
-- Deducts from included_balance first, overflow to extra_usage_balance.
-- Sets NEW.included to reflect which balance was used.
-- Skips if user_id is null (anonymous) or cost_dollars <= 0.
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
    IF NEW.user_id IS NULL THEN
      NEW.included := false;
    END IF;
    RETURN NEW;
  END IF;

  -- Lock the user_credits row to prevent concurrent deduction races
  SELECT included_balance, extra_usage_balance, extra_usage_spent
    INTO v_included_balance, v_extra_balance, v_extra_spent
    FROM public.user_credits
    WHERE user_id = NEW.user_id
    FOR UPDATE;

  -- No credits row exists — record as not included, no deduction
  IF NOT FOUND THEN
    NEW.included := false;
    RETURN NEW;
  END IF;

  -- Deduction logic: included first, then extra
  IF v_included_balance >= NEW.cost_dollars THEN
    v_deduct_included := NEW.cost_dollars;
    NEW.included := true;
  ELSIF v_included_balance > 0 THEN
    v_deduct_included := v_included_balance;
    v_deduct_extra := NEW.cost_dollars - v_included_balance;
    NEW.included := false;
  ELSE
    v_deduct_extra := NEW.cost_dollars;
    NEW.included := false;
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

-- Attach trigger (BEFORE INSERT so we can modify NEW.included)
DROP TRIGGER IF EXISTS trg_deduct_usage_balance ON public.usage_records;
CREATE TRIGGER trg_deduct_usage_balance
  BEFORE INSERT ON public.usage_records
  FOR EACH ROW
  EXECUTE FUNCTION public.deduct_usage_balance();
