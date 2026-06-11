-- ================================================================
-- 016 — PARIS AVANCÉS AVEC MISE : total_goals + btts
-- ================================================================

-- Cotes fixes côté serveur (ignorées si envoyées par le client)
CREATE OR REPLACE FUNCTION get_fixed_odds(p_bet_type TEXT, p_bet_value TEXT)
RETURNS NUMERIC LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER AS $$
BEGIN
  CASE p_bet_type
    WHEN 'total_goals' THEN
      RETURN CASE p_bet_value
        WHEN '0'  THEN 12.0
        WHEN '1'  THEN 5.5
        WHEN '2'  THEN 2.8
        WHEN '3'  THEN 3.0
        WHEN '4'  THEN 5.0
        WHEN '5+' THEN 5.0
        ELSE NULL
      END;
    WHEN 'btts' THEN
      RETURN CASE p_bet_value
        WHEN 'yes' THEN 1.9
        WHEN 'no'  THEN 1.7
        ELSE NULL
      END;
    ELSE RETURN NULL;
  END CASE;
END;
$$;

-- place_bet : accepte result + total_goals + btts
-- Cotes des paris avancés déterminées entièrement côté serveur
CREATE OR REPLACE FUNCTION place_bet(
  p_match_id  BIGINT,
  p_bet_type  TEXT,
  p_bet_value TEXT,
  p_stake     INTEGER,
  p_odds      NUMERIC DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid        UUID    := auth.uid();
  v_credits    INTEGER;
  v_status     TEXT;
  v_bet_id     UUID;
  v_final_odds NUMERIC;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF p_stake < 10 OR p_stake > 10000 THEN
    RAISE EXCEPTION 'Mise invalide — doit être entre 10 et 10 000';
  END IF;

  -- Valider type + valeur, fixer les cotes
  IF p_bet_type = 'result' THEN
    IF p_bet_value NOT IN ('home','away','draw') THEN
      RAISE EXCEPTION 'Valeur invalide pour result';
    END IF;
    v_final_odds := CASE
      WHEN p_odds IS NULL THEN NULL
      WHEN p_odds < 1.0   THEN 1.0
      WHEN p_odds > 50.0  THEN 50.0
      ELSE p_odds
    END;
  ELSIF p_bet_type = 'total_goals' THEN
    IF p_bet_value NOT IN ('0','1','2','3','4','5+') THEN
      RAISE EXCEPTION 'Valeur invalide pour total_goals';
    END IF;
    v_final_odds := get_fixed_odds('total_goals', p_bet_value);
  ELSIF p_bet_type = 'btts' THEN
    IF p_bet_value NOT IN ('yes','no') THEN
      RAISE EXCEPTION 'Valeur invalide pour btts';
    END IF;
    v_final_odds := get_fixed_odds('btts', p_bet_value);
  ELSE
    RAISE EXCEPTION 'Type de pari invalide : %', p_bet_type;
  END IF;

  -- Match doit être à venir
  SELECT status INTO v_status FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match introuvable'; END IF;
  IF v_status IN ('finished','inplay') THEN
    RAISE EXCEPTION 'Ce match est en cours ou terminé';
  END IF;

  -- Verrouiller le profil et vérifier les crédits
  SELECT credits INTO v_credits FROM profiles WHERE id = v_uid FOR UPDATE;
  IF v_credits < p_stake THEN
    RAISE EXCEPTION 'Crédits insuffisants (avoir : %, mise : %)', v_credits, p_stake;
  END IF;

  -- Déduire + insérer atomiquement
  UPDATE profiles SET credits = credits - p_stake WHERE id = v_uid;
  INSERT INTO bets (user_id, match_id, bet_type, bet_value, stake, odds, processed)
  VALUES (v_uid, p_match_id, p_bet_type, p_bet_value, p_stake, v_final_odds, false)
  RETURNING id INTO v_bet_id;

  RETURN v_bet_id;
END;
$$;

-- cancel_bet : bloque aussi les matchs en cours (inplay)
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

  SELECT id, stake, processed
  INTO v_bet_id, v_stake, v_processed
  FROM bets
  WHERE user_id = v_uid AND match_id = p_match_id AND bet_type = p_bet_type
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Pari introuvable'; END IF;
  IF v_processed THEN RAISE EXCEPTION 'Ce pari a déjà été traité'; END IF;

  SELECT status INTO v_status FROM matches WHERE id = p_match_id;
  IF v_status IN ('finished','inplay') THEN
    RAISE EXCEPTION 'Impossible d''annuler un pari sur un match en cours ou terminé';
  END IF;

  DELETE FROM bets WHERE id = v_bet_id;
  IF v_stake > 0 THEN
    UPDATE profiles SET credits = credits + v_stake WHERE id = v_uid;
  END IF;

  RETURN v_stake;
END;
$$;
