SELECT b.id, b.user_id, p.username, b.match_id, b.bet_type, b.bet_value,
       b.stake, b.processed, b.won,
       m.home_team, m.away_team, m.home_score, m.away_score
FROM bets b
JOIN matches m ON m.id = b.match_id
JOIN profiles p ON p.id = b.user_id
WHERE m.status = 'finished'
ORDER BY b.match_id, p.username;
