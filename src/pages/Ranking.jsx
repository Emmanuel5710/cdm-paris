import { useState, useEffect } from "react"
import { supabase } from "../supabase"

const C = {
  bg: "#0F1923", card: "#1A2634", border: "#243447",
  primary: "#1D9E75", primaryGlow: "rgba(29,158,117,0.15)",
  text: "#f1f5f9", muted: "#94a3b8", dim: "#64748b",
}

const AVATAR_COLORS = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#ef4444","#3b82f6","#14b8a6","#f97316"]

// ─── Rank system (same thresholds as League) ──────────────────────────────────

const RANKS = [
  { name: "Bronze",  icon: "🪨", min: 0,    max: 99,  color: "#b87333" },
  { name: "Argent",  icon: "⚙️", min: 100,  max: 249, color: "#94a3b8" },
  { name: "Or",      icon: "🥇", min: 250,  max: 499, color: "#f59e0b" },
  { name: "Diamant", icon: "💎", min: 500,  max: 999, color: "#60a5fa" },
  { name: "Légende", icon: "👑", min: 1000, max: null, color: "#c084fc" },
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function Avatar({ username, size = 38 }) {
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

function ProgressBar({ pct, color, height = 4 }) {
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

const PODIUM = [
  { medal: "🥇", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.4)", ptsColor: "#f59e0b" },
  { medal: "🥈", bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.3)", ptsColor: "#94a3b8" },
  { medal: "🥉", bg: "rgba(205,127,50,0.08)", border: "rgba(205,127,50,0.3)", ptsColor: "#cd7f32" },
]

// ─── Main component ───────────────────────────────────────────────────────────

export default function Ranking({ user }) {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, points_total")
        .order("points_total", { ascending: false })
      setPlayers((data || []).map(p => ({ ...p, points_total: p.points_total ?? 0 })))
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div style={{ padding: "3rem", textAlign: "center", color: C.muted }}>
      <div style={{ fontSize: "32px", marginBottom: "12px" }}>🏆</div>
      Chargement du classement...
    </div>
  )

  if (!players.length) return (
    <div style={{ padding: "3rem", textAlign: "center", color: C.muted }}>
      <div style={{ fontSize: "40px", marginBottom: "12px" }}>⏳</div>
      <p style={{ fontWeight: "600", color: C.text }}>Aucun joueur pour l'instant</p>
    </div>
  )

  const myEntry = players.find(p => p.id === user.id)
  const myRank = myEntry ? getRank(myEntry.points_total) : null
  const myPos = myEntry ? players.findIndex(p => p.id === user.id) + 1 : null

  return (
    <div style={{ padding: "16px", maxWidth: "600px", margin: "0 auto" }}>

      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, rgba(29,158,117,0.2), rgba(29,158,117,0.05))`,
        border: `1px solid rgba(29,158,117,0.3)`,
        borderRadius: "16px", padding: "18px 20px", marginBottom: "16px",
      }}>
        <div style={{ fontSize: "18px", fontWeight: "800", color: C.text }}>Classement Général</div>
        <div style={{ fontSize: "13px", color: C.muted, marginTop: "4px" }}>
          {players.length} joueur{players.length !== 1 ? "s" : ""} · mis à jour en temps réel
        </div>

        {/* My position summary */}
        {myEntry && (
          <div style={{
            marginTop: "14px", paddingTop: "14px", borderTop: `1px solid rgba(29,158,117,0.2)`,
            display: "flex", alignItems: "center", gap: "12px",
          }}>
            <div style={{
              background: C.primaryGlow, border: `1px solid ${C.primary}44`,
              borderRadius: "10px", padding: "8px 14px", textAlign: "center", flexShrink: 0,
            }}>
              <div style={{ fontSize: "20px", fontWeight: "800", color: C.primary }}>#{myPos}</div>
              <div style={{ fontSize: "10px", color: C.muted }}>Ma place</div>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "18px" }}>{myRank.icon}</span>
                <span style={{ fontSize: "14px", fontWeight: "700", color: myRank.color }}>{myRank.name}</span>
              </div>
              <div style={{ fontSize: "13px", color: C.muted, marginTop: "2px" }}>
                {myEntry.points_total} pts
                {getNextRank(myEntry.points_total) && (
                  <span style={{ color: C.dim }}> · {getNextRank(myEntry.points_total).min - myEntry.points_total} pts pour {getNextRank(myEntry.points_total).icon} {getNextRank(myEntry.points_total).name}</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Player list */}
      {players.map((player, i) => {
        const pts = player.points_total
        const rank = getRank(pts)
        const next = getNextRank(pts)
        const pct = next ? Math.round(((pts - rank.min) / (next.min - rank.min)) * 100) : 100
        const pod = PODIUM[i]
        const isMe = player.id === user.id

        return (
          <div key={player.id} className="card-enter"
            style={{
              display: "flex", alignItems: "flex-start", gap: "12px",
              padding: "14px 16px", marginBottom: "8px", borderRadius: "14px",
              background: isMe
                ? `linear-gradient(135deg, rgba(29,158,117,0.12), rgba(29,158,117,0.04))`
                : (pod?.bg ?? C.card),
              border: `1px solid ${isMe ? "rgba(29,158,117,0.4)" : (pod?.border ?? C.border)}`,
              animationDelay: `${i * 0.04}s`,
            }}>

            {/* Position */}
            <div style={{ width: "28px", textAlign: "center", flexShrink: 0, paddingTop: "2px" }}>
              {pod
                ? <span style={{ fontSize: "20px" }}>{pod.medal}</span>
                : <span style={{ color: C.dim, fontSize: "13px", fontWeight: "700" }}>{i + 1}</span>
              }
            </div>

            <Avatar username={player.username} size={38} />

            {/* Name + rank + progress */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                <span translate="no" style={{ fontWeight: "700", fontSize: "14px", color: C.text }}>
                  {player.username || "Inconnu"}
                </span>
                {isMe && (
                  <span style={{ fontSize: "10px", color: C.primary, fontWeight: "700", background: C.primaryGlow, borderRadius: "20px", padding: "1px 6px", border: `1px solid ${C.primary}33` }}>
                    Moi
                  </span>
                )}
                <span style={{ fontSize: "12px" }}>{rank.icon}</span>
                <span style={{ fontSize: "10px", fontWeight: "700", color: rank.color }}>
                  {rank.name.toUpperCase()}
                </span>
              </div>

              <div style={{ marginTop: "7px" }}>
                <ProgressBar pct={pct} color={rank.color} height={4} />
                <div style={{ fontSize: "10px", color: C.dim, marginTop: "4px" }}>
                  {next
                    ? `${pts} / ${next.min} pts pour ${next.icon} ${next.name}`
                    : <span style={{ color: rank.color, fontWeight: "700" }}>Rang maximum 👑</span>
                  }
                </div>
              </div>
            </div>

            {/* Points */}
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: "22px", fontWeight: "800", color: pod?.ptsColor ?? C.primary }}>
                {pts}
              </div>
              <div style={{ fontSize: "10px", color: C.dim, marginTop: "-2px" }}>pts</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
