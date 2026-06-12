-- 019 — Fix award_bet_win and deduct_bet_loss
--
-- Bug: current_role inside SECURITY DEFINER returns the function OWNER
-- (postgres), not the caller's role. The check always failed → credits
-- never updated. Security is already enforced by REVOKE on these functions.

CREATE OR REPLACE FUNCTION award_bet_win(uid UUID, delta_balance INTEGER, original_stake INTEGER DEFAULT 0)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE profiles SET
    credits = COALESCE(credits, 0) + delta_balance,
    xp      = GREATEST(0, COALESCE(xp, 0) + (delta_balance - original_stake))
  WHERE id = uid;
END;
$$;

CREATE OR REPLACE FUNCTION deduct_bet_loss(uid UUID, stake INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE profiles SET
    xp = GREATEST(0, COALESCE(xp, 0) - stake)
  WHERE id = uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION award_bet_win(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION deduct_bet_loss(UUID, INTEGER)         FROM PUBLIC, anon, authenticated;

-- Reset the 4 affected bets so calculate-points can replay them
UPDATE bets SET processed = false, won = null
WHERE id IN (
  '05387014-f269-4069-8cfc-c73825dd4a57',  -- Y7 (lost)
  '8cce3471-acd1-429b-9223-1fa057d7b399',  -- alabasta result (won)
  '9a349de6-99b4-49ec-97d8-ca2fa4e4e041',  -- alabasta btts (lost)
  '5679b7b3-f9c6-431e-bebd-63af930e152f'   -- raven result (won)
);
