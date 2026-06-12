SELECT b.match_id, b.bet_type, b.bet_value, b.stake, b.processed, b.won,
       m.home_team, m.away_team, m.home_score, m.away_score, m.status
FROM bets b
JOIN matches m ON m.id = b.match_id
WHERE b.processed = false
ORDER BY b.match_id;
