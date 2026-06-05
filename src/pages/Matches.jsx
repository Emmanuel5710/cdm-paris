import { useState, useEffect, useRef } from "react"
import { supabase } from "../supabase"

const ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard"

function parseMatches(data) {
  return (data.events || []).map(ev => {
    const comp = ev.competitions?.[0]
    const home = comp?.competitors?.find(c => c.homeAway === "home")
    const away = comp?.competitors?.find(c => c.homeAway === "away")
    return {
      id: ev.id,
      date: ev.date,
      state: comp?.status?.type?.state,        // "pre" | "in" | "post"
      statusName: comp?.status?.type?.name,
      displayClock: comp?.status?.displayClock,
      statusDetail: comp?.status?.type?.shortDetail,
      venue: comp?.venue?.fullName,
      city: comp?.venue?.address?.city,
      home: {
        name: home?.team?.displayName ?? "",
        logo: home?.team?.logo ?? "",
        score: home?.score ?? "0",
        form: home?.form ?? "",
      },
      away: {
        name: away?.team?.displayName ?? "",
        logo: away?.team?.logo ?? "",
        score: away?.score ?? "0",
        form: away?.form ?? "",
      },
    }
  })
}

function FormDots({ form }) {
  if (!form) return null
  return (
    <div style={{ display: "flex", gap: "3px", marginTop: "3px" }}>
      {form.split("").map((c, i) => (
        <span key={i} style={{
          width: "13px", height: "13px", borderRadius: "50%", fontSize: "8px",
          fontWeight: "700", color: "white", display: "flex", alignItems: "center", justifyContent: "center",
          background: c === "W" ? "#1D9E75" : c === "L" ? "#e53e3e" : "#bbb",
        }}>{c}</span>
      ))}
    </div>
  )
}

