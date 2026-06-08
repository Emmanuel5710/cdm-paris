-- Run in Supabase SQL Editor

-- 1. New users start with 500 credits
ALTER TABLE profiles ALTER COLUMN credits SET DEFAULT 500;

-- 2. Update existing users who still have old default values
UPDATE profiles SET credits = 500 WHERE credits IN (100, 1000);
