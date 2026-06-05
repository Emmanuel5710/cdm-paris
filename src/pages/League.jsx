import { useState, useEffect } from "react"
import { supabase } from "../supabase"

const C = {
  bg: "#0F1923", card: "#1A2634", border: "#243447",
  primary: "#1D9E75", primaryGlow: "rgba(29,158,117,0.15)",
  text: "#f1f5f9", muted: "#94a3b8", dim: "#64748b",
}

const AVATAR_COLORS = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#ef4444","#3b82f6","#14b8a6","#f97316"]

function Avatar({ username, size = 40 }) {
  const initials = (username || "?").slice(0, 2).toUpperCase()
  const color = AVATAR_COLORS[(username?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: color,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: "700", fontSize: size * 0.35, color: "white", flexShrink: 0,
    }}>{initials}</div>
  )
}

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

  useEffect(() => { fetchUserLeague() }, [])

  useEffect(() => {
    if (!league) return
    fetchRanking()
    const channel = supabase.channel("league-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "bets" }, fetchRanking)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches" }, fetchRanking)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [league])

  async function fetchUserLeague() {
    const { data } = await supabase
      .from("league_members").select("league_id, leagues(id, name, invite_code)")
      .eq("user_id", user.id).single()
    if (data?.leagues) setLeague(data.leagues)
    setLoading(false)
  }

  async function fetchRanking() {
    if (!league) return
    const { data: members } = await supabase.from("league_members").select("user_id").eq("league_id", league.id)
    if (!members?.length) { setRanking([]); return }

    const membersWithProfiles = await Promise.all(
      members.map(async m => {
        const { data: p } = await supabase.from("profiles").select("username").eq("id", m.user_id).single()
        return { user_id: m.user_id, username: p?.username || "Inconnu" }
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
    for (const m of membersWithProfiles) pointsMap[m.user_id] = { username: m.username, pts: 0 }
    for (const b of bets || []) {
      if (pointsMap[b.user_id] && resultMap[b.match_id] === b.bet_value) pointsMap[b.user_id].pts++
    }
    setRanking(Object.values(pointsMap).sort((a, b) => b.pts - a.pts))
  }

  async function createLeague() {
    setError("")
    if (!createName.trim()) { setError("Entre un nom de ligue"); return }
    const code = generateCode()
    const { data, error: err } = await supabase.from("leagues")
      .insert({ name: createName.trim(), invite_code: code, owner_id: user.id })
      .select().single()
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
    const { data: existing } = await supabase.from("league_members").select("id")
      .eq("league_id", lg.id).eq("user_id", user.id).single()
    if (!existing) await supabase.from("league_members").insert({ league_id: lg.id, user_id: user.id })
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

  if (loading) return (
    <div style={{ padding: "3rem", textAlign: "center", color: C.muted }}>
      <div style={{ fontSize: "32px", marginBottom: "12px" }}>🏆</div>
      Chargement...
    </div>
  )

  if (!league) return (
    <div style={{ padding: "20px", maxWidth: "420px", margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: "28px", paddingTop: "8px" }}>
        <div style={{ fontSize: "48px" }}>🏆</div>
        <h2 style={{ fontSize: "22px", fontWeight: "800", marginTop: "12px" }}>Ma Ligue</h2>
        <p style={{ color: C.muted, fontSize: "14px", marginTop: "6px" }}>Crée ou rejoins une ligue privée</p>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: "10px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", fontSize: "13px", marginBottom: "16px" }}>
          {error}
        </div>
      )}

      <div style={{ background: C.card, borderRadius: "16px", padding: "20px", border: `1px solid ${C.border}`, marginBottom: "12px" }}>
        <h3 style={{ fontSize: "14px", fontWeight: "700", marginBottom: "14px", color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>Créer une ligue</h3>
        <input placeholder="Nom de la ligue" value={createName}
          onChange={e => { setCreateName(e.target.value); setError("") }}
          style={inp} />
        <button onClick={createLeague} style={primaryBtn}>Créer</button>
      </div>

      <div style={{ background: C.card, borderRadius: "16px", padding: "20px", border: `1px solid ${C.border}` }}>
        <h3 style={{ fontSize: "14px", fontWeight: "700", marginBottom: "14px", color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>Rejoindre une ligue</h3>
        <input placeholder="Code d'invitation (ex: ABC123)" value={joinCode}
          onChange={e => { setJoinCode(e.target.value.toUpperCase()); setError("") }}
          style={inp} />
        <button onClick={joinLeague} style={secondaryBtn}>Rejoindre</button>
      </div>
    </div>
  )

  const PODIUM = [
    { medal: "🥇", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.4)", pts: "#f59e0b" },
    { medal: "🥈", bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.3)", pts: "#94a3b8" },
    { medal: "🥉", bg: "rgba(205,127,50,0.08)", border: "rgba(205,127,50,0.3)", pts: "#cd7f32" },
  ]

  return (
    <div style={{ padding: "16px", maxWidth: "600px", margin: "0 auto" }}>

      {/* League header */}
      <div style={{
        background: `linear-gradient(135deg, rgba(29,158,117,0.2), rgba(29,158,117,0.05))`,
        border: `1px solid rgba(29,158,117,0.3)`,
        borderRadius: "16px", padding: "18px 20px", marginBottom: "16px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <div style={{ fontSize: "18px", fontWeight: "800", color: C.text }}>{league.name}</div>
          <div style={{ fontSize: "12px", color: C.muted, marginTop: "4px", fontFamily: "monospace", letterSpacing: "2px" }}>
            {league.invite_code}
          </div>
        </div>
        <button onClick={shareLeague} style={{
          padding: "8px 16px", borderRadius: "20px", border: `1px solid ${C.primary}`,
          background: C.primaryGlow, color: C.primary, cursor: "pointer",
          fontSize: "13px", fontWeight: "600",
        }}>
          {copied ? "✓ Copié" : "📤 Partager"}
        </button>
      </div>

      {/* Ranking */}
      {ranking.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem 1rem", color: C.muted }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>⏳</div>
          <p style={{ fontWeight: "600", color: C.text }}>En attente des résultats</p>
          <p style={{ fontSize: "13px", marginTop: "6px" }}>Le classement se met à jour automatiquement</p>
        </div>
      ) : ranking.map((member, i) => {
        const p = PODIUM[i]
        return (
          <div key={member.username} className="card-enter"
            style={{
              display: "flex", alignItems: "center", gap: "12px",
              padding: "14px 16px", marginBottom: "8px", borderRadius: "14px",
              background: p?.bg ?? C.card,
              border: `1px solid ${p?.border ?? C.border}`,
              animationDelay: `${i * 0.06}s`,
            }}>
            <div style={{ width: "28px", textAlign: "center", fontSize: "20px", flexShrink: 0 }}>
              {p?.medal ?? <span style={{ color: C.dim, fontSize: "13px", fontWeight: "700" }}>{i + 1}</span>}
            </div>
            <Avatar username={member.username} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div translate="no" style={{ fontWeight: "600", fontSize: "15px", color: C.text, textTransform: "none" }}>
                {member.username}
              </div>
              <div style={{ fontSize: "12px", color: C.muted }}>
                {member.pts} pronostic{member.pts !== 1 ? "s" : ""} correct{member.pts !== 1 ? "s" : ""}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: "24px", fontWeight: "800", color: p?.pts ?? C.primary }}>
                {member.pts * 10}
              </div>
              <div style={{ fontSize: "10px", color: C.dim, marginTop: "-2px" }}>pts</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const inp = {
  display: "block", width: "100%", padding: "12px 14px", marginBottom: "12px",
  borderRadius: "10px", border: `1px solid ${C.border}`,
  background: "#0F1923", color: "#f1f5f9", fontSize: "14px", outline: "none",
}
const primaryBtn = {
  width: "100%", padding: "12px", background: C.primary, color: "white",
  border: "none", borderRadius: "10px", cursor: "pointer", fontSize: "14px", fontWeight: "700",
}
const secondaryBtn = {
  width: "100%", padding: "12px", background: "transparent", color: C.primary,
  border: `1.5px solid ${C.primary}`, borderRadius: "10px", cursor: "pointer", fontSize: "14px", fontWeight: "700",
}
