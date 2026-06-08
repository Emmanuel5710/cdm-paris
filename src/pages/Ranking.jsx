import { useState, useEffect } from "react"
import { supabase } from "../supabase"
import { RANKS, getRankProgress, RankShield } from "../components/ranks"

const C = {
  bg: "#0F1923", card: "#1A2634", border: "#243447",
  primary: "#1D9E75", primaryGlow: "rgba(29,158,117,0.15)",
  text: "#f1f5f9", muted: "#94a3b8", dim: "#64748b",
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

// ─── Coming Soon card ─────────────────────────────────────────────────────────

function ComingSoon({ onNavigate }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: "16px", padding: "32px 24px",
      textAlign: "center",
    }}>
      <div style={{ fontSize: "52px", marginBottom: "14px" }}>🏆</div>
      <div style={{ fontSize: "18px", fontWeight: "800", color: C.text, marginBottom: "10px" }}>
        Le classement général sera disponible prochainement
      </div>
      <div style={{ fontSize: "13px", color: C.muted, lineHeight: "1.6", marginBottom: "24px" }}>
        Rejoins une ligue privée pour voir ton classement entre amis dès maintenant.
      </div>
      <button
        onClick={() => onNavigate("league")}
        style={{
          padding: "12px 28px", borderRadius: "30px", border: "none",
          background: `linear-gradient(135deg, ${C.primary}, #166d52)`,
          color: "white", fontSize: "14px", fontWeight: "700",
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(29,158,117,0.35)",
        }}>
        🤝 Rejoindre une ligue
      </button>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Ranking({ user, onNavigate }) {
  const [myEntry, setMyEntry] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, points_total")
        .eq("id", user.id)
        .single()
      if (data) setMyEntry({ ...data, points_total: data.points_total ?? 0 })
      setLoading(false)
    }
    load()
  }, [user.id])

  if (loading) return (
    <div style={{ padding: "3rem", textAlign: "center", color: C.muted }}>
      <div style={{ fontSize: "32px", marginBottom: "12px" }}>🏆</div>
      Chargement...
    </div>
  )

  return (
    <div style={{ padding: "16px", maxWidth: "600px", margin: "0 auto" }}>

      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, rgba(29,158,117,0.2), rgba(29,158,117,0.05))`,
        border: `1px solid rgba(29,158,117,0.3)`,
        borderRadius: "16px", padding: "18px 20px", marginBottom: "16px",
      }}>
        <div style={{ fontSize: "18px", fontWeight: "800", color: C.text }}>Classement</div>
        <div style={{ fontSize: "13px", color: C.muted, marginTop: "4px" }}>
          Suis ta progression et ton rang
        </div>
      </div>

      {/* My rank card */}
      {myEntry && <MyRankCard pts={myEntry.points_total} />}

      {/* Ranks explainer */}
      <RanksExplainer />

      {/* Coming soon */}
      <ComingSoon onNavigate={onNavigate} />

    </div>
  )
}
