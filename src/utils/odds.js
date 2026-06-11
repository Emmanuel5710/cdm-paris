// Parimutuel odds: cote(outcome) = totalStakeOnMatch / stakeOnOutcome, min 1.10

export function computeOddsMap(bets) {
  const byMatch = {}
  for (const b of bets) {
    const mid = parseInt(b.match_id)
    if (!byMatch[mid]) byMatch[mid] = { home: 0, draw: 0, away: 0, total: 0, count: { home: 0, draw: 0, away: 0 } }
    const s = b.stake ?? 10
    byMatch[mid].total += s
    if (b.bet_value === "home" || b.bet_value === "draw" || b.bet_value === "away") {
      byMatch[mid][b.bet_value] += s
      byMatch[mid].count[b.bet_value] += 1
    }
  }
  const result = {}
  for (const [mid, d] of Object.entries(byMatch)) {
    result[mid] = { odds: {}, pct: {}, counts: d.count, total: d.total }
    for (const o of ["home", "draw", "away"]) {
      if (d[o] > 0 && d.total > 0) {
        const raw = d.total / d[o]
        result[mid].odds[o] = Math.max(1.1, Math.round(raw * 100) / 100)
        result[mid].pct[o] = Math.round((d[o] / d.total) * 100)
      } else {
        result[mid].odds[o] = null
        result[mid].pct[o] = 0
      }
    }
  }
  return result
}

export function fmtOdds(v) {
  if (v == null) return "—"
  return `×${v.toFixed(2)}`
}
