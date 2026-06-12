SELECT id, home_team, away_team, status, home_score, away_score
FROM matches WHERE status = 'finished' ORDER BY id;
