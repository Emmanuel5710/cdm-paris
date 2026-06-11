import { useState, useEffect } from "react"
import { supabase } from "../supabase"

const C = {
  bg: "#0F1923", card: "#1A2634", border: "#243447",
  primary: "#1D9E75", text: "#f1f5f9", muted: "#94a3b8", dim: "#64748b",
  win: "#22c55e", lose: "#ef4444",
}

const BET_META = {
  result:           { icon: "⚽", label: "Résultat" },
  total_goals:      { icon: "⚽", label: "Total de buts" },
  btts:             { icon: "🥅", label: "Les 2 équipes marquent" },
  exact_goals:      { icon: "🎯", label: "Buts exacts" },
  exact_corners:    { icon: "🚩", label: "Corners" },
  red_card_team:    { icon: "🟥", label: "Carton rouge" },
  yellow_card_team: { icon: "🟨", label: "Carton jaune" },
  possession_home:  { icon: "📊", label: "Possession" },
  scorer:           { icon: "👟", label: "Buteur" },
}

function betValueLabel(type, value, home, away) {
  if (value == null) return "—"
  if (type === "result") {
    if (value === "home") return `Victoire ${home}`
    if (value === "away") return `Victoire ${away}`
    if (value === "draw") return "Match nul"
  }
  if (type === "total_goals") {
    return value === "5+" ? "5 buts ou plus" : `Exactement ${value} but${Number(value) > 1 ? "s" : ""}`
  }
  if (type === "btts") return value === "yes" ? "Oui" : "Non"
  if (type === "exact_goals") return `${value} but${Number(value) > 1 ? "s" : ""}`
  if (type === "exact_corners") return `${value} corner${Number(value) > 1 ? "s" : ""}`
  if (type === "red_card_team" || type === "yellow_card_team") {
    if (value === "none") return "Aucun"
    if (value === "home") return home
    if (value === "away") return away
  }
  if (type === "possession_home") return `${home} ${value}% — ${away} ${100 - parseInt(value)}%`
  return value
}

function fmtDate(iso) {
  if (!iso) return "Date inconnue"
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  })
}

