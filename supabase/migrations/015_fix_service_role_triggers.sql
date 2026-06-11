-- ================================================================
-- 015 — FIX TRIGGERS POUR SERVICE ROLE (calculate-points)
-- ================================================================

-- FIX 1 : guard_bet_match_not_finished doit laisser passer
-- les updates du service_role (qui marquent processed=true sur
-- des matchs terminés — c'est exactement son rôle).
CREATE OR REPLACE FUNCTION guard_bet_match_not_finished()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status TEXT;
BEGIN
  -- Autoriser le service_role (calculate-points, edge functions)
  IF auth.uid() IS NULL AND TG_OP = 'UPDATE' THEN RETURN NEW; END IF;

  SELECT status INTO v_status FROM matches WHERE id = NEW.match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match % introuvable', NEW.match_id;
  END IF;
  IF v_status IN ('finished', 'inplay') THEN
    RAISE EXCEPTION 'Ce match est en cours ou terminé — impossible de parier';
  END IF;
  RETURN NEW;
END;
$$;

-- FIX 2 : prevent_combined_bet_update doit laisser passer
-- les updates du service_role (status pending→won/lost).
CREATE OR REPLACE FUNCTION prevent_combined_bet_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Autoriser le service_role (calculate-points)
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Un pari combiné ne peut pas être modifié après placement';
END;
$$;
