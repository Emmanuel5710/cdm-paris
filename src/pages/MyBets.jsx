import { useState, useEffect } from "react"
import { supabase } from "../supabase"

const C = {
  bg: "#0F1923", card: "#1A2634", border: "#243447",
  primary: "#1D9E75", text: "#f1f5f9", muted: "#94a3b8", dim: "#64748b",
}

const BET_LABELS = {
  result:           { icon: "⚽", label: "Résultat" },
  exact_goals:      { icon: "🎯", label: "Buts exacts" },
  exact_corners:    { icon: "🚩", label: "Corners exacts" },
  red_card_team:    { icon: "🟥", label: "Carton rouge" },
  yellow_card_team: { icon: "🟨", label: "Carton jaune" },
  possession_home:  { icon: "📊", label: "Possession" },
  scorer:           { icon: "👟", label: "Buteur" },
}

function formatBetValue(type, value, match) {
  if (value == null) return "—"
  if (type === "result") {
    if (value === "home") return `Victoire ${match?.home ?? "Domicile"}`
    if (value === "away") return `Victoire ${match?.away ?? "Extérieur"}`
    if (value === "draw") return "Match nul"
    return value
  }
  if (type === "exact_goals") return `${value} but${value > 1 ? "s" : ""}`
  if (type === "exact_corners") return `${value} corner${value > 1 ? "s" : ""}`
  if (type === "red_card_team" || type === "yellow_card_team") {
    if (value === "none") return "Aucun"
    if (value === "home") return match?.home ?? "Domicile"
    if (value === "away") return match?.away ?? "Extérieur"
    return value
  }
  if (type === "possession_home") return `${match?.home ?? "Dom."} ${value}% — ${match?.away ?? "Ext."} ${100 - parseInt(value)}%`
  return value
}

