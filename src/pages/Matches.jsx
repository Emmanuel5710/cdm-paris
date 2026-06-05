import { useState, useEffect, useRef } from "react"
import { supabase } from "../supabase"

const ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=200&dates=20260611-20260719"
const C = {
  bg: "#0F1923", card: "#1A2634", border: "#243447",
  primary: "#1D9E75", primaryGlow: "rgba(29,158,117,0.18)",
  text: "#f1f5f9", muted: "#94a3b8", dim: "#64748b",
}

function parseMatches(data) {
  return (data.events || []).map(ev => {
    const comp = ev.competitions?.[0]
    const home = comp?.competitors?.find(c => c.homeAway === "home")
    const away = comp?.competitors?.find(c => c.homeAway === "away")
    return {
      id: ev.id,
      state: comp?.status?.type?.state,
      displayClock: comp?.status?.displayClock,
      statusDetail: comp?.status?.type?.shortDetail,
      venue: comp?.venue?.fullName,
      city: comp?.venue?.address?.city,
      home: { name: home?.team?.displayName ?? "", logo: home?.team?.logo ?? "", score: home?.score ?? "0", form: home?.form ?? "" },
      away: { name: away?.team?.displayName ?? "", logo: away?.team?.logo ?? "", score: away?.score ?? "0", form: away?.form ?? "" },
    }
  })
}

