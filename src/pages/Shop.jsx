import { useState, useEffect } from "react"
import { supabase } from "../supabase"

const C = {
  bg: "#0F1923", card: "#1A2634", border: "#243447",
  primary: "#1D9E75", primaryGlow: "rgba(29,158,117,0.15)",
  text: "#f1f5f9", muted: "#94a3b8", dim: "#64748b",
}

const DAILY_LIMIT = 100

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function Shop({ user, balance, onBalanceChange }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [buying, setBuying] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => { fetchProfile() }, [])

  async function fetchProfile() {
    const { data } = await supabase
      .from("profiles")
      .select("balance, last_purchase_date, daily_purchased")
      .eq("id", user.id).single()
    setProfile(data)
    setLoading(false)
  }

  function getDailyPurchased() {
    if (!profile) return 0
    const t = today()
    if (!profile.last_purchase_date || profile.last_purchase_date < t) return 0
    return profile.daily_purchased ?? 0
  }

  const dailyPurchased = getDailyPurchased()
  const canPurchase = dailyPurchased < DAILY_LIMIT

  async function handleBuy() {
    if (!canPurchase || buying) return
    setBuying(true)
    setMessage("")

    const t = today()
    const isNewDay = !profile.last_purchase_date || profile.last_purchase_date < t
    const newDailyPurchased = (isNewDay ? 0 : (profile.daily_purchased ?? 0)) + 100

    const { error: balErr } = await supabase.rpc("adjust_balance", { uid: user.id, delta: 100 })
    if (balErr) {
      setMessage("Erreur lors de l'achat. Réessaie.")
      setBuying(false)
      return
    }

    await supabase.from("profiles").update({
      last_purchase_date: t,
      daily_purchased: newDailyPurchased,
    }).eq("id", user.id)

    setProfile(p => ({ ...p, last_purchase_date: t, daily_purchased: newDailyPurchased }))
    setMessage("✓ +100 points crédités sur ton solde !")
    onBalanceChange?.()
    setBuying(false)
  }

  if (loading) return (
    <div style={{ padding: "3rem", textAlign: "center", color: C.muted }}>
      <div style={{ fontSize: "32px", marginBottom: "12px" }}>🛍️</div>
      Chargement...
    </div>
  )

  return (
    <div style={{ padding: "16px", maxWidth: "480px", margin: "0 auto" }}>

      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, rgba(29,158,117,0.2), rgba(29,158,117,0.05))`,
        border: `1px solid rgba(29,158,117,0.3)`,
        borderRadius: "16px", padding: "18px 20px", marginBottom: "20px",
      }}>
        <div style={{ fontSize: "18px", fontWeight: "800", color: C.text }}>🛍️ Boutique</div>
        <div style={{ fontSize: "13px", color: C.muted, marginTop: "4px" }}>
          Solde actuel :{" "}
          <strong style={{ color: C.primary }}>{(balance ?? 0).toLocaleString("fr-FR")} pts</strong>
        </div>
      </div>

      {/* Offer card */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: "16px", padding: "28px 24px",
        textAlign: "center",
      }}>
        <div style={{ fontSize: "52px", marginBottom: "12px" }}>🪙</div>
        <div style={{ fontSize: "26px", fontWeight: "800", color: C.text, marginBottom: "6px" }}>
          +100 points
        </div>
        <div style={{
          display: "inline-block", fontSize: "12px", color: C.primary, fontWeight: "700",
          background: C.primaryGlow, border: `1px solid ${C.primary}33`,
          borderRadius: "20px", padding: "3px 12px", marginBottom: "6px",
        }}>
          Gratuit pendant la bêta
        </div>
        <div style={{ fontSize: "11px", color: C.dim, marginBottom: "24px" }}>
          Limite : {DAILY_LIMIT} pts achetables par jour
        </div>

        {canPurchase ? (
          <button onClick={handleBuy} disabled={buying} style={{
            width: "100%", padding: "14px", borderRadius: "12px", border: "none",
            background: buying ? C.border : `linear-gradient(135deg, ${C.primary}, #166d52)`,
            color: buying ? C.dim : "white",
            fontSize: "15px", fontWeight: "700",
            cursor: buying ? "not-allowed" : "pointer",
            boxShadow: buying ? "none" : "0 4px 16px rgba(29,158,117,0.35)",
            transition: "all 0.2s",
          }}>
            {buying ? "Traitement..." : "Acheter 100 points"}
          </button>
        ) : (
          <div style={{
            padding: "14px", borderRadius: "12px",
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
            color: "#f87171", fontSize: "13px", fontWeight: "600",
          }}>
            Limite journalière atteinte — reviens demain
          </div>
        )}

        {message && (
          <div style={{
            marginTop: "14px", padding: "10px 14px", borderRadius: "10px",
            background: message.startsWith("✓")
              ? "rgba(29,158,117,0.1)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${message.startsWith("✓")
              ? "rgba(29,158,117,0.3)" : "rgba(239,68,68,0.25)"}`,
            color: message.startsWith("✓") ? C.primary : "#f87171",
            fontSize: "13px", fontWeight: "600",
          }}>
            {message}
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{
        marginTop: "16px", padding: "16px",
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: "12px",
      }}>
        <div style={{ fontSize: "11px", color: C.dim, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>
          Comment ça marche ?
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[
            "100 points gratuits disponibles chaque jour",
            "Utilise tes points pour parier sur les matchs",
            "Le solde minimum est de 50 pts — impossible de descendre en dessous",
            "En cas de solde faible, reviens ici pour recharger",
          ].map((text, i) => (
            <div key={i} style={{ display: "flex", gap: "8px", fontSize: "12px", color: C.muted }}>
              <span style={{ color: C.primary, flexShrink: 0, fontWeight: "700" }}>·</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
