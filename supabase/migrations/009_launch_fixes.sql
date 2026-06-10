-- ================================================================
-- 009 — CORRECTIFS DE LANCEMENT
-- Run in Supabase SQL Editor
-- ================================================================

-- ================================================================
-- 1. Colonne bets.won
-- NULL = en attente, TRUE = gagné, FALSE = perdu
-- Permet de distinguer les paris gagnés/perdus/en attente côté client.
-- ================================================================
ALTER TABLE bets ADD COLUMN IF NOT EXISTS won BOOLEAN DEFAULT NULL;

-- ================================================================
-- 2. Contrainte credits >= 0 sur profiles
-- Évite tout crédit négatif en cas d'edge case serveur.
-- ================================================================
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_credits_non_negative;
ALTER TABLE profiles ADD CONSTRAINT profiles_credits_non_negative
  CHECK (credits >= 0);

-- ================================================================
-- 3. Validation bet_value (résultats seulement)
-- Un pari de type "result" ne peut valoir que home/away/draw.
-- Les paris avancés ont des valeurs libres (noms d'équipes, chiffres).
-- ================================================================
ALTER TABLE bets DROP CONSTRAINT IF EXISTS bets_result_value_check;
ALTER TABLE bets ADD CONSTRAINT bets_result_value_check CHECK (
  bet_type != 'result'
  OR bet_value IN ('home', 'away', 'draw')
);

-- ================================================================
-- Vérification
-- ================================================================
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'bets' AND column_name = 'won';
