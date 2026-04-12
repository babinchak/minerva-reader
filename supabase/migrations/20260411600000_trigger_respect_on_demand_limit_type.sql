CREATE OR REPLACE FUNCTION public.deduct_usage_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_included_balance numeric;
  v_extra_balance numeric;
  v_extra_spent numeric;
  v_on_demand_limit_type text;
  v_on_demand_limit_dollars numeric;
  v_deduct_included numeric := 0;
  v_deduct_extra numeric := 0;
BEGIN
  -- Skip for anonymous or zero-cost
  IF NEW.user_id IS NULL OR NEW.cost_dollars <= 0 THEN
    RETURN NEW;
  END IF;

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
    RETURN NEW;
  END IF;

  -- Deduction logic: included first, then extra (if allowed)
  IF v_included_balance >= NEW.cost_dollars THEN
    v_deduct_included := NEW.cost_dollars;
  ELSIF v_included_balance > 0 THEN
    v_deduct_included := v_included_balance;
    -- Only overflow to extra if on-demand is not disabled
    IF v_on_demand_limit_type IS DISTINCT FROM 'disabled' THEN
      v_deduct_extra := NEW.cost_dollars - v_included_balance;
    END IF;
  ELSE
    -- Entirely from extra (if allowed)
    IF v_on_demand_limit_type IS DISTINCT FROM 'disabled' THEN
      v_deduct_extra := NEW.cost_dollars;
    END IF;
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
