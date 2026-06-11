// Parimutuel avec pool de départ (seed)
// SEED_FACTOR = 2 → cotes de départ ×2.00 (pas de vrais paris)
// Plus SEED_FACTOR est petit, plus les cotes max sont basses
// Formule : cote = (total_réel + SEED * SEED_FACTOR) / (mise_outcome + SEED)

const SEED = 100
const SEED_FACTOR = 2

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
    const seededTotal = d.total + SEED * SEED_FACTOR
    result[mid] = { odds: {}, pct: {}, counts: d.count, total: d.total }
    for (const o of ["home", "draw", "away"]) {
      const seededStake = d[o] + SEED
      const raw = seededTotal / seededStake
      result[mid].odds[o] = Math.round(raw * 100) / 100
      result[mid].pct[o] = d.total > 0 ? Math.round((d[o] / d.total) * 100) : 0
    }
  }
  return result
}

// Cotes par défaut quand aucun pari n'existe encore pour un match
export const DEFAULT_ODDS = { home: 2.00, draw: 2.00, away: 2.00 }

export function fmtOdds(v) {
  if (v == null) return "—"
  return `×${v.toFixed(2)}`
}