function formatDate(dateStr) {
  if (!dateStr) return ""
  const d = new Date(dateStr)
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

export default function MyBets({ user }) {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    async function load() {
      const { data: bets } = await supabase
        .from("bets")
        .select("match_id, bet_type, bet_value, stake, odds, processed, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      if (!bets || bets.length === 0) { setLoading(false); return }

      const matchIds = [...new Set(bets.map(b => b.match_id))]
      const { data: matchRows } = await supabase
        .from("matches")
        .select("id, home_team, away_team, match_date, status")
        .in("id", matchIds)

      const matchMap = {}
      if (matchRows) matchRows.forEach(m => { matchMap[m.id] = m })

      const grouped = {}
      bets.forEach(b => {
        if (!grouped[b.match_id]) grouped[b.match_id] = { match: matchMap[b.match_id], bets: [] }
        grouped[b.match_id].bets.push(b)
      })

      setGroups(Object.values(grouped))
      setLoading(false)
    }
    load()
  }, [user?.id])

  if (loading) return (
    <div style={{ padding: "3rem", textAlign: "center", color: C.muted }}>
      <div style={{ fontSize: "32px", marginBottom: "12px" }}>🎰</div>
      Chargement...
    </div>
  )

  if (groups.length === 0) return (
    <div style={{ padding: "3rem", textAlign: "center", color: C.muted }}>
      <div style={{ fontSize: "48px", marginBottom: "16px" }}>🎰</div>
      <div style={{ fontSize: "16px", fontWeight: "700", color: C.text, marginBottom: "8px" }}>Aucun pari placé</div>
      <div style={{ fontSize: "14px" }}>Tes paris apparaîtront ici une fois placés.</div>
    </div>
  )

  const totalStake = groups.reduce((sum, g) => sum + g.bets.reduce((s, b) => s + (b.stake ?? 0), 0), 0)
  const totalBets = groups.reduce((sum, g) => sum + g.bets.length, 0)

  return (
    <div style={{ padding: "16px", maxWidth: "480px", margin: "0 auto" }}>

      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, rgba(29,158,117,0.2), rgba(29,158,117,0.05))",
        border: "1px solid rgba(29,158,117,0.3)",
        borderRadius: "16px", padding: "18px 20px", marginBottom: "16px",
      }}>
        <div style={{ fontSize: "18px", fontWeight: "800", color: C.text }}>🎰 Mes Paris</div>
        <div style={{ display: "flex", gap: "16px", marginTop: "8px" }}>
          <div>
            <div style={{ fontSize: "20px", fontWeight: "800", color: C.primary }}>{totalBets}</div>
            <div style={{ fontSize: "11px", color: C.dim }}>paris placés</div>
          </div>
          <div>
            <div style={{ fontSize: "20px", fontWeight: "800", color: C.text }}>💰 {totalStake.toLocaleString("fr-FR")}</div>
            <div style={{ fontSize: "11px", color: C.dim }}>crédits misés</div>
          </div>
          <div>
            <div style={{ fontSize: "20px", fontWeight: "800", color: C.text }}>{groups.length}</div>
            <div style={{ fontSize: "11px", color: C.dim }}>matchs</div>
          </div>
        </div>
      </div>

      {/* Match groups */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {groups.map(({ match, bets }) => {
          const home = match?.home_team ?? "?"
          const away = match?.away_team ?? "?"
          const matchObj = { home, away }
          const resultBet = bets.find(b => b.bet_type === "result")
          const potentialGain = resultBet && resultBet.odds
            ? Math.round(resultBet.stake * resultBet.odds)
            : null

          return (
            <div key={bets[0].match_id} style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: "14px", overflow: "hidden",
            }}>
              {/* Match header */}
              <div style={{
                padding: "12px 16px",
                background: "rgba(255,255,255,0.03)",
                borderBottom: `1px solid ${C.border}`,
              }}>
                <div style={{ fontSize: "14px", fontWeight: "800", color: C.text }}>
                  {home} <span style={{ color: C.dim, fontWeight: "400" }}>vs</span> {away}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                  <div style={{ fontSize: "11px", color: C.dim }}>
                    {match?.match_date ? formatDate(match.match_date) : "Date inconnue"}
                  </div>
                  {match?.status === "completed" && (
                    <span style={{
                      fontSize: "10px", fontWeight: "700", color: "#94a3b8",
                      background: "rgba(148,163,184,0.12)", borderRadius: "8px", padding: "2px 7px",
                    }}>Terminé</span>
                  )}
                </div>
              </div>

              {/* Bets list */}
              <div style={{ padding: "8px 0" }}>
                {bets.map((b, i) => {
                  const meta = BET_LABELS[b.bet_type] ?? { icon: "🎲", label: b.bet_type }
                  const gainPot = b.bet_type === "result" && b.odds
                    ? Math.round(b.stake * b.odds)
                    : null
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 16px",
                      borderBottom: i < bets.length - 1 ? `1px solid rgba(36,52,71,0.6)` : "none",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: "16px", flexShrink: 0 }}>{meta.icon}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: "11px", color: C.dim, fontWeight: "600" }}>{meta.label}</div>
                          <div style={{ fontSize: "13px", color: C.text, fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {formatBetValue(b.bet_type, b.bet_value, matchObj)}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: "12px" }}>
                        {b.stake != null && (
                          <div style={{ fontSize: "12px", fontWeight: "700", color: C.muted }}>
                            💰 {b.stake}
                          </div>
                        )}
                        {gainPot != null && (
                          <div style={{ fontSize: "11px", color: C.primary }}>
                            → {gainPot}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Footer: total stake + potential gain */}
              {resultBet && (
                <div style={{
                  padding: "10px 16px",
                  borderTop: `1px solid ${C.border}`,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: "rgba(29,158,117,0.04)",
                }}>
                  <div style={{ fontSize: "11px", color: C.dim }}>
                    Mise principale · cote {resultBet.odds ? Number(resultBet.odds).toFixed(2) : "—"}
                  </div>
                  {potentialGain != null && (
                    <div style={{ fontSize: "13px", fontWeight: "800", color: C.primary }}>
                      Gain potentiel : 💰 {potentialGain.toLocaleString("fr-FR")}
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