export default function Matches({ user }) {
  const [matches, setMatches] = useState([])
  const [bets, setBets] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const intervalRef = useRef(null)

  useEffect(() => {
    fetchMatches().finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!user) return
    supabase.from("bets").select("match_id, bet_type, bet_value").eq("user_id", user.id)
      .then(({ data }) => {
        if (!data) return
        const map = {}
        data.forEach(b => { map[`${b.match_id}-${b.bet_type}`] = b.bet_value })
        setBets(map)
      })
  }, [user])

  useEffect(() => {
    clearInterval(intervalRef.current)
    const hasLive = matches.some(m => m.state === "in")
    if (hasLive) {
      intervalRef.current = setInterval(fetchMatches, 60000)
    }
    return () => clearInterval(intervalRef.current)
  }, [matches])

  async function fetchMatches() {
    try {
      const res = await fetch(ESPN_URL)
      const data = await res.json()
      setMatches(parseMatches(data))
      setError("")
    } catch {
      setError("Impossible de charger les matchs ESPN.")
    }
  }

  async function placeBet(matchId, betType, betValue) {
    const { data: existing } = await supabase
      .from("bets").select("id")
      .eq("user_id", user.id).eq("match_id", matchId).eq("bet_type", betType)
      .maybeSingle()

    if (existing) {
      await supabase.from("bets").update({ bet_value: betValue }).eq("id", existing.id)
    } else {
      await supabase.from("bets").insert({ user_id: user.id, match_id: matchId, bet_type: betType, bet_value: betValue })
    }
    setBets(prev => ({ ...prev, [`${matchId}-${betType}`]: betValue }))
  }

  async function calculatePoints() {
    const { data, error: err } = await supabase.functions.invoke("calculate-points")
    if (err) alert("Erreur : " + err.message)
    else alert(`✅ ${data.matchesProcessed} matchs traités, ${data.usersUpdated} joueurs mis à jour`)
  }

  if (loading) return <p style={{ padding: "2rem" }}>Chargement des matchs...</p>
  if (error) return <p style={{ padding: "2rem", color: "#e53e3e" }}>{error}</p>
  if (!matches.length) return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h2>⚽ Matchs CdM 2026</h2>
      <p style={{ color: "#888" }}>Aucun match disponible pour l'instant.</p>
    </div>
  )

  return (
    <div style={{ padding: "1rem", fontFamily: "sans-serif", maxWidth: "600px", margin: "0 auto" }}>
      <h2 style={{ marginBottom: "1rem" }}>⚽ Matchs CdM 2026</h2>

      <button onClick={calculatePoints} style={{
        display: "block", width: "100%", padding: "10px", marginBottom: "1.25rem",
        border: "none", borderRadius: "8px", cursor: "pointer",
        background: "#e53e3e", color: "white", fontSize: "13px", fontWeight: "600",
      }}>
        Calculer points
      </button>

      {matches.map(match => {
        const betKey = `${match.id}-result`
        const myBet = bets[betKey]
        const isLive = match.state === "in"
        const isFinished = match.state === "post"
        const isLocked = isLive || isFinished

        return (
          <div key={match.id} style={{
            border: `1px solid ${isLive ? "#1D9E75" : "#e0e0e0"}`,
            borderRadius: "12px", padding: "1rem", marginBottom: "1rem",
            background: isLive ? "#f0fff8" : "white",
          }}>

            {/* Statut + stade */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
              <span style={{
                fontSize: "11px", fontWeight: "600", padding: "3px 9px",
                borderRadius: "20px", whiteSpace: "nowrap",
                background: isLive ? "#1D9E75" : isFinished ? "#f0f0f0" : "#e8f5f0",
                color: isLive ? "white" : isFinished ? "#666" : "#1D9E75",
              }}>
                {isLive ? `🟢 ${match.displayClock}` : isFinished ? "Terminé" : match.statusDetail}
              </span>
              {match.venue && (
                <div style={{ textAlign: "right", marginLeft: "8px" }}>
                  <div style={{ fontSize: "11px", color: "#666" }}>🏟 {match.venue}</div>
                  <div style={{ fontSize: "10px", color: "#aaa" }}>{match.city}</div>
                </div>
              )}
            </div>

            {/* Équipes + score */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "0.875rem" }}>

              {/* Équipe domicile */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  {match.home.logo && (
                    <img src={match.home.logo} alt="" width="26" height="26"
                      style={{ objectFit: "contain", flexShrink: 0 }} />
                  )}
                  <span translate="no" style={{
                    fontWeight: "500", fontSize: "13px",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{match.home.name}</span>
                </div>
                <FormDots form={match.home.form} />
              </div>

              {/* Score */}
              <div style={{ textAlign: "center", flexShrink: 0, minWidth: "52px" }}>
                <span style={{ fontSize: "20px", fontWeight: "bold", color: "#222" }}>
                  {isLocked ? `${match.home.score}–${match.away.score}` : "vs"}
                </span>
              </div>

              {/* Équipe extérieur */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-end", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span translate="no" style={{
                    fontWeight: "500", fontSize: "13px",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{match.away.name}</span>
                  {match.away.logo && (
                    <img src={match.away.logo} alt="" width="26" height="26"
                      style={{ objectFit: "contain", flexShrink: 0 }} />
                  )}
                </div>
                <FormDots form={match.away.form} />
              </div>
            </div>

            {/* Paris */}
            {!isLocked && (
              <div>
                <p style={{ fontSize: "12px", color: "#888", marginBottom: "0.4rem" }}>Ton pronostic :</p>
                <div style={{ display: "flex", gap: "6px" }}>
                  {[
                    { label: match.home.name, value: "home" },
                    { label: "Nul", value: "draw" },
                    { label: match.away.name, value: "away" },
                  ].map(opt => (
                    <button key={opt.value}
                      onClick={() => placeBet(match.id, "result", opt.value)}
                      style={{
                        flex: 1, padding: "8px 4px", border: "1px solid",
                        borderColor: myBet === opt.value ? "#1D9E75" : "#e0e0e0",
                        borderRadius: "8px", cursor: "pointer",
                        background: myBet === opt.value ? "#1D9E75" : "white",
                        color: myBet === opt.value ? "white" : "#333",
                        fontSize: "11px", fontWeight: myBet === opt.value ? "600" : "400",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        minWidth: 0,
                      }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isLocked && myBet && (
              <p style={{ fontSize: "12px", color: "#1D9E75", marginTop: "0.25rem" }}>
                ✓ {myBet === "home" ? match.home.name : myBet === "away" ? match.away.name : "Nul"}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
