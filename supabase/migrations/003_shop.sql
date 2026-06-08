-- Run in Supabase SQL Editor after 002_odds.sql

-- Shop: daily purchase tracking columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_purchase_date DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS daily_purchased INTEGER NOT NULL DEFAULT 0;
