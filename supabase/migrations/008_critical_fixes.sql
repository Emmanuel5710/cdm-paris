-- ================================================================
-- 008 — CORRECTIFS CRITIQUES
-- Run in Supabase SQL Editor
-- ================================================================

-- ================================================================
-- FIX 1 — award_bet_win : mismatch paramètre
-- L'edge function appelle { delta_balance } mais la fonction
-- attendait delta_credits depuis la migration 003.
-- Les gains n'étaient jamais attribués.
-- ================================================================
CREATE OR REPLACE FUNCTION award_bet_win(uid UUID, delta_balance INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Réservé aux edge functions (service_role) — auth.uid() est NULL dans ce contexte
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Unauthorized: award_bet_win is server-side only';
  END IF;
  UPDATE profiles
  SET credits = COALESCE(credits, 500) + delta_balance,
      xp      = COALESCE(xp, 0)       + delta_balance
  WHERE id = uid;
END;
$$;

-- ================================================================
-- FIX 2 — Colonne is_admin sur profiles
-- Remplace le check d'email hardcodé côté React et edge functions.
-- ================================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Attribuer le rôle admin à l'email du propriétaire
UPDATE profiles
SET is_admin = true
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'emmanuelfayard57@gmail.com'
);

-- Empêcher tout utilisateur de s'auto-promouvoir admin via l'API
REVOKE UPDATE (is_admin) ON profiles FROM authenticated;
REVOKE UPDATE (is_admin) ON profiles FROM anon;

-- Vérification
SELECT id, username, is_admin FROM profiles WHERE is_admin = true;
