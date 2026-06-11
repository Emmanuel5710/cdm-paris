-- 017 — Sync XP with bet outcomes
--
-- Win  : XP += payout - stake  (net gain only, same as credits net gain)
-- Loss : XP -= stake           (same deduction as credits, floored at 0)
-- XP is enforced >= 0 at column level and in every function

-- Enforce XP >= 0 at DB level
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS xp_non_negative;
ALTER TABLE profiles ADD CONSTRAINT xp_non_negative CHECK (xp >= 0);

-- Fix adjust_xp to also floor at 0
CREATE OR REPLACE FUNCTION adjust_xp(uid UUID, delta INTEGER)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE profiles SET xp = GREATEST(0, COALESCE(xp, 0) + delta) WHERE id = uid;
END;
$$;

-- award_bet_win now takes optional stake param to compute net XP
CREATE OR REPLACE FUNCTION award_bet_win(uid UUID, delta_balance INTEGER, original_stake INTEGER DEFAULT 0)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF current_role NOT IN ('service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'Unauthorized: award_bet_win is server-side only';
  END IF;
  UPDATE profiles SET
    credits = COALESCE(credits, 0) + delta_balance,
    xp      = GREATEST(0, COALESCE(xp, 0) + (delta_balance - original_stake))
  WHERE id = uid;
END;
$$;

-- deduct_bet_loss: deduct XP when a bet is lost (credits already deducted at place time)
CREATE OR REPLACE FUNCTION deduct_bet_loss(uid UUID, stake INTEGER)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF current_role NOT IN ('service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'Unauthorized: deduct_bet_loss is server-side only';
  END IF;
  UPDATE profiles SET
    xp = GREATEST(0, COALESCE(xp, 0) - stake)
  WHERE id = uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION award_bet_win(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION deduct_bet_loss(UUID, INTEGER)         FROM PUBLIC, anon, authenticated;
