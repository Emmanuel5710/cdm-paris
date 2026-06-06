-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- 1. Add balance to profiles (starting balance 1000 pts for everyone)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS balance INTEGER NOT NULL DEFAULT 1000;

-- 2. Add stake + processed tracking to bets
ALTER TABLE bets ADD COLUMN IF NOT EXISTS stake INTEGER NOT NULL DEFAULT 10;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS processed BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark ALL existing bets as processed so the new edge function doesn't re-award them
UPDATE bets SET processed = TRUE;

-- 3. Combined bets table
CREATE TABLE IF NOT EXISTS combined_bets (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID        REFERENCES auth.users(id) NOT NULL,
  match_ids    JSONB       NOT NULL,          -- [401739001, 401739002, ...]
  predictions  JSONB       NOT NULL,          -- {"401739001": "home", ...}
  matches_info JSONB       NOT NULL DEFAULT '{}', -- {"401739001": {"home": "France", "away": "Maroc"}}
  multiplier   INTEGER     NOT NULL,
  stake        INTEGER     NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT combined_bets_status_check CHECK (status IN ('pending', 'won', 'lost'))
);

ALTER TABLE combined_bets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "combined_bets_select" ON combined_bets;
DROP POLICY IF EXISTS "combined_bets_insert" ON combined_bets;
DROP POLICY IF EXISTS "combined_bets_update" ON combined_bets;

CREATE POLICY "combined_bets_select" ON combined_bets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "combined_bets_insert" ON combined_bets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "combined_bets_update" ON combined_bets FOR UPDATE USING (auth.uid() = user_id);

-- 4. Atomic balance adjustment function (avoids race conditions)
CREATE OR REPLACE FUNCTION adjust_balance(uid UUID, delta INTEGER)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE profiles SET balance = balance + delta WHERE id = uid;
$$;

-- 5. Award correct bet: +1 point + stake payout (stake * 2 since stake was deducted on placement)
CREATE OR REPLACE FUNCTION award_bet_win(uid UUID, delta_balance INTEGER)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE profiles
  SET points_total = COALESCE(points_total, 0) + 1,
      balance      = COALESCE(balance, 1000) + delta_balance
  WHERE id = uid;
$$;
