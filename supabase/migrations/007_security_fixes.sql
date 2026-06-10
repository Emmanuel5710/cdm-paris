-- ================================================================
-- 007 — CORRECTIFS 4 FAILLES RESTANTES
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ================================================================


-- ================================================================
-- FAILLE 1 — Parier sur un match déjà terminé
--
-- Protège à la fois INSERT et UPDATE (changer son pronostic après
-- la fin du match) sur bets, ainsi que INSERT sur combined_bets.
-- ================================================================

CREATE OR REPLACE FUNCTION guard_bet_match_not_finished()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status TEXT;
BEGIN
  SELECT status INTO v_status FROM matches WHERE id = NEW.match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match % introuvable', NEW.match_id;
  END IF;
  IF v_status = 'finished' THEN
    RAISE EXCEPTION 'Ce match est déjà terminé — impossible de parier ou de modifier un pronostic';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_bet_insert ON bets;
CREATE TRIGGER guard_bet_insert
  BEFORE INSERT ON bets
  FOR EACH ROW EXECUTE FUNCTION guard_bet_match_not_finished();

DROP TRIGGER IF EXISTS guard_bet_update ON bets;
CREATE TRIGGER guard_bet_update
  BEFORE UPDATE ON bets
  FOR EACH ROW EXECUTE FUNCTION guard_bet_match_not_finished();

-- Pour les combinés : aucun des matchs ne doit être terminé
CREATE OR REPLACE FUNCTION guard_combined_bet_matches_not_finished()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM matches
  WHERE id = ANY(
    ARRAY(SELECT (e::TEXT)::BIGINT FROM jsonb_array_elements(NEW.match_ids) AS e)
  )
  AND status = 'finished';

  IF v_count > 0 THEN
    RAISE EXCEPTION 'Un ou plusieurs matchs du combiné sont déjà terminés';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_combined_bet_insert ON combined_bets;
CREATE TRIGGER guard_combined_bet_insert
  BEFORE INSERT ON combined_bets
  FOR EACH ROW EXECUTE FUNCTION guard_combined_bet_matches_not_finished();


-- ================================================================
-- FAILLE 2 — Crédits non déduits (opérations non atomiques)
--
-- L'INSERT du pari et la déduction des crédits se font en deux
-- appels séparés côté React. Un attaquant peut insérer via l'API
-- sans jamais appeler adjust_credits.
--
-- Solution : 3 fonctions RPC qui font tout en une seule transaction.
--   • place_bet(...)         — remplace INSERT bets + adjust_credits(-stake)
--   • cancel_bet(...)        — remplace DELETE bets + adjust_credits(+stake)
--   • place_combined_bet(…)  — remplace INSERT combined_bets + adjust_credits(-stake)
--
-- CHANGEMENTS REACT REQUIS (voir bas de fichier) :
--   Matches.jsx   → placeBet()   appelle supabase.rpc("place_bet",  {...})
--   Matches.jsx   → cancelBet()  appelle supabase.rpc("cancel_bet", {...})
--   Combined.jsx  → validate()   appelle supabase.rpc("place_combined_bet", {...})
-- ================================================================

