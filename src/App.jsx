import { useState, useEffect, useCallback } from "react"
import { supabase } from "./supabase"
import Matches from "./pages/Matches"
import Ranking from "./pages/Ranking"
import League from "./pages/League"
import Combined from "./pages/Combined"
import MyBets from "./pages/MyBets"
import Profile from "./pages/Profile"
import { importMatches } from "./importMatches"
import { usePushNotifications } from "./hooks/usePushNotifications"

const C = {
  bg: "#0F1923", card: "#1A2634", border: "#243447",
  primary: "#1D9E75", primaryDark: "#166d52",
  text: "#f1f5f9", muted: "#94a3b8", dim: "#64748b",
}

const inp = {
  display: "block", width: "100%", padding: "13px 16px",
  marginBottom: "12px", borderRadius: "12px",
  border: `1px solid ${C.border}`, background: C.card,
  color: C.text, fontSize: "15px", outline: "none",
}

export default function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [page, setPage] = useState("matches")
  const [credits, setCredits] = useState(null)
  const [xp, setXp] = useState(0)
  const [isAdmin, setIsAdmin] = useState(false)
  const [activeBettors, setActiveBettors] = useState(null)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [username, setUsername] = useState("")
  const [isLogin, setIsLogin] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [showProfile, setShowProfile] = useState(false)
  const [showNotifModal, setShowNotifModal] = useState(false)
  const { status: pushStatus, requestPermission } = usePushNotifications(user)

  const fetchProfile = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_my_profile")
    if (error) {
      console.error("get_my_profile error:", error.message, error.code)
      // Fallback : lecture directe (fonctionne si le REVOKE n'a pas encore été appliqué)
      const { data: p2, error: e2 } = await supabase
        .from("profiles").select("credits, xp, username, is_admin").eq("id", (await supabase.auth.getUser()).data.user?.id).single()
      if (e2) { console.error("fallback profile error:", e2.message); return }
      if (p2) { setCredits(p2.credits ?? 500); setXp(p2.xp ?? 0); setUsername(p2.username ?? ""); setIsAdmin(p2.is_admin ?? false) }
      return
    }
    const p = data?.[0]
    if (p) {
      setCredits(p.credits ?? 500)
      setXp(p.xp ?? 0)
      setUsername(p.username ?? "")
      setIsAdmin(p.is_admin ?? false)
    } else {
      console.warn("get_my_profile returned empty — profile row missing?")
    }
  }, [])

  const fetchActiveBettors = useCallback(async () => {
    const { data } = await supabase.rpc("count_active_bettors")
    if (data != null) setActiveBettors(data)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) { fetchActiveBettors(); importMatches() }
      setAuthLoading(false)
    })
    supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) { fetchActiveBettors(); importMatches() }
      else { setCredits(0); setXp(0); setUsername(""); setActiveBettors(null) }
    })
  }, [fetchActiveBettors])

  // Popup notification : une seule fois, 2s après connexion
  useEffect(() => {
    if (!user || pushStatus !== "idle") return
    if (localStorage.getItem("notif_dismissed")) return
    const t = setTimeout(() => setShowNotifModal(true), 2000)
    return () => clearTimeout(t)
  }, [user, pushStatus])

  useEffect(() => {
    if (!user) return
    // Charger le profil initial via RPC (credits + is_admin protégés)
    fetchProfile()
    // Écouter les changements en temps réel
    const channel = supabase.channel("profile-" + user.id)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: "id=eq." + user.id },
        () => fetchProfile())
      .subscribe()
    return () => channel.unsubscribe()
  }, [user, fetchProfile])

  // Active bettors: Realtime + 30s polling
  useEffect(() => {
    if (!user) return
    const ch = supabase.channel("app-bettors")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bets" }, fetchActiveBettors)
      .subscribe()
    const iv = setInterval(fetchActiveBettors, 30000)
    return () => { supabase.removeChannel(ch); clearInterval(iv) }
  }, [user, fetchActiveBettors])

  async function handleSubmit() {
    setLoading(true); setError("")
    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      if (data.user) await supabase.from("profiles").insert({ id: data.user.id, username, credits: 500, xp: 0 })
    }
    setLoading(false)
  }

  function handleNotifAllow() {
    setShowNotifModal(false)
    requestPermission()
  }
  function handleNotifDismiss() {
    setShowNotifModal(false)
    localStorage.setItem("notif_dismissed", "1")
  }

  async function handleCalculatePoints() {
    const { data, error } = await supabase.functions.invoke("calculate-points")
    if (error) alert("Erreur : " + error.message)
    else {
      alert(`✅ ${data.matchesProcessed} matchs traités, ${data.usersUpdated} joueurs mis à jour`)
      if (user) fetchProfile()
    }
  }

  function onBalanceChange(delta) {
    if (typeof delta === "number") setCredits(c => Math.max(0, (c ?? 0) - delta))
    if (user) fetchProfile()
  }

  async function refreshProfile() {
    fetchProfile()
  }

  if (authLoading) return (
    <div style={{ background: C.bg, minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <img src="/icon.png" width="40" height="40" style={{ borderRadius: "8px" }} />
    </div>
  )

  if (user) return (
    <div style={{ background: C.bg, minHeight: "100dvh", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${C.primary} 0%, ${C.primaryDark} 100%)`,
        padding: "12px 16px 10px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        position: "sticky", top: 0, zIndex: 20,
        boxShadow: "0 2px 20px rgba(0,0,0,0.4)",
      }}>
        {/* Left: logo + title + username + bettors */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src="/icon.png" width="36" height="36" style={{ borderRadius: "8px" }} />
          <div>
            <div style={{ fontWeight: "800", fontSize: "15px", color: "white", letterSpacing: "-0.3px" }}>
              Kick off
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "2px", flexWrap: "wrap" }}>
              {username && (
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.9)", fontWeight: "600" }}>
                  👤 {username}
                </span>
              )}
              {activeBettors !== null && activeBettors > 0 && (
                <span style={{
                  fontSize: "10px", fontWeight: "600", color: "rgba(255,255,255,0.85)",
                  background: "rgba(255,255,255,0.12)", borderRadius: "10px",
                  padding: "1px 7px",
                }}>
                  👥 {activeBettors} parieur{activeBettors > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: crédits + XP + profil */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "5px" }}>
          {isAdmin && (
            <button onClick={handleCalculatePoints} style={{
              padding: "3px 8px", borderRadius: "20px", cursor: "pointer",
              fontSize: "10px", fontWeight: "600", border: "1px solid rgba(255,255,255,0.3)",
              background: "rgba(255,255,255,0.15)", color: "white",
            }}>⚙️ Pts</button>
          )}
          {pushStatus === "denied" && (
            <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)" }}>🔕</span>
          )}
          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            <span style={{
              fontSize: "11px", fontWeight: "700", color: "white",
              background: "rgba(255,255,255,0.18)", borderRadius: "8px",
              padding: "2px 8px",
            }}>
              💰 {credits != null ? credits.toLocaleString("fr-FR") : "…"}
            </span>
            <span style={{
              fontSize: "11px", fontWeight: "700", color: "white",
              background: "rgba(255,255,255,0.13)", borderRadius: "8px",
              padding: "2px 8px",
            }}>
              ⭐ {xp.toLocaleString("fr-FR")}
            </span>
            <button onClick={() => setShowProfile(true)} style={{
              width: "32px", height: "32px", borderRadius: "50%", cursor: "pointer",
              border: "2px solid rgba(255,255,255,0.4)",
              background: "rgba(255,255,255,0.15)", color: "white",
              fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>👤</button>
          </div>
        </div>
      </div>

      {/* Notification permission modal */}
      {showNotifModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "flex-end", justifyContent: "center",
        }} onClick={handleNotifDismiss}>
          <div onClick={e => e.stopPropagation()} style={{
            background: C.card, borderRadius: "20px 20px 0 0",
            padding: "28px 24px 36px",
            width: "100%", maxWidth: "480px",
            border: `1px solid ${C.border}`,
            boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
          }}>
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <div style={{ fontSize: "48px", marginBottom: "12px" }}>🔔</div>
              <div style={{ fontSize: "18px", fontWeight: "800", color: C.text, marginBottom: "8px" }}>
                Activer les notifications
              </div>
              <div style={{ fontSize: "14px", color: C.muted, lineHeight: "1.5" }}>
                Sois alerté dès qu'un match se termine et que tes paris sont traités.
                Tu sauras immédiatement si tu as gagné ou perdu.
              </div>
            </div>
            <button onClick={handleNotifAllow} style={{
              width: "100%", padding: "14px",
              background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
              border: "none", borderRadius: "14px",
              color: "white", fontSize: "15px", fontWeight: "700",
              cursor: "pointer", marginBottom: "10px",
              boxShadow: "0 4px 16px rgba(29,158,117,0.35)",
            }}>
              Activer les notifications
            </button>
            <button onClick={handleNotifDismiss} style={{
              width: "100%", padding: "12px",
              background: "transparent", border: `1px solid ${C.border}`,
              borderRadius: "14px", color: C.muted,
              fontSize: "14px", fontWeight: "600", cursor: "pointer",
            }}>
              Plus tard
            </button>
          </div>
        </div>
      )}

      {/* Profile panel */}
      {showProfile && (
        <Profile
          user={user} username={username}
          credits={credits} xp={xp}
          onClose={() => setShowProfile(false)}
        />
      )}

      {/* Content */}
      <div style={{ flex: 1, paddingBottom: "80px", overflowY: "auto" }}>
        {page === "matches"  && <Matches  user={user} credits={credits} onBalanceChange={refreshProfile} onBetPlaced={refreshProfile} />}
        {page === "combined" && <Combined user={user} credits={credits} onBalanceChange={onBalanceChange} />}
        {page === "ranking"  && <Ranking  user={user} xp={xp} onNavigate={setPage} />}
        {page === "league"   && <League   user={user} />}
        {page === "mybets"   && <MyBets   user={user} />}
      </div>

      {/* Bottom nav — style Parions Sport */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 20,
        background: "#0D1924", borderTop: "1px solid #1a2a3a",
        display: "flex", height: "64px",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}>
        {[
          { id: "matches",  icon: "🏠", label: "Matchs"     },
          { id: "combined", icon: "🔗", label: "Combiné"    },
          { id: "ranking",  icon: "📊", label: "Classement" },
          { id: "mybets",   icon: "🎟️", label: "Mes Paris"  },
          { id: "league",   icon: "👥", label: "Ma Ligue"   },
        ].map(tab => {
          const active = page === tab.id
          return (
            <button key={tab.id} onClick={() => setPage(tab.id)} style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: "2px",
              border: "none", background: "none", cursor: "pointer",
              color: active ? "#FF6400" : "#5a7a8a",
              transition: "color 0.15s",
              position: "relative",
            }}>
              {active && (
                <div style={{
                  position: "absolute", top: 0, left: "20%", right: "20%",
                  height: "2px", background: "#FF6400", borderRadius: "0 0 3px 3px",
                }} />
              )}
              <span style={{ fontSize: "20px", filter: active ? "drop-shadow(0 0 4px rgba(255,100,0,0.5))" : "none" }}>
                {tab.icon}
              </span>
              <span style={{ fontSize: "10px", fontWeight: active ? "700" : "500", letterSpacing: "0.2px" }}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )

  /* Auth screen */
  return (
    <div style={{
      background: C.bg, minHeight: "100dvh",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "2rem 1.5rem",
    }}>
      <div style={{ width: "100%", maxWidth: "400px" }}>

        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <img src="/icon.png" width="72" height="72" style={{ borderRadius: "20px", margin: "0 auto 16px", display: "block" }} />
          <h1 style={{ fontSize: "24px", fontWeight: "800", color: C.text, letterSpacing: "-0.5px" }}>Kick off</h1>
          <p style={{ fontSize: "14px", color: C.muted, marginTop: "6px" }}>Pronostics football</p>
        </div>

        <div style={{
          background: C.card, borderRadius: "20px", padding: "24px",
          border: `1px solid ${C.border}`,
        }}>
          <div style={{ display: "flex", background: "#0F1923", borderRadius: "10px", padding: "4px", marginBottom: "20px" }}>
            {["Connexion", "Inscription"].map((label, i) => (
              <button key={i} onClick={() => { setIsLogin(i === 0); setError("") }} style={{
                flex: 1, padding: "8px", borderRadius: "8px", border: "none", cursor: "pointer",
                fontSize: "13px", fontWeight: "600", transition: "all 0.2s",
                background: isLogin === (i === 0) ? C.primary : "none",
                color: isLogin === (i === 0) ? "white" : C.muted,
              }}>{label}</button>
            ))}
          </div>

          {!isLogin && (
            <input placeholder="Pseudo" value={username}
              onChange={e => setUsername(e.target.value)} style={inp} />
          )}
          <input placeholder="Email" value={email} type="email"
            onChange={e => setEmail(e.target.value)} style={inp} />
          <div style={{ position: "relative", marginBottom: error ? "8px" : "16px" }}>
            <input placeholder="Mot de passe" type={showPassword ? "text" : "password"} value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ ...inp, marginBottom: 0, paddingRight: "44px" }} />
            <button type="button" onClick={() => setShowPassword(v => !v)} style={{
              position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer", fontSize: "16px",
              color: "#64748b", padding: "4px",
            }}>{showPassword ? "🙈" : "👁"}</button>
          </div>

          {error && <p style={{ color: "#f87171", fontSize: "13px", marginBottom: "12px" }}>{error}</p>}

          <button onClick={handleSubmit} disabled={loading} style={{
            width: "100%", padding: "14px", borderRadius: "12px", border: "none",
            background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
            color: "white", fontSize: "15px", fontWeight: "700", cursor: "pointer",
            opacity: loading ? 0.7 : 1,
            boxShadow: "0 4px 16px rgba(29,158,117,0.3)",
          }}>
            {loading ? "Chargement..." : isLogin ? "Se connecter" : "Créer mon compte"}
          </button>
        </div>
      </div>
    </div>
  )
}
