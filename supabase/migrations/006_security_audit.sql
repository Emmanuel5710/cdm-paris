-- ================================================================
-- 006 — SECURITY AUDIT
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ================================================================


-- ================================================================
-- 1. FONCTIONS — Empêcher les appels cross-user depuis le client
--
-- Stratégie : SECURITY DEFINER s'exécute en tant que postgres.
--   • auth.uid() IS NULL  → appel via service_role (Edge Function) → autorisé sans restriction
--   • auth.uid() IS NOT NULL → appel client → uid doit correspondre à l'utilisateur connecté
-- ================================================================

CREATE OR REPLACE FUNCTION adjust_credits(uid UUID, delta INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() != uid THEN
    RAISE EXCEPTION 'Unauthorized: cannot adjust credits of another user';
  END IF;
  -- Depuis le client, le delta est borné au montant max d'une mise (stake <= 10 000)
  IF auth.uid() IS NOT NULL AND (delta < -10000 OR delta > 10000) THEN
    RAISE EXCEPTION 'Delta out of allowed range [-10000, 10000]';
  END IF;
  UPDATE profiles SET credits = credits + delta WHERE id = uid;
END;
$$;

CREATE OR REPLACE FUNCTION adjust_xp(uid UUID, delta INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() != uid THEN
    RAISE EXCEPTION 'Unauthorized: cannot adjust XP of another user';
  END IF;
  IF auth.uid() IS NOT NULL AND (delta < -10000 OR delta > 10000) THEN
    RAISE EXCEPTION 'Delta out of allowed range [-10000, 10000]';
  END IF;
  UPDATE profiles SET xp = xp + delta WHERE id = uid;
END;
$$;

-- award_bet_win : exclusivement réservée aux Edge Functions (service_role)
-- Un client ne doit jamais pouvoir s'auto-attribuer une victoire
CREATE OR REPLACE FUNCTION award_bet_win(uid UUID, delta_credits INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Unauthorized: award_bet_win is reserved for server-side calls';
  END IF;
  UPDATE profiles
  SET credits = COALESCE(credits, 500) + delta_credits,
      xp      = COALESCE(xp, 0)       + delta_credits
  WHERE id = uid;
END;
$$;


-- ================================================================
-- 2. PROFILES — RLS + protection des colonnes sensibles
-- ================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;
DROP POLICY IF EXISTS "profiles_delete"  ON profiles;

-- Lecture : tout utilisateur connecté peut lire tous les profils
-- (nécessaire pour les classements et les ligues)
CREATE POLICY "profiles_select"
  ON profiles FOR SELECT TO authenticated USING (true);

-- Création : un user ne peut créer que son propre profil
CREATE POLICY "profiles_insert"
  ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Mise à jour : seulement sa propre ligne
-- (credits/xp bloqués au niveau colonne ci-dessous)
CREATE POLICY "profiles_update"
  ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Suppression : interdite pour les utilisateurs
-- (aucune DELETE policy = seul le service_role peut supprimer)

-- Bloquer la modification directe de credits et xp via l'API REST
-- Les fonctions SECURITY DEFINER s'exécutant en tant que postgres
-- contournent cette restriction colonne — les mises à jour via RPC restent fonctionnelles
REVOKE UPDATE (credits, xp) ON profiles FROM authenticated;
REVOKE UPDATE (credits, xp) ON profiles FROM anon;

-- Forcer les valeurs par défaut de credits/xp à la création du profil
-- (empêche un client d'insérer credits: 999999)
CREATE OR REPLACE FUNCTION enforce_profile_defaults()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.credits = 500;
  NEW.xp      = 0;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_profile_defaults_trigger ON profiles;
CREATE TRIGGER enforce_profile_defaults_trigger
  BEFORE INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION enforce_profile_defaults();


-- ================================================================
-- 3. BETS — RLS
-- ================================================================

ALTER TABLE bets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bets_select" ON bets;
DROP POLICY IF EXISTS "bets_insert" ON bets;
DROP POLICY IF EXISTS "bets_update" ON bets;
DROP POLICY IF EXISTS "bets_delete"  ON bets;

-- Lecture : tout le monde (cotes en direct, scores de ligue)
CREATE POLICY "bets_select"
  ON bets FOR SELECT TO authenticated USING (true);

-- Insertion : seulement ses propres paris
CREATE POLICY "bets_insert"
  ON bets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Mise à jour directe interdite pour les clients
-- (processed = true est mis à jour par l'Edge Function via service_role)
-- Aucune UPDATE policy pour authenticated.

-- Suppression : uniquement ses paris non encore traités
CREATE POLICY "bets_delete"
  ON bets FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND processed = false);

-- Contrainte sur la mise
ALTER TABLE bets DROP CONSTRAINT IF EXISTS bets_stake_range;
ALTER TABLE bets ADD CONSTRAINT bets_stake_range
  CHECK (stake >= 10 AND stake <= 10000);


-- ================================================================
-- 4. COMBINED_BETS — compléter le RLS existant
-- ================================================================

-- Les politiques SELECT/INSERT/UPDATE existent déjà (migration 001)
-- On ajoute la suppression et on corrige les contraintes

DROP POLICY IF EXISTS "combined_bets_delete" ON combined_bets;
CREATE POLICY "combined_bets_delete"
  ON combined_bets FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND status = 'pending');

-- Contrainte sur la mise
ALTER TABLE combined_bets DROP CONSTRAINT IF EXISTS combined_bets_stake_range;
ALTER TABLE combined_bets ADD CONSTRAINT combined_bets_stake_range
  CHECK (stake >= 10 AND stake <= 10000);

-- Contrainte sur le multiplicateur : empêche un client de gonfler ses gains
-- (2 matchs min → multiplicateur min ~2, 10 matchs max → ~1000 en théorie,
--  on plafonne à 500 ce qui est déjà très généreux)
ALTER TABLE combined_bets DROP CONSTRAINT IF EXISTS combined_bets_multiplier_range;
ALTER TABLE combined_bets ADD CONSTRAINT combined_bets_multiplier_range
  CHECK (multiplier >= 1 AND multiplier <= 500);


-- ================================================================
-- 5. LEAGUES — RLS
-- ================================================================

ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leagues_select" ON leagues;
DROP POLICY IF EXISTS "leagues_insert" ON leagues;
DROP POLICY IF EXISTS "leagues_update" ON leagues;
DROP POLICY IF EXISTS "leagues_delete"  ON leagues;

-- Lecture : tout le monde (lookup par invite_code)
CREATE POLICY "leagues_select"
  ON leagues FOR SELECT TO authenticated USING (true);

-- Création : owner_id doit être l'utilisateur connecté
CREATE POLICY "leagues_insert"
  ON leagues FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);

-- Modification / suppression : uniquement le propriétaire
CREATE POLICY "leagues_update"
  ON leagues FOR UPDATE TO authenticated USING (auth.uid() = owner_id);

CREATE POLICY "leagues_delete"
  ON leagues FOR DELETE TO authenticated USING (auth.uid() = owner_id);


-- ================================================================
-- 6. LEAGUE_MEMBERS — RLS
-- ================================================================

ALTER TABLE league_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "league_members_select" ON league_members;
DROP POLICY IF EXISTS "league_members_insert" ON league_members;
DROP POLICY IF EXISTS "league_members_delete"  ON league_members;

-- Lecture : tout le monde (scores de ligue)
CREATE POLICY "league_members_select"
  ON league_members FOR SELECT TO authenticated USING (true);

-- Rejoindre : seulement pour soi-même
CREATE POLICY "league_members_insert"
  ON league_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Quitter : seulement sa propre entrée
CREATE POLICY "league_members_delete"
  ON league_members FOR DELETE TO authenticated USING (auth.uid() = user_id);


-- ================================================================
-- 7. MATCHES — RLS (lecture publique, écriture service_role uniquement)
-- ================================================================

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "matches_select" ON matches;

-- Lecture : tout le monde, même non connecté
CREATE POLICY "matches_select"
  ON matches FOR SELECT USING (true);

-- Aucune politique INSERT/UPDATE/DELETE pour authenticated/anon
-- → seul le service_role (Edge Functions) peut modifier les matchs


-- ================================================================
-- Vérification finale
-- ================================================================
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('profiles','bets','combined_bets','leagues','league_members','matches');
