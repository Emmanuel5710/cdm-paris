import { useState, useEffect } from "react"
import { supabase } from "../supabase"

const C = {
  bg: "#0F1923", card: "#1A2634", border: "#243447",
  primary: "#1D9E75", primaryGlow: "rgba(29,158,117,0.15)",
  text: "#f1f5f9", muted: "#94a3b8", dim: "#64748b",
}

const AVATAR_COLORS = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#ef4444","#3b82f6","#14b8a6","#f97316"]

// ─── Rank system ──────────────────────────────────────────────────────────────

const RANKS = [
  { name: "Bronze",  icon: "🪨", min: 0,    max: 99,   color: "#b87333" },
  { name: "Argent",  icon: "⚙️", min: 100,  max: 249,  color: "#94a3b8" },
  { name: "Or",      icon: "🥇", min: 250,  max: 499,  color: "#f59e0b" },
  { name: "Diamant", icon: "💎", min: 500,  max: 999,  color: "#60a5fa" },
  { name: "Légende", icon: "👑", min: 1000, max: null,  color: "#c084fc" },
]

function getRank(pts) {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (pts >= RANKS[i].min) return RANKS[i]
  }
  return RANKS[0]
}

function getNextRank(pts) {
  return RANKS.find(r => r.min > pts) ?? null
}

