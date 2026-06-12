-- Tous les paris sur les matchs terminés (processed ou non)
SELECT b.id, b.user_id, b.match_id, b.bet_type, b.bet_value, b.stake, b.processed, b.won,
       m.home_team, m.away_team, m.home_score, m.away_score
FROM bets b
JOIN matches m ON m.id = b.match_id
WHERE m.status = 'finished'
ORDER BY b.match_id, b.user_id;

-- Crédits et XP de tous les profils
SELECT id, username, credits, xp FROM profiles ORDER BY credits DESC;
