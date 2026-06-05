import { useState, useEffect } from "react"
import { supabase } from "./supabase"
import Matches from "./pages/Matches"
import League from "./pages/League"
import { importMatches } from "./importMatches"

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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })
    supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    importMatches()
  }, [])

  async function handleSubmit() {
    setLoading(true)
    setError("")
    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      if (data.user) {
        await supabase.from("profiles").insert({ id: data.user.id, username })
      }
    }
    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  async function handleCalculatePoints() {
    const { data, error } = await supabase.functions.invoke("calculate-points")
    if (error) alert("Erreur : " + error.message)
    else alert(`✅ ${data.matchesProcessed} matchs traités, ${data.usersUpdated} joueurs mis à jour`)
  }

  if (user) return (
    <div>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "1rem 1.5rem", borderBottom: "1px solid #e0e0e0",
        background: "white", position: "sticky", top: 0, zIndex: 10
      }}>
        <span style={{ fontWeight: "bold", fontSize: "18px" }}>⚽ CdM Paris</span>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {user.email === "emmanuelfayard57@gmail.com" && (
            <button onClick={handleCalculatePoints} style={{
              padding: "6px 12px", border: "1px solid #f5c842",
              borderRadius: "20px", cursor: "pointer", fontSize: "12px",
              background: "#fffbf0", color: "#b8860b"
            }}>
              ⚙️ Calc. points
            </button>
          )}
          <button onClick={handleLogout} style={{
            padding: "6px 14px", border: "1px solid #e0e0e0",
            borderRadius: "20px", cursor: "pointer", fontSize: "13px", background: "white"
          }}>
            Déconnexion
          </button>
        </div>
      </div>

      <div style={{
        display: "flex", borderBottom: "1px solid #e0e0e0",
        background: "white", position: "sticky", top: "57px", zIndex: 9
      }}>
        {[
          { id: "matches", label: "⚽ Matchs" },
          { id: "league", label: "🏆 Ma Ligue" },
        ].map(tab => (
          <button key={tab.id} onClick={() => setPage(tab.id)} style={{
            flex: 1, padding: "12px", border: "none", background: "none",
            cursor: "pointer", fontSize: "14px", fontWeight: page === tab.id ? "600" : "400",
            color: page === tab.id ? "#1D9E75" : "#888",
            borderBottom: `2px solid ${page === tab.id ? "#1D9E75" : "transparent"}`,
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {page === "matches" ? <Matches user={user} /> : <League user={user} />}
    </div>
  )

  return (
    <div style={{ padding: "2rem", maxWidth: "400px", margin: "0 auto", fontFamily: "sans-serif" }}>
      <h2 style={{ textAlign: "center", marginBottom: "2rem" }}>
        ⚽ CdM Paris 2026
      </h2>
      {!isLogin && (
        <input placeholder="Pseudo" value={username}
          onChange={e => setUsername(e.target.value)}
          style={{ display: "block", width: "100%", marginBottom: "1rem", padding: "10px", borderRadius: "8px", border: "1px solid #e0e0e0", fontSize: "14px" }}
        />
      )}
      <input placeholder="Email" value={email}
        onChange={e => setEmail(e.target.value)}
        style={{ display: "block", width: "100%", marginBottom: "1rem", padding: "10px", borderRadius: "8px", border: "1px solid #e0e0e0", fontSize: "14px" }}
      />
      <input placeholder="Mot de passe" type="password" value={password}
        onChange={e => setPassword(e.target.value)}
        style={{ display: "block", width: "100%", marginBottom: "1rem", padding: "10px", borderRadius: "8px", border: "1px solid #e0e0e0", fontSize: "14px" }}
      />
      {error && <p style={{ color: "red", fontSize: "13px" }}>{error}</p>}
      <button onClick={handleSubmit} disabled={loading}
        style={{ width: "100%", padding: "12px", background: "#1D9E75", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "15px", fontWeight: "500" }}>
        {loading ? "Chargement..." : isLogin ? "Se connecter" : "S'inscrire"}
      </button>
      <p style={{ marginTop: "1rem", textAlign: "center", cursor: "pointer", color: "#1D9E75", fontSize: "14px" }}
        onClick={() => setIsLogin(!isLogin)}>
        {isLogin ? "Pas de compte ? S'inscrire" : "Déjà un compte ? Se connecter"}
      </p>
    </div>
  )
}