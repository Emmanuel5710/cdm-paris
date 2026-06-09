import { useState, useEffect, useCallback } from "react"
import { supabase } from "./supabase"
import Matches from "./pages/Matches"
import Ranking from "./pages/Ranking"
import League from "./pages/League"
import Combined from "./pages/Combined"
import Shop from "./pages/Shop"
import MyBets from "./pages/MyBets"
import Profile from "./pages/Profile"
import { importMatches } from "./importMatches"

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
  const [credits, setCredits] = useState(0)
  const [xp, setXp] = useState(0)
  const [activeBettors, setActiveBettors] = useState(null)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [username, setUsername] = useState("")
  const [isLogin, setIsLogin] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [showProfile, setShowProfile] = useState(false)

  const fetchProfile = useCallback(async (uid) => {
    const { data } = await supabase
      .from("profiles").select("credits, xp, username").eq("id", uid).single()
    if (data) {
      setCredits(data.credits ?? 500)
      setXp(data.xp ?? 0)
      setUsername(data.username ?? "")
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
      if (u) fetchActiveBettors()
      setAuthLoading(false)
    })
    supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) fetchActiveBettors()
      else { setCredits(0); setXp(0); setUsername(""); setActiveBettors(null) }
    })
    importMatches()
  }, [fetchActiveBettors])

  useEffect(() => {
    if (!user) return
    // Charger le profil initial
    supabase.from("profiles").select("credits, xp, username").eq("id", user.id).single()
      .then(({ data }) => { if (data) { setCredits(data.credits); setXp(data.xp); setUsername(data.username ?? "") } })
    // Écouter les changements en temps réel
    const channel = supabase.channel("profile-" + user.id)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: "id=eq." + user.id },
        (payload) => { setCredits(payload.new.credits); setXp(payload.new.xp) })
      .subscribe()
    return () => channel.unsubscribe()
  }, [user])

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

  async function handleCalculatePoints() {
    const { data, error } = await supabase.functions.invoke("calculate-points")
    if (error) alert("Erreur : " + error.message)
    else {
      alert(`✅ ${data.matchesProcessed} matchs traités, ${data.usersUpdated} joueurs mis à jour`)
      if (user) fetchProfile(user.id)
    }
  }

  function onBalanceChange() {
    if (user) fetchProfile(user.id)
  }

  async function refreshProfile() {
    const { data } = await supabase
      .from("profiles")
      .select("credits, xp")
      .eq("id", user.id)
      .single()
    if (data) {
      setCredits(data.credits)
      setXp(data.xp)
    }
  }

  if (authLoading) return (
    <div style={{ background: C.bg, minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontSize: "32px" }}>⚽</span>
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
          <span style={{ fontSize: "22px" }}>⚽</span>
          <div>
            <div style={{ fontWeight: "800", fontSize: "15px", color: "white", letterSpacing: "-0.3px" }}>
              CdM Paris 2026
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
          {user.email === "emmanuelfayard57@gmail.com" && (
            <button onClick={handleCalculatePoints} style={{
              padding: "3px 8px", borderRadius: "20px", cursor: "pointer",
              fontSize: "10px", fontWeight: "600", border: "1px solid rgba(255,255,255,0.3)",
              background: "rgba(255,255,255,0.15)", color: "white",
            }}>⚙️ Pts</button>
          )}
          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            <span style={{
              fontSize: "11px", fontWeight: "700", color: "white",
              background: "rgba(255,255,255,0.18)", borderRadius: "8px",
              padding: "2px 8px",
            }}>
              💰 {(credits ?? 0).toLocaleString("fr-FR")}
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
        {page === "shop"     && <Shop     user={user} credits={credits} onBalanceChange={onBalanceChange} />}
        {page === "mybets"   && <MyBets   user={user} />}
      </div>

      {/* Bottom nav */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 20,
        background: C.card, borderTop: `1px solid ${C.border}`,
        display: "flex", height: "64px",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}>
        {[
          { id: "matches",  icon: "🏠", label: "Matchs"     },
          { id: "combined", icon: "⚡", label: "Combiné"    },
          { id: "ranking",  icon: "🏆", label: "Classement" },
          { id: "mybets",   icon: "🎫", label: "Mes Paris"  },
          { id: "league",   icon: "🛡️", label: "Ma Ligue"   },
          { id: "shop",     icon: "💳", label: "Boutique"   },
        ].map(tab => (
          <button key={tab.id} onClick={() => setPage(tab.id)} style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: "3px",
            border: "none", background: "none", cursor: "pointer",
            color: page === tab.id ? C.primary : C.dim,
            transition: "color 0.2s",
          }}>
            <span style={{ fontSize: "18px" }}>{tab.icon}</span>
            <span style={{ fontSize: "10px", fontWeight: page === tab.id ? "700" : "400" }}>{tab.label}</span>
          </button>
        ))}
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
          <div style={{
            width: "72px", height: "72px", borderRadius: "20px", margin: "0 auto 16px",
            background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "36px",
            boxShadow: "0 8px 32px rgba(29,158,117,0.4)",
          }}>⚽</div>
          <h1 style={{ fontSize: "24px", fontWeight: "800", color: C.text, letterSpacing: "-0.5px" }}>CdM Paris 2026</h1>
          <p style={{ fontSize: "14px", color: C.muted, marginTop: "6px" }}>Pronostics Coupe du Monde</p>
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
