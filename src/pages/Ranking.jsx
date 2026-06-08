import { useState, useEffect } from "react"
import { supabase } from "../supabase"
import { RANKS, getRankProgress, RankShield, PositionBadge } from "../components/ranks"

const C = {
  bg: "#0F1923", card: "#1A2634", border: "#243447",
  primary: "#1D9E75", primaryGlow: "rgba(29,158,117,0.15)",
  text: "#f1f5f9", muted: "#94a3b8", dim: "#64748b",
}

const AVATAR_COLORS = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#ef4444","#3b82f6","#14b8a6","#f97316"]

const PODIUM_STYLE = [
  { bg: "rgba(255,215,0,0.10)",   border: "rgba(255,215,0,0.35)",   pts: "#FFD700" },
  { bg: "rgba(192,192,192,0.08)", border: "rgba(192,192,192,0.3)",  pts: "#C0C0C0" },
  { bg: "rgba(205,127,50,0.08)",  border: "rgba(205,127,50,0.3)",   pts: "#CD7F32" },
]

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
        background: color, borderRadius: height, transition: "width 0.4s ease",
      }} />
    </div>
  )
}

// ─── My Rank Card ─────────────────────────────────────────────────────────────

function MyRankCard({ pts }) {
  const { pct, rank, next } = getRankProgress(pts)
  const ptsToNext = next ? next.min - pts : 0

  return (
    <div style={{
      borderRadius: "16px", padding: "20px",
      border: `1.5px solid ${rank.color}44`,
      marginBottom: "16px",
      background: `linear-gradient(135deg, ${rank.color}18, ${rank.color}06)`,
    }}>
      <div style={{ fontSize: "11px", color: C.dim, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "14px" }}>
        Mon Rang
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", minWidth: "56px" }}>
          <RankShield rank={rank} size={44} />
          <div style={{ fontSize: "11px", fontWeight: "800", color: rank.color, letterSpacing: "0.5px" }}>
            {rank.name.toUpperCase()}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "10px" }}>
            <span style={{ fontSize: "32px", fontWeight: "800", color: C.text, letterSpacing: "-1px" }}>{pts}</span>
            <span style={{ fontSize: "13px", color: C.muted, fontWeight: "600" }}>pts</span>
          </div>

          {next ? (
            <>
              <ProgressBar pct={pct} color={rank.color} height={6} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
                <span style={{ fontSize: "11px", color: C.dim }}>{pts} / {next.min} pts</span>
                <span style={{ fontSize: "11px", color: rank.color, fontWeight: "600" }}>
                  {next.name} dans {ptsToNext} pts
                </span>
              </div>
            </>
          ) : (
            <>
              <ProgressBar pct={100} color={rank.color} height={6} />
              <div style={{ fontSize: "11px", color: rank.color, fontWeight: "700", marginTop: "6px" }}>
                Rang maximum atteint 🏆
              </div>
            </>
          )}
        </div>
      </div>

      {/* Rank ladder */}
      <div style={{ display: "flex", gap: "8px", marginTop: "18px", justifyContent: "center", alignItems: "flex-end" }}>
        {RANKS.map(r => {
          const active = r.name === rank.name
          const reached = r.min <= rank.min
          return (
            <div key={r.name} style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
              opacity: reached ? 1 : 0.3, transition: "opacity 0.2s",
            }}>
              <RankShield rank={r} size={active ? 28 : 20} />
              {active && <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: r.color }} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Ranks Explainer ──────────────────────────────────────────────────────────

function RanksExplainer() {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: "14px", padding: "16px", marginBottom: "16px",
    }}>
      <div style={{ fontSize: "11px", color: C.dim, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "12px" }}>
        Système de rangs
      </div>

      <div style={{ fontSize: "11px", color: C.muted, marginBottom: "12px" }}>
        Gagne des points en pariant : chaque pari correct rapporte des points selon les cotes.
        Plus tu accumules de points, plus ton rang monte.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {RANKS.map((r, i) => {
          const next = RANKS[i + 1]
          return (
            <div key={r.name} style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "8px 10px", borderRadius: "10px",
              background: `${r.color}0d`, border: `1px solid ${r.color}22`,
            }}>
              <RankShield rank={r} size={22} />
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: "12px", fontWeight: "700", color: r.color }}>
                  {r.name}
                </span>
              </div>
              <span style={{ fontSize: "11px", color: C.dim }}>
                {r.min === 0
                  ? `Départ · < ${RANKS[1].min} pts`
                  : next
                    ? `${r.min} – ${next.min - 1} pts`
                    : `${r.min}+ pts`
                }
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

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
  const myPos = myEntry ? players.findIndex(p => p.id === user.id) + 1 : null

  return (
    <div style={{ padding: "16px", maxWidth: "600px", margin: "0 auto" }}>

      {/* General header */}
      <div style={{
        background: `linear-gradient(135deg, rgba(29,158,117,0.2), rgba(29,158,117,0.05))`,
        border: `1px solid rgba(29,158,117,0.3)`,
        borderRadius: "16px", padding: "18px 20px", marginBottom: "16px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <div style={{ fontSize: "18px", fontWeight: "800", color: C.text }}>Classement Général</div>
          <div style={{ fontSize: "13px", color: C.muted, marginTop: "4px" }}>
            {players.length} joueur{players.length !== 1 ? "s" : ""} · mis à jour en temps réel
          </div>
        </div>
        {myPos && (
          <div style={{
            background: C.primaryGlow, border: `1px solid ${C.primary}44`,
            borderRadius: "10px", padding: "8px 16px", textAlign: "center",
          }}>
            <div style={{ fontSize: "22px", fontWeight: "800", color: C.primary }}>#{myPos}</div>
            <div style={{ fontSize: "10px", color: C.muted }}>Ma place</div>
          </div>
        )}
      </div>

      {/* My rank card */}
      {myEntry && <MyRankCard pts={myEntry.points_total} />}

      {/* Ranks explainer */}
      <RanksExplainer />

      {/* Label */}
      <div style={{ fontSize: "11px", color: C.dim, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "10px", paddingLeft: "4px" }}>
        Classement · {players.length} joueurs
      </div>

      {/* Player list */}
      {players.map((player, i) => {
        const pts = player.points_total
        const { pct, rank, next } = getRankProgress(pts)
        const pod = PODIUM_STYLE[i]
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

            <div style={{ flexShrink: 0, paddingTop: "6px" }}>
              <PositionBadge position={i + 1} size={26} />
            </div>

            <Avatar username={player.username} size={38} />

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
                <RankShield rank={rank} size={20} />
                <span style={{ fontSize: "10px", fontWeight: "700", color: rank.color }}>
                  {rank.name.toUpperCase()}
                </span>
              </div>

              <div style={{ marginTop: "7px" }}>
                <ProgressBar pct={pct} color={rank.color} height={4} />
                <div style={{ fontSize: "10px", color: C.dim, marginTop: "4px" }}>
                  {next
                    ? `${pts} / ${next.min} pts pour ${next.name}`
                    : <span style={{ color: rank.color, fontWeight: "700" }}>Rang maximum</span>
                  }
                </div>
              </div>
            </div>

            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: "22px", fontWeight: "800", color: pod?.pts ?? C.primary }}>
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
