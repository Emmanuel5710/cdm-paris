import { useState, useEffect } from "react"
import { supabase } from "../supabase"

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

export default function League({ user }) {
  const [league, setLeague] = useState(null)
  const [ranking, setRanking] = useState([])
  const [createName, setCreateName] = useState("")
  const [joinCode, setJoinCode] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchUserLeague()
  }, [])

  useEffect(() => {
    if (!league) return
    fetchRanking()

    const channel = supabase
      .channel("league-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "bets" }, fetchRanking)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches" }, fetchRanking)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [league])

  async function fetchUserLeague() {
    const { data } = await supabase
      .from("league_members")
      .select("league_id, leagues(id, name, invite_code)")
      .eq("user_id", user.id)
      .single()

    if (data?.leagues) setLeague(data.leagues)
    setLoading(false)
  }

  async function fetchRanking() {
    if (!league) return

    const { data: members } = await supabase
      .from("league_members")
      .select("user_id")
      .eq("league_id", league.id)

    console.log("membres bruts:", JSON.stringify(members))

    if (!members?.length) { setRanking([]); return }

    const membersWithProfiles = await Promise.all(
      members.map(async (m) => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", m.user_id)
          .single()
        return { user_id: m.user_id, username: profile?.username || "Inconnu" }
      })
    )

    const memberIds = membersWithProfiles.map(m => m.user_id)

    const [{ data: finishedMatches }, { data: bets }] = await Promise.all([
      supabase.from("matches").select("id, home_score, away_score").eq("status", "finished"),
      supabase.from("bets").select("user_id, match_id, bet_value").in("user_id", memberIds).eq("bet_type", "result"),
    ])

    const resultMap = {}
    for (const m of finishedMatches || []) {
      resultMap[m.id] = m.home_score > m.away_score ? "home" : m.away_score > m.home_score ? "away" : "draw"
    }

    const pointsMap = {}
    for (const m of membersWithProfiles) {
      pointsMap[m.user_id] = { username: m.username, pts: 0 }
    }
    for (const b of bets || []) {
      if (pointsMap[b.user_id] && resultMap[b.match_id] === b.bet_value) {
        pointsMap[b.user_id].pts++
      }
    }

    setRanking(Object.values(pointsMap).sort((a, b) => b.pts - a.pts))
  }

  async function createLeague() {
    setError("")
    if (!createName.trim()) { setError("Entre un nom de ligue"); return }

    const code = generateCode()
    const { data, error: err } = await supabase
      .from("leagues")
      .insert({ name: createName.trim(), invite_code: code, owner_id: user.id })
      .select()
      .single()

    if (err) { setError(err.message); return }

    await supabase.from("league_members").insert({ league_id: data.id, user_id: user.id })
    setLeague(data)
  }

  async function joinLeague() {
    setError("")
    const code = joinCode.trim().toUpperCase()
    if (!code) { setError("Entre un code d'invitation"); return }

    const { data: lg } = await supabase.from("leagues").select("*").eq("invite_code", code).single()
    if (!lg) { setError("Code invalide"); return }

    const { data: existing } = await supabase
      .from("league_members")
      .select("id")
      .eq("league_id", lg.id)
      .eq("user_id", user.id)
      .single()

    if (!existing) {
      await supabase.from("league_members").insert({ league_id: lg.id, user_id: user.id })
    }
    setLeague(lg)
  }

  async function shareLeague() {
    const text = `Rejoins ma ligue CdM Paris 2026 ! Code : ${league.invite_code}`
    if (navigator.share) {
      await navigator.share({ title: "CdM Paris 2026", text })
    } else {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (loading) return <p style={{ padding: "2rem" }}>Chargement...</p>

  if (!league) return (
    <div style={{ padding: "1.5rem", maxWidth: "400px", margin: "0 auto", fontFamily: "sans-serif" }}>
      <h2 style={{ marginBottom: "1.5rem" }}>🏆 Ma Ligue</h2>

      {error && <p style={{ color: "red", fontSize: "13px", marginBottom: "0.75rem" }}>{error}</p>}

      <div style={{ marginBottom: "2rem" }}>
        <h3 style={{ fontSize: "15px", fontWeight: "600", marginBottom: "0.75rem" }}>Créer une ligue</h3>
        <input
          placeholder="Nom de la ligue"
          value={createName}
          onChange={e => { setCreateName(e.target.value); setError("") }}
          style={inputStyle}
        />
        <button onClick={createLeague} style={primaryBtn}>Créer</button>
      </div>

      <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: "1.5rem" }}>
        <h3 style={{ fontSize: "15px", fontWeight: "600", marginBottom: "0.75rem" }}>Rejoindre une ligue</h3>
        <input
          placeholder="Code d'invitation (ex: ABC123)"
          value={joinCode}
          onChange={e => { setJoinCode(e.target.value.toUpperCase()); setError("") }}
          style={inputStyle}
        />
        <button onClick={joinLeague} style={secondaryBtn}>Rejoindre</button>
      </div>
    </div>
  )

  const myRank = ranking.findIndex(m => m.username === (user.user_metadata?.username ?? ""))

  return (
    <div style={{ padding: "1rem", maxWidth: "600px", margin: "0 auto", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div>
          <h2 style={{ margin: "0 0 4px" }}>🏆 {league.name}</h2>
          <span style={{ fontSize: "12px", color: "#888", fontFamily: "monospace", letterSpacing: "1px" }}>
            Code : {league.invite_code}
          </span>
        </div>
        <button onClick={shareLeague} style={{
          padding: "8px 14px", border: "1px solid #e0e0e0", borderRadius: "20px",
          cursor: "pointer", fontSize: "13px", background: "white", flexShrink: 0
        }}>
          {copied ? "✓ Copié !" : "📤 Partager"}
        </button>
      </div>

      {ranking.length === 0 ? (
        <p style={{ color: "#888", fontSize: "14px", textAlign: "center", marginTop: "3rem" }}>
          Aucun match terminé pour l'instant.<br />
          <span style={{ fontSize: "12px" }}>Le classement se met à jour automatiquement.</span>
        </p>
      ) : (
        ranking.map((member, i) => {
          const isMe = myRank === i
          const medals = ["🥇", "🥈", "🥉"]
          return (
            <div key={member.username} style={{
              display: "flex", alignItems: "center", padding: "0.85rem 1rem",
              marginBottom: "0.5rem", borderRadius: "10px",
              background: isMe ? "#f0fff8" : i === 0 ? "#fffbf0" : "white",
              border: `1px solid ${isMe ? "#1D9E75" : i === 0 ? "#f5c842" : "#e0e0e0"}`,
            }}>
              <span style={{ width: "28px", fontSize: "16px" }}>
                {medals[i] ?? <span style={{ color: "#bbb", fontSize: "13px" }}>{i + 1}.</span>}
              </span>
              <span translate="no" style={{ flex: 1, fontWeight: isMe ? "600" : "400", fontSize: "15px", textTransform: "none" }}>
                {member.username}{isMe ? " (moi)" : ""}
              </span>
              <span style={{ fontWeight: "700", fontSize: "15px", color: "#1D9E75" }}>
                {member.pts} pt{member.pts !== 1 ? "s" : ""}
              </span>
            </div>
          )
        })
      )}
    </div>
  )
}

const inputStyle = {
  display: "block", width: "100%", padding: "10px", marginBottom: "0.75rem",
  borderRadius: "8px", border: "1px solid #e0e0e0", fontSize: "14px", boxSizing: "border-box",
}

const primaryBtn = {
  width: "100%", padding: "11px", background: "#1D9E75", color: "white",
  border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "500",
}

const secondaryBtn = {
  width: "100%", padding: "11px", background: "white", color: "#1D9E75",
  border: "1px solid #1D9E75", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "500",
}
