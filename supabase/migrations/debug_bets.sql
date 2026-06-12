-- État des matchs terminés
SELECT id, home_team, away_team, status, home_score, away_score
FROM matches WHERE status = 'finished' ORDER BY id;

-- Paris non traités
SELECT b.id, b.user_id, b.match_id, b.bet_type, b.bet_value, b.stake, b.processed, b.won,
       m.home_team, m.away_team, m.status, m.home_score, m.away_score
FROM bets b
JOIN matches m ON m.id = b.match_id
WHERE b.processed = false
ORDER BY b.match_id;

-- Dernières exécutions du cron
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