function FormDots({ form }) {
  if (!form) return null
  return (
    <div style={{ display: "flex", gap: "3px", marginTop: "4px" }}>
      {form.split("").map((c, i) => (
        <span key={i} style={{
          width: "14px", height: "14px", borderRadius: "50%", fontSize: "7px",
          fontWeight: "700", color: "white", display: "flex", alignItems: "center", justifyContent: "center",
          background: c === "W" ? C.primary : c === "L" ? "#ef4444" : "#334155",
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

  useEffect(() => { fetchMatches().finally(() => setLoading(false)) }, [])

  useEffect(() => {
    if (!user) return
    async function loadBets() {
      const { data } = await supabase.from("bets").select("match_id, bet_type, bet_value").eq("user_id", user.id)
      if (data) {
        const betsMap = {}
        data.forEach(bet => { betsMap[`${parseInt(bet.match_id)}-${bet.bet_type}`] = bet.bet_value })
        setBets(betsMap)
      }
    }
    loadBets()
  }, [user])

  useEffect(() => {
    clearInterval(intervalRef.current)
    if (matches.some(m => m.state === "in")) {
      intervalRef.current = setInterval(fetchMatches, 60000)
    }
    return () => clearInterval(intervalRef.current)
  }, [matches])

  async function fetchMatches() {
    try {
      const res = await fetch(ESPN_URL)
      setMatches(parseMatches(await res.json()))
      setError("")
    } catch { setError("Impossible de charger les matchs ESPN.") }
  }

  async function placeBet(matchId, betType, betValue) {
    const id = parseInt(matchId)
    const { data: existing } = await supabase
      .from("bets").select("id")
      .eq("user_id", user.id).eq("match_id", id).eq("bet_type", betType)
      .maybeSingle()
    if (existing) {
      await supabase.from("bets").update({ bet_value: betValue }).eq("id", existing.id)
    } else {
      await supabase.from("bets").insert({ user_id: user.id, match_id: id, bet_type: betType, bet_value: betValue })
    }
    setBets(prev => ({ ...prev, [`${id}-${betType}`]: betValue }))
  }

  async function calculatePoints() {
    const { data, error: err } = await supabase.functions.invoke("calculate-points")
    if (err) alert("Erreur : " + err.message)
    else alert(`✅ ${data.matchesProcessed} matchs traités, ${data.usersUpdated} joueurs mis à jour`)
  }

  if (loading) return (
    <div style={{ padding: "3rem", textAlign: "center", color: C.muted }}>
      <div style={{ fontSize: "32px", marginBottom: "12px" }}>⚽</div>
      Chargement des matchs...
    </div>
  )
  if (error) return <p style={{ padding: "2rem", color: "#f87171" }}>{error}</p>
  if (!matches.length) return (
    <div style={{ padding: "3rem", textAlign: "center", color: C.muted }}>
      <div style={{ fontSize: "40px", marginBottom: "12px" }}>🏟</div>
      <p style={{ fontWeight: "600", color: C.text }}>Aucun match disponible</p>
      <p style={{ fontSize: "13px", marginTop: "6px" }}>Le tournoi commence bientôt</p>
    </div>
  )

  return (
    <div style={{ padding: "16px", maxWidth: "600px", margin: "0 auto" }}>

      {/* Admin button */}
      <button onClick={calculatePoints} style={{
        display: "block", width: "100%", padding: "11px", marginBottom: "16px",
        border: `1px dashed ${C.border}`, borderRadius: "10px", cursor: "pointer",
        background: "none", color: C.dim, fontSize: "12px",
      }}>⚙️ Calculer les points</button>

      {matches.map((match, idx) => {
        const betKey = `${parseInt(match.id)}-result`
        const myBet = bets[betKey]
        const isLive = match.state === "in"
        const isFinished = match.state === "post"
        const isLocked = isLive || isFinished

        return (
          <div key={match.id}
            className={`card-enter ${isLive ? "card-live" : ""}`}
            style={{
              background: C.card, borderRadius: "16px", padding: "16px",
              marginBottom: "12px", border: `1px solid ${isLive ? C.primary : C.border}`,
              animationDelay: `${idx * 0.05}s`,
            }}>

            {/* Status + venue */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
              <span style={{
                fontSize: "11px", fontWeight: "700", padding: "4px 10px", borderRadius: "20px",
                background: isLive ? C.primary : isFinished ? "#1e293b" : C.primaryGlow,
                color: isLive ? "white" : isFinished ? C.muted : C.primary,
                letterSpacing: "0.3px", textTransform: "uppercase",
              }}>
                {isLive ? `● ${match.displayClock}` : isFinished ? "Terminé" : match.statusDetail}
              </span>
              {match.venue && (
                <div style={{ textAlign: "right", marginLeft: "8px" }}>
                  <div style={{ fontSize: "11px", color: C.muted }}>🏟 {match.venue}</div>
                  <div style={{ fontSize: "10px", color: C.dim }}>{match.city}</div>
                </div>
              )}
            </div>

            {/* Teams + score */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>

              {/* Home */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {match.home.logo && (
                    <img src={match.home.logo} alt="" width="32" height="32"
                      referrerPolicy="no-referrer"
                      style={{ objectFit: "contain", flexShrink: 0, borderRadius: "4px" }} />
                  )}
                  <span translate="no" style={{
                    fontWeight: "600", fontSize: "14px", color: C.text,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{match.home.name}</span>
                </div>
                <FormDots form={match.home.form} />
              </div>

              {/* Score */}
              <div style={{ textAlign: "center", flexShrink: 0, minWidth: "60px" }}>
                {isLocked ? (
                  <div>
                    <span style={{ fontSize: "28px", fontWeight: "800", color: C.text, letterSpacing: "1px" }}>
                      {match.home.score}
                    </span>
                    <span style={{ fontSize: "18px", color: C.dim, margin: "0 4px" }}>–</span>
                    <span style={{ fontSize: "28px", fontWeight: "800", color: C.text, letterSpacing: "1px" }}>
                      {match.away.score}
                    </span>
                  </div>
                ) : (
                  <span style={{ fontSize: "14px", fontWeight: "600", color: C.dim, letterSpacing: "2px" }}>VS</span>
                )}
              </div>

              {/* Away */}
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span translate="no" style={{
                    fontWeight: "600", fontSize: "14px", color: C.text,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{match.away.name}</span>
                  {match.away.logo && (
                    <img src={match.away.logo} alt="" width="32" height="32"
                      referrerPolicy="no-referrer"
                      style={{ objectFit: "contain", flexShrink: 0, borderRadius: "4px" }} />
                  )}
                </div>
                <FormDots form={match.away.form} />
              </div>
            </div>

            {/* Bet buttons */}
            {!isLocked && (
              <div>
                <p style={{ fontSize: "11px", color: C.dim, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600" }}>
                  Pronostic
                </p>
                <div style={{ display: "flex", gap: "8px" }}>
                  {[
                    { label: match.home.name, value: "home" },
                    { label: "Nul", value: "draw" },
                    { label: match.away.name, value: "away" },
                  ].map(opt => {
                    const selected = myBet === opt.value
                    return (
                      <button key={opt.value}
                        onClick={() => placeBet(parseInt(match.id), "result", opt.value)}
                        style={{
                          flex: 1, padding: "10px 6px", border: `1.5px solid`,
                          borderColor: selected ? C.primary : C.border,
                          borderRadius: "50px", cursor: "pointer",
                          background: selected ? C.primaryGlow : "transparent",
                          color: selected ? C.primary : C.muted,
                          fontSize: "11px", fontWeight: selected ? "700" : "500",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          minWidth: 0, transition: "all 0.15s",
                        }}>
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {isLocked && myBet && (
              <div style={{
                marginTop: "4px", padding: "8px 12px", borderRadius: "8px",
                background: C.primaryGlow, border: `1px solid ${C.primary}22`,
              }}>
                <span style={{ fontSize: "12px", color: C.primary, fontWeight: "600" }}>
                  ✓ {myBet === "home" ? match.home.name : myBet === "away" ? match.away.name : "Nul"}
                </span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
