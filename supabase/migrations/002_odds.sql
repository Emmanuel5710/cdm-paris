-- Run in Supabase SQL Editor after 001_balance_combined.sql

-- 1. Store the odds at time of betting
ALTER TABLE bets ADD COLUMN IF NOT EXISTS odds NUMERIC(6,2);

-- 2. Count distinct users who have placed at least one result bet
CREATE OR REPLACE FUNCTION count_active_bettors()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(DISTINCT user_id)::integer FROM bets WHERE bet_type = 'result';
$$;
