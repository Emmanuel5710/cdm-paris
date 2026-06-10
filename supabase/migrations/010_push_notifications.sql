-- ================================================================
-- 010 — PUSH NOTIFICATIONS (PWA Web Push)
-- Run in Supabase SQL Editor
-- ================================================================

-- Table des abonnements push
-- Chaque navigateur/appareil d'un utilisateur génère une subscription unique.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint   TEXT        NOT NULL,
  p256dh     TEXT        NOT NULL,
  auth_key   TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_select"  ON push_subscriptions;
DROP POLICY IF EXISTS "push_insert"  ON push_subscriptions;
DROP POLICY IF EXISTS "push_delete"  ON push_subscriptions;

-- Un utilisateur ne gère que ses propres abonnements
CREATE POLICY "push_select"  ON push_subscriptions FOR SELECT  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "push_insert"  ON push_subscriptions FOR INSERT  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "push_delete"  ON push_subscriptions FOR DELETE  TO authenticated USING (auth.uid() = user_id);
