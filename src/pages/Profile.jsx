import { useState, useEffect } from "react"
import { supabase } from "../supabase"

const C = {
  bg: "#0F1923", card: "#1A2634", border: "#243447",
  primary: "#1D9E75", primaryDark: "#166d52",
  text: "#f1f5f9", muted: "#94a3b8", dim: "#64748b",
  win: "#22c55e", lose: "#ef4444", overlay: "rgba(0,0,0,0.6)",
}

export default function Profile({ user, username, credits, xp, onClose }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    async function load() {
      const { data: bets } = await supabase
        .from("bets")
        .select("bet_type, processed, stake, odds")
        .eq("user_id", user.id)

      if (!bets) { setLoading(false); return }

      const total = bets.length
      const result = bets.filter(b => b.bet_type === "result")
      const won = result.filter(b => b.processed === true).length
      const lost = result.filter(b => b.processed === false).length
      const pending = result.filter(b => b.processed === null || b.processed === undefined).length
      const advanced = bets.filter(b => b.bet_type !== "result").length

      const totalStaked = result.reduce((s, b) => s + (b.stake ?? 0), 0)
      const totalGained = result
        .filter(b => b.processed === true)
        .reduce((s, b) => s + Math.round((b.stake ?? 0) * Number(b.odds ?? 2)), 0)

      const winRate = result.length > 0
        ? Math.round((won / (won + lost || 1)) * 100)
        : null

      setStats({ total, won, lost, pending, advanced, totalStaked, totalGained, winRate })
      setLoading(false)
    }
    load()
  }, [user?.id])

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: C.overlay,
        zIndex: 100, backdropFilter: "blur(2px)",
      }} />

      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: "min(360px, 100vw)",
        background: C.bg, zIndex: 101,
        display: "flex", flexDirection: "column",
        boxShadow: "-8px 0 40px rgba(0,0,0,0.5)",
        overflowY: "auto",
      }}>

        {/* Header */}
        <div style={{
          background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
          padding: "20px 20px 24px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ fontSize: "36px" }}>👤</div>
            <button onClick={onClose} style={{
              background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%",
              width: "32px", height: "32px", cursor: "pointer",
              color: "white", fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center",
            }}>✕</button>
          </div>
          <div style={{ marginTop: "12px" }}>
            <div style={{ fontSize: "20px", fontWeight: "800", color: "white" }}>
              {username || "Joueur"}
            </div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)", marginTop: "3px" }}>
              {user.email}
            </div>
          </div>

          {/* Credits + XP */}
          <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            <div style={{
              flex: 1, background: "rgba(255,255,255,0.15)", borderRadius: "12px", padding: "10px 14px",
            }}>
              <div style={{ fontSize: "18px", fontWeight: "800", color: "white" }}>
                💰 {(credits ?? 0).toLocaleString("fr-FR")}
              </div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.7)", marginTop: "2px" }}>crédits</div>
            </div>
            <div style={{
              flex: 1, background: "rgba(255,255,255,0.15)", borderRadius: "12px", padding: "10px 14px",
            }}>
              <div style={{ fontSize: "18px", fontWeight: "800", color: "white" }}>
                ⭐ {(xp ?? 0).toLocaleString("fr-FR")}
              </div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.7)", marginTop: "2px" }}>XP</div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ padding: "20px", flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: "center", color: C.muted, padding: "2rem" }}>
              Chargement des stats...
            </div>
          ) : stats ? (
            <>
              {/* Win rate */}
              {stats.winRate !== null && (
                <div style={{
                  background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: "14px", padding: "16px 18px", marginBottom: "12px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div>
                    <div style={{ fontSize: "13px", color: C.dim, fontWeight: "600", marginBottom: "4px" }}>
                      Taux de réussite
                    </div>
                    <div style={{ fontSize: "28px", fontWeight: "900", color: stats.winRate >= 50 ? C.win : C.lose }}>
                      {stats.winRate}%
                    </div>
                  </div>
                  <div style={{ fontSize: "40px" }}>
                    {stats.winRate >= 60 ? "🔥" : stats.winRate >= 40 ? "📊" : "💪"}
                  </div>
                </div>
              )}

              {/* W/L/Pending */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "12px" }}>
                {[
                  { label: "Gagnés", value: stats.won, color: C.win, icon: "✅" },
                  { label: "Perdus",  value: stats.lost, color: C.lose, icon: "❌" },
                  { label: "En cours", value: stats.pending, color: C.muted, icon: "⏳" },
                ].map(s => (
                  <div key={s.label} style={{
                    background: C.card, border: `1px solid ${C.border}`,
                    borderRadius: "12px", padding: "12px 10px", textAlign: "center",
                  }}>
                    <div style={{ fontSize: "18px", marginBottom: "4px" }}>{s.icon}</div>
                    <div style={{ fontSize: "20px", fontWeight: "800", color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: "10px", color: C.dim, marginTop: "2px" }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Total bets */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
                {[
                  { label: "Paris résultat", value: stats.won + stats.lost + stats.pending, icon: "⚽" },
                  { label: "Paris avancés",  value: stats.advanced, icon: "🎯" },
                ].map(s => (
                  <div key={s.label} style={{
                    background: C.card, border: `1px solid ${C.border}`,
                    borderRadius: "12px", padding: "12px 14px",
                    display: "flex", alignItems: "center", gap: "10px",
                  }}>
                    <span style={{ fontSize: "20px" }}>{s.icon}</span>
                    <div>
                      <div style={{ fontSize: "18px", fontWeight: "800", color: C.text }}>{s.value}</div>
                      <div style={{ fontSize: "10px", color: C.dim }}>{s.label}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Financial summary */}
              <div style={{
                background: C.card, border: `1px solid ${C.border}`,
                borderRadius: "14px", padding: "14px 16px", marginBottom: "20px",
              }}>
                <div style={{ fontSize: "12px", color: C.dim, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>
                  Bilan crédits
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "13px", color: C.muted }}>Misés total</span>
                  <span style={{ fontSize: "13px", fontWeight: "700", color: C.text }}>
                    💰 {stats.totalStaked.toLocaleString("fr-FR")}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "13px", color: C.muted }}>Gains obtenus</span>
                  <span style={{ fontSize: "13px", fontWeight: "700", color: C.win }}>
                    💰 {stats.totalGained.toLocaleString("fr-FR")}
                  </span>
                </div>
                {stats.totalStaked > 0 && (
                  <div style={{
                    marginTop: "10px", paddingTop: "10px", borderTop: `1px solid ${C.border}`,
                    display: "flex", justifyContent: "space-between",
                  }}>
                    <span style={{ fontSize: "13px", color: C.muted }}>Net</span>
                    <span style={{
                      fontSize: "14px", fontWeight: "800",
                      color: stats.totalGained - stats.totalStaked >= 0 ? C.win : C.lose,
                    }}>
                      {stats.totalGained - stats.totalStaked >= 0 ? "+" : ""}
                      💰 {(stats.totalGained - stats.totalStaked).toLocaleString("fr-FR")}
                    </span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", color: C.muted, padding: "2rem" }}>
              Aucune statistique disponible.
            </div>
          )}

          {/* Logout */}
          <button onClick={() => supabase.auth.signOut()} style={{
            width: "100%", padding: "13px", borderRadius: "12px", border: "none",
            background: "rgba(239,68,68,0.1)", color: "#f87171",
            fontSize: "14px", fontWeight: "700", cursor: "pointer",
            border: "1px solid rgba(239,68,68,0.2)",
          }}>
            Se déconnecter
          </button>
        </div>
      </div>
    </>
  )
}