-- ── place_bet ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION place_bet(
  p_match_id  BIGINT,
  p_bet_type  TEXT,
  p_bet_value TEXT,
  p_stake     INTEGER,
  p_odds      NUMERIC DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid     UUID    := auth.uid();
  v_credits INTEGER;
  v_status  TEXT;
  v_bet_id  UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF p_stake < 10 OR p_stake > 10000 THEN
    RAISE EXCEPTION 'Mise invalide — doit être entre 10 et 10 000';
  END IF;

  -- Vérifier que le match n'est pas terminé
  SELECT status INTO v_status FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match introuvable'; END IF;
  IF v_status = 'finished' THEN RAISE EXCEPTION 'Ce match est déjà terminé'; END IF;

  -- Verrouiller la ligne profil pour éviter les race conditions
  SELECT credits INTO v_credits FROM profiles WHERE id = v_uid FOR UPDATE;
  IF v_credits < p_stake THEN
    RAISE EXCEPTION 'Crédits insuffisants (avoir : %, mise : %)', v_credits, p_stake;
  END IF;

  -- Déduire les crédits et insérer le pari dans la même transaction
  UPDATE profiles SET credits = credits - p_stake WHERE id = v_uid;
  INSERT INTO bets (user_id, match_id, bet_type, bet_value, stake, odds, processed)
  VALUES (v_uid, p_match_id, p_bet_type, p_bet_value, p_stake, p_odds, false)
  RETURNING id INTO v_bet_id;

  RETURN v_bet_id;
END;
$$;

-- ── cancel_bet ───────────────────────────────────────────────────
-- Prend match_id + bet_type (correspondent aux paramètres déjà
-- disponibles dans cancelBet() côté React, sans changer la signature).
CREATE OR REPLACE FUNCTION cancel_bet(
  p_match_id BIGINT,
  p_bet_type TEXT
)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid       UUID    := auth.uid();
  v_bet_id    UUID;
  v_stake     INTEGER;
  v_processed BOOLEAN;
  v_status    TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  -- Trouver et verrouiller le pari
  SELECT id, stake, processed
  INTO v_bet_id, v_stake, v_processed
  FROM bets
  WHERE user_id = v_uid AND match_id = p_match_id AND bet_type = p_bet_type
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Pari introuvable'; END IF;
  IF v_processed THEN RAISE EXCEPTION 'Ce pari a déjà été traité'; END IF;

  SELECT status INTO v_status FROM matches WHERE id = p_match_id;
  IF v_status = 'finished' THEN
    RAISE EXCEPTION 'Impossible d''annuler un pari sur un match terminé';
  END IF;

  -- Supprimer le pari et rembourser dans la même transaction
  DELETE FROM bets WHERE id = v_bet_id;
  UPDATE profiles SET credits = credits + v_stake WHERE id = v_uid;

  RETURN v_stake;
END;
$$;

-- ── place_combined_bet ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION place_combined_bet(
  p_match_ids    JSONB,
  p_predictions  JSONB,
  p_matches_info JSONB,
  p_multiplier   INTEGER,
  p_stake        INTEGER
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid         UUID    := auth.uid();
  v_credits     INTEGER;
  v_n           INTEGER;
  v_expected    INTEGER;
  v_finished_ct INTEGER;
  v_cb_id       UUID;
  -- Miroir exact de MULTS dans Combined.jsx (index 1-based, décalé de 1)
  -- MULTS[3]=2, [4]=4, [5]=6, [6]=10, [7]=13, [8]=17, [9]=20, [10]=23, [11]=25
  v_mults       INTEGER[] := ARRAY[NULL,NULL,2,4,6,10,13,17,20,23,25];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF p_stake < 10 OR p_stake > 10000 THEN
    RAISE EXCEPTION 'Mise invalide — doit être entre 10 et 10 000';
  END IF;

  v_n := jsonb_array_length(p_match_ids);
  IF v_n < 2 OR v_n > 10 THEN
    RAISE EXCEPTION 'Combiné invalide — entre 2 et 10 matchs';
  END IF;

  -- Valider le multiplicateur contre la table exacte (pas juste un plafond)
  v_expected := v_mults[v_n + 1];
  IF p_multiplier IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Multiplicateur invalide pour % matchs (attendu : ×%, reçu : ×%)',
      v_n, v_expected, p_multiplier;
  END IF;

  -- Aucun match ne doit être terminé
  SELECT COUNT(*) INTO v_finished_ct
  FROM matches
  WHERE id = ANY(
    ARRAY(SELECT (e::TEXT)::BIGINT FROM jsonb_array_elements(p_match_ids) AS e)
  )
  AND status = 'finished';
  IF v_finished_ct > 0 THEN
    RAISE EXCEPTION 'Un ou plusieurs matchs sont déjà terminés';
  END IF;

  -- Verrouiller et vérifier les crédits
  SELECT credits INTO v_credits FROM profiles WHERE id = v_uid FOR UPDATE;
  IF v_credits < p_stake THEN
    RAISE EXCEPTION 'Crédits insuffisants (avoir : %, mise : %)', v_credits, p_stake;
  END IF;

  -- Déduire et insérer dans la même transaction
  UPDATE profiles SET credits = credits - p_stake WHERE id = v_uid;
  INSERT INTO combined_bets (user_id, match_ids, predictions, matches_info, multiplier, stake, status)
  VALUES (v_uid, p_match_ids, p_predictions, p_matches_info, p_multiplier, p_stake, 'pending')
  RETURNING id INTO v_cb_id;

  RETURN v_cb_id;
END;
$$;


-- ================================================================
-- FAILLE 3 — Multiplicateur contrôlé par le client
--
-- Remplace le CHECK générique (multiplier <= 500) par la validation
-- exacte de la table MULTS du frontend.
-- 2→×2, 3→×4, 4→×6, 5→×10, 6→×13, 7→×17, 8→×20, 9→×23, 10→×25
-- ================================================================

ALTER TABLE combined_bets DROP CONSTRAINT IF EXISTS combined_bets_multiplier_range;
ALTER TABLE combined_bets DROP CONSTRAINT IF EXISTS combined_bets_valid_multiplier;
ALTER TABLE combined_bets ADD CONSTRAINT combined_bets_valid_multiplier CHECK (
  (jsonb_array_length(match_ids) = 2  AND multiplier = 2)  OR
  (jsonb_array_length(match_ids) = 3  AND multiplier = 4)  OR
  (jsonb_array_length(match_ids) = 4  AND multiplier = 6)  OR
  (jsonb_array_length(match_ids) = 5  AND multiplier = 10) OR
  (jsonb_array_length(match_ids) = 6  AND multiplier = 13) OR
  (jsonb_array_length(match_ids) = 7  AND multiplier = 17) OR
  (jsonb_array_length(match_ids) = 8  AND multiplier = 20) OR
  (jsonb_array_length(match_ids) = 9  AND multiplier = 23) OR
  (jsonb_array_length(match_ids) = 10 AND multiplier = 25)
);


-- ================================================================
-- FAILLE 4 — Paris multiples sur le même match
-- ================================================================

ALTER TABLE bets DROP CONSTRAINT IF EXISTS one_bet_per_user_per_match_type;
ALTER TABLE bets ADD CONSTRAINT one_bet_per_user_per_match_type
  UNIQUE (user_id, match_id, bet_type);


-- ================================================================
-- BONUS — Empêcher la modification de la mise après placement
-- (un attaquant pouvait UPDATE stake=10000 juste avant la fin du match)
-- ================================================================

CREATE OR REPLACE FUNCTION prevent_stake_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stake IS DISTINCT FROM OLD.stake THEN
    RAISE EXCEPTION 'La mise ne peut pas être modifiée après le placement';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_stake_change ON bets;
CREATE TRIGGER prevent_stake_change
  BEFORE UPDATE ON bets
  FOR EACH ROW EXECUTE FUNCTION prevent_stake_change();


-- ================================================================
-- VÉRIFICATION
-- ================================================================
SELECT
  trigger_name,
  event_manipulation,
  event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN ('bets', 'combined_bets', 'profiles')
ORDER BY event_object_table, trigger_name;


-- ================================================================
-- CHANGEMENTS REACT À FAIRE APRÈS (Faille 2 seulement)
-- ================================================================
--
-- ── Matches.jsx — function placeBet() ──────────────────────────
--
-- AVANT :
--   await supabase.from("bets").insert({ user_id, match_id, ... })
--   await supabase.rpc("adjust_credits", { uid: user.id, delta: -stake })
--
-- APRÈS :
--   const { data: betId, error } = await supabase.rpc("place_bet", {
--     p_match_id:  id,
--     p_bet_type:  betType,
--     p_bet_value: betValue,
--     p_stake:     stake,
--     p_odds:      liveOdds,
--   })
--   if (error) { /* gérer l'erreur */ return }
--   // Ne plus appeler adjust_credits
--
-- ── Matches.jsx — function cancelBet() ─────────────────────────
--
-- AVANT :
--   await supabase.from("bets").delete().eq("user_id", ...).eq("match_id", ...).eq("bet_type", ...)
--   await supabase.rpc("adjust_credits", { uid: user.id, delta: stake })
--
-- APRÈS :
--   const { error } = await supabase.rpc("cancel_bet", {
--     p_match_id: id,
--     p_bet_type: betType,
--   })
--   if (error) { /* gérer l'erreur */ return }
--   // Le remboursement est automatique — ne plus appeler adjust_credits
--
-- ── Combined.jsx — function validate() ─────────────────────────
--
-- AVANT :
--   await supabase.from("combined_bets").insert({ user_id, match_ids, ... })
--   await supabase.rpc("adjust_credits", { uid: user.id, delta: -cappedStake })
--
-- APRÈS :
--   const { error } = await supabase.rpc("place_combined_bet", {
--     p_match_ids:    matchIds,
--     p_predictions:  predsToSave,
--     p_matches_info: matchesInfo,
--     p_multiplier:   mult,
--     p_stake:        cappedStake,
--   })
--   if (error) { alert("Erreur : " + error.message); setSaving(false); return }
--   // Ne plus appeler adjust_credits
