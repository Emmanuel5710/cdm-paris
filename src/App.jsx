import { useState, useEffect } from "react"
import { supabase } from "./supabase"
import Matches from "./pages/Matches"
import League from "./pages/League"
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
  const [page, setPage] = useState("matches")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [username, setUsername] = useState("")
  const [isLogin, setIsLogin] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null))
    supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null))
    importMatches()
  }, [])

  async function handleSubmit() {
    setLoading(true); setError("")
    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      if (data.user) await supabase.from("profiles").insert({ id: data.user.id, username })
    }
    setLoading(false)
  }

  async function handleCalculatePoints() {
    const { data, error } = await supabase.functions.invoke("calculate-points")
    if (error) alert("Erreur : " + error.message)
    else alert(`✅ ${data.matchesProcessed} matchs traités, ${data.usersUpdated} joueurs mis à jour`)
  }

  if (user) return (
    <div style={{ background: C.bg, minHeight: "100dvh", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${C.primary} 0%, ${C.primaryDark} 100%)`,
        padding: "16px 20px 14px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        position: "sticky", top: 0, zIndex: 20,
        boxShadow: "0 2px 20px rgba(0,0,0,0.4)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "24px" }}>⚽</span>
          <div>
            <div style={{ fontWeight: "800", fontSize: "16px", color: "white", letterSpacing: "-0.3px" }}>CdM Paris 2026</div>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.7)" }}>Pronostics</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {user.email === "emmanuelfayard57@gmail.com" && (
            <button onClick={handleCalculatePoints} style={{
              padding: "6px 12px", borderRadius: "20px", cursor: "pointer",
              fontSize: "11px", fontWeight: "600", border: "1px solid rgba(255,255,255,0.3)",
              background: "rgba(255,255,255,0.15)", color: "white",
            }}>⚙️ Pts</button>
          )}
          <button onClick={() => supabase.auth.signOut()} style={{
            padding: "6px 14px", borderRadius: "20px", cursor: "pointer",
            fontSize: "12px", fontWeight: "500", border: "1px solid rgba(255,255,255,0.3)",
            background: "rgba(255,255,255,0.1)", color: "white",
          }}>Quitter</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingBottom: "80px", overflowY: "auto" }}>
        {page === "matches" ? <Matches user={user} /> : <League user={user} />}
      </div>

      {/* Bottom nav */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 20,
        background: C.card, borderTop: `1px solid ${C.border}`,
        display: "flex", height: "64px",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}>
        {[
          { id: "matches", icon: "⚽", label: "Matchs" },
          { id: "league",  icon: "🏆", label: "Ma Ligue" },
        ].map(tab => (
          <button key={tab.id} onClick={() => setPage(tab.id)} style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: "3px",
            border: "none", background: "none", cursor: "pointer",
            color: page === tab.id ? C.primary : C.dim,
            transition: "color 0.2s",
          }}>
            <span style={{ fontSize: "20px" }}>{tab.icon}</span>
            <span style={{
              fontSize: "11px", fontWeight: page === tab.id ? "600" : "400",
            }}>{tab.label}</span>
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

        {/* Logo */}
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

        {/* Form */}
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
          <input placeholder="Mot de passe" type="password" value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ ...inp, marginBottom: error ? "8px" : "16px" }} />

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