export default function MyBets({ user }) {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")

  useEffect(() => {
    if (!user?.id) return
    async function load() {
      // Two queries: bets then matches (FK join not always configured)
      const { data: bets, error: bErr } = await supabase
        .from("bets")
        .select("match_id, bet_type, bet_value, stake, odds, processed, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      if (bErr) { setErr("Impossible de charger les paris."); setLoading(false); return }
      if (!bets || bets.length === 0) { setLoading(false); return }

      const matchIds = [...new Set(bets.map(b => b.match_id))]
      const { data: matchRows } = await supabase
        .from("matches")
        .select("id, home_team, away_team, match_date, group_name, status, home_score, away_score")
        .in("id", matchIds)

      const mmap = {}
      if (matchRows) matchRows.forEach(m => { mmap[m.id] = m })

      // Group bets by match, result bet first within each group
      const grouped = {}
      bets.forEach(b => {
        if (!grouped[b.match_id]) grouped[b.match_id] = { match: mmap[b.match_id] ?? null, bets: [] }
        grouped[b.match_id].bets.push(b)
      })
      Object.values(grouped).forEach(g => {
        g.bets.sort((a, b) => a.bet_type === "result" ? -1 : b.bet_type === "result" ? 1 : 0)
      })

      setGroups(Object.values(grouped))
      setLoading(false)
    }
    load()
  }, [user?.id])

  if (loading) return (
    <div style={{ padding: "4rem 2rem", textAlign: "center", color: C.muted }}>
      <div style={{ fontSize: "36px", marginBottom: "12px" }}>🎰</div>
      Chargement de tes paris…
    </div>
  )

  if (err) return (
    <div style={{ padding: "3rem 2rem", textAlign: "center", color: "#f87171" }}>
      <div style={{ fontSize: "32px", marginBottom: "10px" }}>⚠️</div>
      {err}
    </div>
  )

  if (groups.length === 0) return (
    <div style={{ padding: "4rem 2rem", textAlign: "center", color: C.muted }}>
      <div style={{ fontSize: "48px", marginBottom: "16px" }}>🎰</div>
      <div style={{ fontSize: "16px", fontWeight: "700", color: C.text, marginBottom: "6px" }}>Aucun pari placé</div>
      <div style={{ fontSize: "13px" }}>Tes paris apparaîtront ici une fois placés.</div>
    </div>
  )

  const totalBets = groups.reduce((s, g) => s + g.bets.length, 0)
  const totalStake = groups.reduce((s, g) => s + g.bets.reduce((ss, b) => ss + (b.stake ?? 0), 0), 0)

  return (
    <div style={{ padding: "16px", maxWidth: "480px", margin: "0 auto" }}>

      {/* Summary header */}
      <div style={{
        background: "linear-gradient(135deg, rgba(29,158,117,0.18), rgba(29,158,117,0.04))",
        border: "1px solid rgba(29,158,117,0.28)",
        borderRadius: "16px", padding: "16px 20px", marginBottom: "16px",
        display: "flex", gap: "20px", alignItems: "center",
      }}>
        <span style={{ fontSize: "28px" }}>🎰</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "17px", fontWeight: "800", color: C.text, marginBottom: "6px" }}>Mes Paris</div>
          <div style={{ display: "flex", gap: "16px" }}>
            <div>
              <div style={{ fontSize: "18px", fontWeight: "800", color: C.primary }}>{totalBets}</div>
              <div style={{ fontSize: "11px", color: C.dim }}>paris</div>
            </div>
            <div>
              <div style={{ fontSize: "18px", fontWeight: "800", color: C.text }}>💰 {totalStake.toLocaleString("fr-FR")}</div>
              <div style={{ fontSize: "11px", color: C.dim }}>misés</div>
            </div>
            <div>
              <div style={{ fontSize: "18px", fontWeight: "800", color: C.text }}>{groups.length}</div>
              <div style={{ fontSize: "11px", color: C.dim }}>matchs</div>
            </div>
          </div>
        </div>
      </div>

      {/* Match groups */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {groups.map(({ match, bets }) => {
          const home = match?.home_team ?? "?"
          const away = match?.away_team ?? "?"
          const finished = match?.status === "finished"
          const resultBet = bets.find(b => b.bet_type === "result")
          const potGain = resultBet?.stake && resultBet?.odds
            ? Math.round(resultBet.stake * Number(resultBet.odds))
            : null

          return (
            <div key={bets[0].match_id} style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: "14px", overflow: "hidden",
            }}>
              {/* Match header */}
              <div style={{
                padding: "12px 16px",
                borderBottom: `1px solid ${C.border}`,
                background: "rgba(255,255,255,0.025)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ fontSize: "14px", fontWeight: "800", color: C.text }}>
                    {home} <span style={{ color: C.dim, fontWeight: "400", fontSize: "12px" }}>vs</span> {away}
                  </div>
                  {finished && match.home_score != null && (
                    <span style={{
                      fontSize: "13px", fontWeight: "800", color: C.text,
                      background: "rgba(255,255,255,0.08)", borderRadius: "8px", padding: "2px 8px",
                      flexShrink: 0, marginLeft: "8px",
                    }}>
                      {match.home_score} – {match.away_score}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "5px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "11px", color: C.dim }}>{fmtDate(match?.match_date)}</span>
                  {match?.group_name && (
                    <span style={{
                      fontSize: "10px", fontWeight: "600", color: C.muted,
                      background: "rgba(148,163,184,0.1)", borderRadius: "6px", padding: "1px 6px",
                    }}>{match.group_name}</span>
                  )}
                  {finished && (
                    <span style={{
                      fontSize: "10px", fontWeight: "700", color: "#94a3b8",
                      background: "rgba(148,163,184,0.1)", borderRadius: "6px", padding: "1px 6px",
                    }}>Terminé</span>
                  )}
                </div>
              </div>

              {/* Bets list */}
              <div>
                {bets.map((b, i) => {
                  const meta = BET_META[b.bet_type] ?? { icon: "🎲", label: b.bet_type }
                  const gainLine = b.odds && b.stake
                    ? Math.round(b.stake * Number(b.odds))
                    : null
                  const won = b.won === true
                  const lost = b.won === false

                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 16px",
                      borderBottom: i < bets.length - 1 ? `1px solid rgba(36,52,71,0.5)` : "none",
                      background: won ? "rgba(34,197,94,0.04)" : lost ? "rgba(239,68,68,0.04)" : "none",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: "17px", flexShrink: 0 }}>{meta.icon}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: "11px", color: C.dim, fontWeight: "600", marginBottom: "2px" }}>
                            {meta.label}
                            {won && <span style={{ color: C.win, marginLeft: "6px" }}>✓ Gagné</span>}
                            {lost && <span style={{ color: C.lose, marginLeft: "6px" }}>✗ Perdu</span>}
                          </div>
                          <div style={{
                            fontSize: "13px", color: C.text, fontWeight: "600",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {betValueLabel(b.bet_type, b.bet_value, home, away)}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: "10px" }}>
                        {b.stake != null && (
                          <div style={{ fontSize: "12px", fontWeight: "700", color: C.muted }}>
                            💰 {b.stake}
                          </div>
                        )}
                        {gainLine != null && (
                          <div style={{ fontSize: "11px", color: C.primary, marginTop: "1px" }}>
                            → {gainLine.toLocaleString("fr-FR")}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Footer: cote + gain potentiel */}
              {resultBet?.odds && (
                <div style={{
                  padding: "9px 16px",
                  borderTop: `1px solid ${C.border}`,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: "rgba(29,158,117,0.03)",
                }}>
                  <div style={{ fontSize: "11px", color: C.dim }}>
                    Cote : <strong style={{ color: C.muted }}>{Number(resultBet.odds).toFixed(2)}</strong>
                  </div>
                  {potGain != null && (
                    <div style={{ fontSize: "13px", fontWeight: "800", color: C.primary }}>
                      Gain potentiel : 💰 {potGain.toLocaleString("fr-FR")}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
