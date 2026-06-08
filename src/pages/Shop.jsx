import { useState, useEffect } from "react"
import { supabase } from "../supabase"

const C = {
  bg: "#0F1923", card: "#1A2634", border: "#243447",
  primary: "#1D9E75", primaryGlow: "rgba(29,158,117,0.15)",
  text: "#f1f5f9", muted: "#94a3b8", dim: "#64748b",
  inner: "#0d1720",
}

const DAILY_LIMIT = 100

const PACKS = [
  { id: "starter", amount: 20,  price: "0,99 €" },
  { id: "pro",     amount: 50,  price: "1,99 €" },
  { id: "max",     amount: 100, price: "2,99 €" },
]

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function Shop({ user, credits, onBalanceChange }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [buying, setBuying] = useState(null)  // pack id currently being purchased
  const [message, setMessage] = useState("")

  useEffect(() => { fetchProfile() }, [])

  async function fetchProfile() {
    const { data } = await supabase
      .from("profiles")
      .select("credits, last_purchase_date, daily_purchased")
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
  const remaining = DAILY_LIMIT - dailyPurchased

  async function handleBuy(pack) {
    if (pack.amount > remaining || buying) return
    setBuying(pack.id)
    setMessage("")

    const t = today()
    const isNewDay = !profile.last_purchase_date || profile.last_purchase_date < t
    const base = isNewDay ? 0 : (profile.daily_purchased ?? 0)
    const newDailyPurchased = base + pack.amount

    const { error: balErr } = await supabase.rpc("adjust_credits", { uid: user.id, delta: pack.amount })
    if (balErr) {
      setMessage("Erreur lors de l'achat. Réessaie.")
      setBuying(null)
      return
    }

    await supabase.from("profiles").update({
      last_purchase_date: t,
      daily_purchased: newDailyPurchased,
    }).eq("id", user.id)

    setProfile(p => ({ ...p, last_purchase_date: t, daily_purchased: newDailyPurchased }))
    setMessage(`✓ +${pack.amount} points crédités sur ton solde !`)
    onBalanceChange?.()
    setBuying(null)
  }

  if (loading) return (
    <div style={{ padding: "3rem", textAlign: "center", color: C.muted }}>
      <div style={{ fontSize: "32px", marginBottom: "12px" }}>🛍️</div>
      Chargement...
    </div>
  )

  const limitReached = remaining <= 0

  return (
    <div style={{ padding: "16px", maxWidth: "480px", margin: "0 auto" }}>

      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, rgba(29,158,117,0.2), rgba(29,158,117,0.05))`,
        border: `1px solid rgba(29,158,117,0.3)`,
        borderRadius: "16px", padding: "18px 20px", marginBottom: "16px",
      }}>
        <div style={{ fontSize: "18px", fontWeight: "800", color: C.text }}>🛍️ Boutique</div>
        <div style={{ fontSize: "13px", color: C.muted, marginTop: "4px" }}>
          Solde actuel :{" "}
          <strong style={{ color: C.primary }}>{(credits ?? 0).toLocaleString("fr-FR")} crédits</strong>
        </div>
      </div>

      {/* Daily quota banner */}
      <div style={{
        background: limitReached ? "rgba(239,68,68,0.08)" : C.card,
        border: `1px solid ${limitReached ? "rgba(239,68,68,0.25)" : C.border}`,
        borderRadius: "12px", padding: "12px 16px", marginBottom: "16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: "12px", color: C.dim, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Quota journalier
          </div>
          <div style={{ fontSize: "13px", marginTop: "3px", fontWeight: "600", color: limitReached ? "#f87171" : C.text }}>
            {limitReached
              ? "Limite atteinte — reviens demain"
              : `Il te reste ${remaining} point${remaining > 1 ? "s" : ""} à acheter aujourd'hui`
            }
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: "22px", fontWeight: "800", color: limitReached ? "#f87171" : C.primary }}>
            {dailyPurchased}
          </div>
          <div style={{ fontSize: "10px", color: C.dim }}>/ {DAILY_LIMIT} pts</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: "6px", background: C.border, borderRadius: "3px", marginBottom: "20px", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${Math.min(100, (dailyPurchased / DAILY_LIMIT) * 100)}%`,
          background: limitReached
            ? "linear-gradient(90deg, #ef4444, #f87171)"
            : `linear-gradient(90deg, ${C.primary}, #3ecf98)`,
          borderRadius: "3px", transition: "width 0.4s ease",
        }} />
      </div>

      {/* Pack cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
        {PACKS.map(pack => {
          const canBuy = pack.amount <= remaining && !buying
          const isLoading = buying === pack.id
          return (
            <div key={pack.id} style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: "14px", padding: "18px 20px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              opacity: !canBuy && !isLoading ? 0.45 : 1,
              transition: "opacity 0.2s",
            }}>
              <div>
                <div style={{ fontSize: "22px", fontWeight: "800", color: C.text, letterSpacing: "-0.5px" }}>
                  {pack.amount} <span style={{ fontSize: "14px", fontWeight: "600", color: C.muted }}>points</span>
                </div>
                <div style={{ fontSize: "14px", fontWeight: "500", color: C.muted, marginTop: "2px" }}>
                  {pack.price}
                </div>
              </div>
              <button
                onClick={() => canBuy && handleBuy(pack)}
                disabled={!canBuy || isLoading}
                style={{
                  padding: "10px 22px", borderRadius: "30px", border: "none", flexShrink: 0,
                  background: canBuy
                    ? `linear-gradient(135deg, ${C.primary}, #166d52)` : C.inner,
                  color: canBuy ? "white" : C.dim,
                  fontSize: "13px", fontWeight: "700",
                  cursor: canBuy ? "pointer" : "not-allowed",
                  boxShadow: canBuy ? "0 3px 12px rgba(29,158,117,0.3)" : "none",
                  transition: "all 0.2s",
                  minWidth: "80px",
                }}>
                {isLoading ? "..." : "Acheter"}
              </button>
            </div>
          )
        })}
      </div>

      {/* Feedback message */}
      {message && (
        <div style={{
          padding: "12px 16px", borderRadius: "10px", marginBottom: "16px",
          background: message.startsWith("✓") ? "rgba(29,158,117,0.1)" : "rgba(239,68,68,0.08)",
          border: `1px solid ${message.startsWith("✓") ? "rgba(29,158,117,0.3)" : "rgba(239,68,68,0.25)"}`,
          color: message.startsWith("✓") ? C.primary : "#f87171",
          fontSize: "13px", fontWeight: "600",
        }}>
          {message}
        </div>
      )}

      {/* Info */}
      <div style={{
        padding: "14px 16px",
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: "12px",
      }}>
        <div style={{ fontSize: "11px", color: C.dim, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>
          Comment ça marche ?
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
          {[
            `Maximum ${DAILY_LIMIT} pts achetables par jour, peu importe le pack choisi`,
            "Exemple : Pack Pro (50) + Pack Pro (50) = limite atteinte",
            "Exemple : Pack Starter (20) + Pack Pro (50) = 30 pts restants",
            "Le solde minimum est de 50 pts — impossible de descendre en dessous",
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
