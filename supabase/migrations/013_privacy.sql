-- ================================================================
-- 013 — PRIVACY : colonnes sensibles + RPCs sécurisés
-- ================================================================

-- Helper SECURITY DEFINER : évite la récursion infinie dans les policies
CREATE OR REPLACE FUNCTION get_my_league_id()
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (SELECT league_id FROM league_members WHERE user_id = auth.uid() LIMIT 1);
END;
$$;

-- Restreindre leagues : visible uniquement si proprio ou membre
DROP POLICY IF EXISTS "leagues_select" ON leagues;
CREATE POLICY "leagues_select" ON leagues FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR id = get_my_league_id());

-- Restreindre league_members : visibles seulement dans ta ligue
DROP POLICY IF EXISTS "league_members_select" ON league_members;
CREATE POLICY "league_members_select" ON league_members FOR SELECT TO authenticated
  USING (league_id = get_my_league_id());

-- Révoquer credits et is_admin sur profiles (visibles uniquement via get_my_profile)
REVOKE SELECT (is_admin, credits) ON profiles FROM authenticated;
REVOKE SELECT (is_admin, credits) ON profiles FROM anon;
GRANT SELECT (id, username, xp) ON profiles TO authenticated;
GRANT SELECT (id, username, xp) ON profiles TO anon;

-- get_my_profile() : profil complet de l'utilisateur connecté
CREATE OR REPLACE FUNCTION get_my_profile()
RETURNS TABLE(id UUID, username TEXT, credits INTEGER, xp INTEGER, is_admin BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
    SELECT p.id, p.username, p.credits, p.xp, p.is_admin
    FROM profiles p
    WHERE p.id = auth.uid();
END;
$$;

-- join_league_by_code() : rejoindre une ligue via code d'invitation
CREATE OR REPLACE FUNCTION join_league_by_code(p_invite_code TEXT)
RETURNS TABLE(id UUID, name TEXT, invite_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_league_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  SELECT l.id INTO v_league_id FROM leagues l WHERE l.invite_code = p_invite_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'Code invalide'; END IF;

  IF EXISTS (SELECT 1 FROM league_members lm WHERE lm.user_id = v_uid) THEN
    RAISE EXCEPTION 'Tu es déjà dans une ligue';
  END IF;

  INSERT INTO league_members (league_id, user_id) VALUES (v_league_id, v_uid)
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT l.id, l.name, l.invite_code FROM leagues l WHERE l.id = v_league_id;
END;
$$;