function getRankProgress(pts) {
  const rank = getRank(pts)
  const next = getNextRank(pts)
  if (!next) return { pct: 100, rank, next: null }
  const pct = Math.round(((pts - rank.min) / (next.min - rank.min)) * 100)
  return { pct, rank, next }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function ProgressBar({ pct, color, height = 5 }) {
  return (
    <div style={{ height, background: C.border, borderRadius: height, overflow: "hidden" }}>
      <div style={{
        height: "100%", width: `${Math.min(100, pct)}%`,
        background: color, borderRadius: height,
        transition: "width 0.4s ease",
      }} />
    </div>
  )
}

function MyRankCard({ member }) {
  if (!member) return null
  const totalPts = member.pts * 10
  const { pct, rank, next } = getRankProgress(totalPts)
  const ptsToNext = next ? next.min - totalPts : 0

  return (
    <div style={{
      background: C.card, borderRadius: "16px", padding: "20px",
      border: `1.5px solid ${rank.color}44`,
      marginBottom: "16px",
      background: `linear-gradient(135deg, ${rank.color}18, ${rank.color}06)`,
    }}>
      <div style={{ fontSize: "11px", color: C.dim, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "14px" }}>
        Mon Rang
      </div>

      {/* Rank display */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div style={{ textAlign: "center", minWidth: "60px" }}>
          <div style={{ fontSize: "42px", lineHeight: 1 }}>{rank.icon}</div>
          <div style={{ fontSize: "11px", fontWeight: "800", color: rank.color, marginTop: "4px", letterSpacing: "0.5px" }}>
            {rank.name.toUpperCase()}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "10px" }}>
            <span style={{ fontSize: "32px", fontWeight: "800", color: C.text, letterSpacing: "-1px" }}>{totalPts}</span>
            <span style={{ fontSize: "13px", color: C.muted, fontWeight: "600" }}>pts</span>
          </div>

          {next ? (
            <>
              <ProgressBar pct={pct} color={rank.color} height={6} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
                <span style={{ fontSize: "11px", color: C.dim }}>
                  {totalPts} / {next.min} pts
                </span>
                <span style={{ fontSize: "11px", color: rank.color, fontWeight: "600" }}>
                  {next.icon} {next.name} dans {ptsToNext} pts
                </span>
              </div>
            </>
          ) : (
            <>
              <ProgressBar pct={100} color={rank.color} height={6} />
              <div style={{ fontSize: "11px", color: rank.color, fontWeight: "700", marginTop: "6px" }}>
                Rang maximum atteint 👑
              </div>
            </>
          )}
        </div>
      </div>

      {/* Rank ladder mini */}
      <div style={{ display: "flex", gap: "4px", marginTop: "16px", justifyContent: "center" }}>
        {RANKS.map((r, i) => {
          const active = r.name === rank.name
          const passed = r.min < rank.min || active
          return (
            <div key={r.name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", opacity: passed ? 1 : 0.35 }}>
              <span style={{ fontSize: active ? "18px" : "13px", transition: "font-size 0.2s" }}>{r.icon}</span>
              {active && <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: r.color }} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

// ─── Main component ───────────────────────────────────────────────────────────

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
    for (const m of membersWithProfiles) pointsMap[m.user_id] = { user_id: m.user_id, username: m.username, pts: 0 }
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

  const myEntry = ranking.find(m => m.user_id === user.id)

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

      {/* My rank card */}
      <MyRankCard member={myEntry} />

      {/* Ranking */}
      {ranking.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem 1rem", color: C.muted }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>⏳</div>
          <p style={{ fontWeight: "600", color: C.text }}>En attente des résultats</p>
          <p style={{ fontSize: "13px", marginTop: "6px" }}>Le classement se met à jour automatiquement</p>
        </div>
      ) : (
        <>
          <div style={{ fontSize: "11px", color: C.dim, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "10px", paddingLeft: "4px" }}>
            Classement
          </div>
          {ranking.map((member, i) => {
            const p = PODIUM[i]
            const totalPts = member.pts * 10
            const { pct, rank, next } = getRankProgress(totalPts)
            const isMe = member.user_id === user.id

            return (
              <div key={member.username} className="card-enter"
                style={{
                  display: "flex", alignItems: "flex-start", gap: "12px",
                  padding: "14px 16px", marginBottom: "8px", borderRadius: "14px",
                  background: isMe
                    ? `linear-gradient(135deg, rgba(29,158,117,0.12), rgba(29,158,117,0.04))`
                    : (p?.bg ?? C.card),
                  border: `1px solid ${isMe ? "rgba(29,158,117,0.4)" : (p?.border ?? C.border)}`,
                  animationDelay: `${i * 0.06}s`,
                }}>

                {/* Position / medal */}
                <div style={{ width: "28px", textAlign: "center", fontSize: "20px", flexShrink: 0, paddingTop: "2px" }}>
                  {p?.medal ?? <span style={{ color: C.dim, fontSize: "13px", fontWeight: "700" }}>{i + 1}</span>}
                </div>

                <Avatar username={member.username} size={40} />

                {/* Name + rank + progress */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                    <span translate="no" style={{ fontWeight: "700", fontSize: "15px", color: C.text }}>
                      {member.username}
                    </span>
                    {isMe && <span style={{ fontSize: "10px", color: C.primary, fontWeight: "700", background: C.primaryGlow, borderRadius: "20px", padding: "1px 6px" }}>Moi</span>}
                    <span style={{ fontSize: "12px" }}>{rank.icon}</span>
                    <span style={{ fontSize: "10px", fontWeight: "700", color: rank.color }}>
                      {rank.name.toUpperCase()}
                    </span>
                  </div>

                  <div style={{ fontSize: "11px", color: C.muted, marginTop: "2px", marginBottom: next ? "7px" : 0 }}>
                    {member.pts} pronostic{member.pts !== 1 ? "s" : ""} correct{member.pts !== 1 ? "s" : ""}
                  </div>

                  {next && (
                    <>
                      <ProgressBar pct={pct} color={rank.color} height={4} />
                      <div style={{ fontSize: "10px", color: C.dim, marginTop: "4px" }}>
                        {totalPts} / {next.min} pts pour {next.icon} {next.name}
                      </div>
                    </>
                  )}
                  {!next && (
                    <div style={{ fontSize: "10px", color: rank.color, fontWeight: "700", marginTop: "3px" }}>
                      Rang max 👑
                    </div>
                  )}
                </div>

                {/* Points */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: "24px", fontWeight: "800", color: p?.pts ?? C.primary }}>
                    {totalPts}
                  </div>
                  <div style={{ fontSize: "10px", color: C.dim, marginTop: "-2px" }}>pts</div>
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

const inp = {
  display: "block", width: "100%", padding: "12px 14px", marginBottom: "12px",
  borderRadius: "10px", border: `1px solid ${C.border}`,
  background: "#0F1923", color: "#f1f5f9", fontSize: "14px", outline: "none",
  boxSizing: "border-box",
}
const primaryBtn = {
  width: "100%", padding: "12px", background: C.primary, color: "white",
  border: "none", borderRadius: "10px", cursor: "pointer", fontSize: "14px", fontWeight: "700",
}
const secondaryBtn = {
  width: "100%", padding: "12px", background: "transparent", color: C.primary,
  border: `1.5px solid ${C.primary}`, borderRadius: "10px", cursor: "pointer", fontSize: "14px", fontWeight: "700",
}
