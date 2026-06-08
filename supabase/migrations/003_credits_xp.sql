-- Run in Supabase SQL Editor after 002_odds.sql

-- 1. Rename balance → credits
ALTER TABLE profiles RENAME COLUMN balance TO credits;

-- 2. New users start with 100 credits (not 1000)
ALTER TABLE profiles ALTER COLUMN credits SET DEFAULT 100;

-- 3. Add XP column — earned only by winning bets, used for ranking
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0;

-- 4. Replace adjust_balance with adjust_credits
DROP FUNCTION IF EXISTS adjust_balance(UUID, INTEGER);
CREATE OR REPLACE FUNCTION adjust_credits(uid UUID, delta INTEGER)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE profiles SET credits = credits + delta WHERE id = uid;
$$;

-- 5. Add adjust_xp (used directly when needed)
CREATE OR REPLACE FUNCTION adjust_xp(uid UUID, delta INTEGER)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE profiles SET xp = xp + delta WHERE id = uid;
$$;

-- 6. Update award_bet_win: credits += payout AND xp += payout (no longer touches points_total)
CREATE OR REPLACE FUNCTION award_bet_win(uid UUID, delta_credits INTEGER)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE profiles
  SET credits = COALESCE(credits, 100) + delta_credits,
      xp      = COALESCE(xp, 0)       + delta_credits
  WHERE id = uid;
$$;
