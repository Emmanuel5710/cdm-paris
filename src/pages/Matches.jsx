import { useState, useEffect } from "react"
import { supabase } from "../supabase"

export default function Matches({ user }) {
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [bets, setBets] = useState({})

  useEffect(() => {
    fetchMatches()
  }, [])

  useEffect(() => {
    if (!user) return
    async function loadBets() {
      const { data } = await supabase
        .from("bets")
        .select("match_id, bet_type, bet_value")
        .eq("user_id", user.id)
      if (data) {
        const betsMap = {}
        data.forEach(bet => {
          betsMap[`${bet.match_id}-${bet.bet_type}`] = bet.bet_value
        })
        setBets(betsMap)
        console.log("bets chargés:", betsMap)
      }
    }
    loadBets()
  }, [user])

  async function fetchMatches() {
    const { data } = await supabase
      .from("matches")
      .select("*")
      .order("match_date", { ascending: true })
    setMatches(data || [])
    setLoading(false)
  }

  async function calculatePoints() {
    const { data, error } = await supabase.functions.invoke("calculate-points")
    if (error) alert("Erreur : " + error.message)
    else alert(`✅ ${data.matchesProcessed} matchs traités, ${data.usersUpdated} joueurs mis à jour`)
  }

  async function placeBet(matchId, betType, betValue) {
    const key = `${matchId}-${betType}`

    console.log("pari placé:", matchId, betType, betValue)
    const { error } = await supabase.from("bets").upsert(
      { user_id: user.id, match_id: matchId, bet_type: betType, bet_value: betValue },
      { onConflict: "user_id,match_id,bet_type" }
    )

    if (!error) setBets(prev => ({ ...prev, [key]: betValue }))
  }

  if (loading) return <p style={{ padding: "2rem" }}>Chargement des matchs...</p>

  if (matches.length === 0) return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h2>⚽ Matchs CdM 2026</h2>
      <p style={{ color: "#888" }}>Les matchs arrivent bientôt...</p>
    </div>
  )

  return (
    <div style={{ padding: "1rem", fontFamily: "sans-serif", maxWidth: "600px", margin: "0 auto" }}>
      <h2>⚽ Matchs CdM 2026</h2>
      {matches.map(match => {
        const betKey = `${match.id}-result`
        const myBet = bets[betKey]
        const isLocked = match.status !== "notstarted"

        return (
          <div key={match.id} style={{
            border: "1px solid #e0e0e0", borderRadius: "12px",
            padding: "1rem", marginBottom: "1rem",
            background: match.status === "inplay" ? "#f0fff8" : "white"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "12px", color: "#888" }}>Groupe {match.group_name}</span>
              <span style={{ fontSize: "12px", color: match.status === "inplay" ? "#1D9E75" : "#888" }}>
                {match.status === "inplay" ? `🟢 ${match.minute}'` : match.status === "finished" ? "Terminé" : new Date(match.match_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <span style={{ fontWeight: "500", fontSize: "16px" }}>{match.home_team}</span>
              <span style={{ fontSize: "20px", fontWeight: "bold", color: "#333" }}>
                {match.home_score !== null ? `${match.home_score} - ${match.away_score}` : "vs"}
              </span>
              <span style={{ fontWeight: "500", fontSize: "16px" }}>{match.away_team}</span>
            </div>

            {!isLocked && (
              <div>
                <p style={{ fontSize: "12px", color: "#888", marginBottom: "0.5rem" }}>Ton pronostic :</p>
                <div style={{ display: "flex", gap: "8px" }}>
                  {[
                    { label: match.home_team, value: "home" },
                    { label: "Nul", value: "draw" },
                    { label: match.away_team, value: "away" }
                  ].map(opt => (
                    <button key={opt.value}
                      onClick={() => placeBet(match.id, "result", opt.value)}
                      style={{
                        flex: 1, padding: "8px", border: "1px solid",
                        borderColor: myBet === opt.value ? "#1D9E75" : "#e0e0e0",
                        borderRadius: "8px", cursor: "pointer",
                        background: myBet === opt.value ? "#1D9E75" : "white",
                        color: myBet === opt.value ? "white" : "#333",
                        fontSize: "12px", fontWeight: myBet === opt.value ? "500" : "400",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        minWidth: 0
                      }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isLocked && myBet && (
              <p style={{ fontSize: "12px", color: "#1D9E75" }}>✓ Paris enregistré : {myBet}</p>
            )}
          </div>
        )
      })}
      <button onClick={calculatePoints} style={{
        display: "block", width: "100%", padding: "12px", marginTop: "1rem",
        border: "none", borderRadius: "8px", cursor: "pointer",
        background: "#e53e3e", color: "white", fontSize: "14px", fontWeight: "600"
      }}>
        Calculer points
      </button>
    </div>
  )
}