import { useState, useEffect, useRef } from "react"
import { supabase } from "../supabase"

const ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=200&dates=20260611-20260719"
const C = {
  bg: "#0F1923", card: "#1A2634", border: "#243447",
  primary: "#1D9E75", primaryGlow: "rgba(29,158,117,0.18)",
  text: "#f1f5f9", muted: "#94a3b8", dim: "#64748b",
  inner: "#0d1720",
}

const ADVANCED_TYPES = ["exact_goals", "exact_corners", "red_card_team", "possession_home", "scorer"]

// ─── Utilities ────────────────────────────────────────────────────────────────

function parseMatches(data) {
  return (data.events || []).map(ev => {
    const comp = ev.competitions?.[0]
    const home = comp?.competitors?.find(c => c.homeAway === "home")
    const away = comp?.competitors?.find(c => c.homeAway === "away")
    return {
      id: ev.id,
      state: comp?.status?.type?.state,
      displayClock: comp?.status?.displayClock,
      statusDetail: comp?.status?.type?.shortDetail,
      venue: comp?.venue?.fullName,
      city: comp?.venue?.address?.city,
      home: { name: home?.team?.displayName ?? "", logo: home?.team?.logo ?? "", score: home?.score ?? "0", form: home?.form ?? "" },
      away: { name: away?.team?.displayName ?? "", logo: away?.team?.logo ?? "", score: away?.score ?? "0", form: away?.form ?? "" },
    }
  })
}

function FormDots({ form }) {
  if (!form) return null
  return (
    <div style={{ display: "flex", gap: "3px", marginTop: "4px" }}>
      {form.split("").map((c, i) => (
        <span key={i} style={{
          width: "14px", height: "14px", borderRadius: "50%", fontSize: "7px",
          fontWeight: "700", color: "white", display: "flex", alignItems: "center", justifyContent: "center",
          background: c === "W" ? C.primary : c === "L" ? "#ef4444" : "#334155",
        }}>{c}</span>
      ))}
    </div>
  )
}

// ─── Shared advanced bet card ─────────────────────────────────────────────────

function BetCard({ icon, title, hasBet, children }) {
  return (
    <div style={{
      background: C.inner, borderRadius: "12px", padding: "14px",
      border: `1.5px solid ${hasBet ? C.primary + "55" : C.border}`,
      marginBottom: "8px", transition: "border-color 0.2s",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "11px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <span style={{ fontSize: "15px" }}>{icon}</span>
          <span style={{ fontSize: "11px", color: hasBet ? C.primary : C.muted, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>{title}</span>
        </div>
        {hasBet && (
          <span style={{ fontSize: "9px", background: C.primaryGlow, color: C.primary, borderRadius: "20px", padding: "3px 8px", fontWeight: "700", border: `1px solid ${C.primary}33` }}>
            Parié ✓
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

// ─── Stepper (shared by Goals + Corners) ─────────────────────────────────────

function Stepper({ value, min, max, display, onChange }) {
  const canDec = value != null && value > min
  const canInc = value == null || value < max
  const Btn = ({ enabled, onClick, label }) => (
    <button onClick={onClick} disabled={!enabled} style={{
      width: "40px", height: "40px", borderRadius: "50%",
      border: `1.5px solid ${enabled ? C.primary : C.border}`,
      background: enabled ? C.primaryGlow : "transparent",
      cursor: enabled ? "pointer" : "not-allowed",
      color: enabled ? C.primary : C.dim,
      fontSize: "22px", fontWeight: "500", lineHeight: "1",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0, transition: "all 0.15s",
    }}>{label}</button>
  )
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", justifyContent: "center" }}>
      <Btn enabled={canDec} onClick={() => canDec && onChange(value - 1)} label="−" />
      <div style={{ flex: 1, textAlign: "center", minWidth: "90px" }}>
        <span style={{ fontSize: "28px", fontWeight: "800", color: value != null ? C.text : C.dim, letterSpacing: "-0.5px" }}>
          {value != null ? display(value) : "—"}
        </span>
      </div>
      <Btn enabled={canInc} onClick={() => onChange(value != null ? value + 1 : min)} label="+" />
    </div>
  )
}

// ─── Goals bet ────────────────────────────────────────────────────────────────

function GoalsBet({ saved, onSave }) {
  const val = saved != null ? parseInt(saved) : null
  const fmt = n => n === 1 ? "1 but" : `${n} buts`
  return (
    <BetCard icon="⚽" title="Buts dans le match" hasBet={val != null}>
      <p style={{ fontSize: "12px", color: C.dim, marginBottom: "13px" }}>
        Je parie qu'il y aura exactement{" "}
        <strong style={{ color: val != null ? C.primary : C.muted }}>{val != null ? fmt(val) : "… buts"}</strong>
      </p>
      <Stepper value={val} min={0} max={8} display={fmt} onChange={n => onSave(String(n))} />
    </BetCard>
  )
}

// ─── Corners bet ──────────────────────────────────────────────────────────────

function CornersBet({ saved, onSave }) {
  const val = saved != null ? parseInt(saved) : null
  return (
    <BetCard icon="🚩" title="Corners" hasBet={val != null}>
      <p style={{ fontSize: "12px", color: C.dim, marginBottom: "13px" }}>
        Je parie qu'il y aura plus de{" "}
        <strong style={{ color: val != null ? C.primary : C.muted }}>{val != null ? `${val} corners` : "… corners"}</strong>
      </p>
      <Stepper value={val} min={5} max={15} display={n => `${n}`} onChange={n => onSave(String(n))} />
    </BetCard>
  )
}

// ─── Red card bet ─────────────────────────────────────────────────────────────

function RedCardBet({ saved, onSave, homeName, awayName }) {
  const opts = [
    { value: "none", label: "Aucun", sub: "Pas de carton rouge" },
    { value: "home", label: homeName, sub: "Équipe domicile" },
    { value: "away", label: awayName, sub: "Équipe extérieur" },
    { value: "both", label: "Les deux", sub: "Les deux équipes" },
  ]
  return (
    <BetCard icon="🟥" title="Carton rouge" hasBet={!!saved}>
      <p style={{ fontSize: "12px", color: C.dim, marginBottom: "11px" }}>Quelle équipe prendra un carton rouge ?</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px" }}>
        {opts.map(opt => {
          const sel = saved === opt.value
          return (
            <button key={opt.value} onClick={() => onSave(opt.value)} style={{
              padding: "10px 8px", border: `1.5px solid ${sel ? C.primary : C.border}`,
              borderRadius: "10px", cursor: "pointer",
              background: sel ? C.primaryGlow : "transparent",
              color: sel ? C.primary : C.muted,
              fontSize: "11px", fontWeight: sel ? "700" : "500",
              textAlign: "center", transition: "all 0.15s", minWidth: 0,
            }}>
              <div style={{ fontSize: "11px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                translate="no">{opt.label}</div>
              {opt.sub !== opt.label && (
                <div style={{ fontSize: "10px", color: sel ? C.primary + "bb" : C.dim, marginTop: "2px" }}>{opt.sub}</div>
              )}
            </button>
          )
        })}
      </div>
    </BetCard>
  )
}

// ─── Possession bet ───────────────────────────────────────────────────────────

function PossessionBet({ saved, onSave, homeName, awayName }) {
  const savedNum = saved != null ? parseInt(saved) : null
  const [draft, setDraft] = useState(savedNum ?? 50)

  useEffect(() => { if (savedNum != null) setDraft(savedNum) }, [savedNum])

  const awayPct = 100 - draft
  return (
    <BetCard icon="📊" title="Possession domicile" hasBet={savedNum != null}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "10px" }}>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: "10px", color: C.dim, marginBottom: "2px" }} translate="no">{homeName}</div>
          <div style={{ fontSize: "26px", fontWeight: "800", color: C.primary }}>{draft}%</div>
        </div>
        <div style={{ fontSize: "11px", color: C.dim }}>vs</div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "10px", color: C.dim, marginBottom: "2px" }} translate="no">{awayName}</div>
          <div style={{ fontSize: "26px", fontWeight: "800", color: C.muted }}>{awayPct}%</div>
        </div>
      </div>
      {/* Slider */}
      <div style={{ position: "relative" }}>
        <div style={{
          position: "absolute", top: "50%", left: 0, right: 0, height: "4px",
          transform: "translateY(-50%)", borderRadius: "2px", overflow: "hidden",
          background: `linear-gradient(to right, ${C.primary} ${((draft - 30) / 40) * 100}%, ${C.border} ${((draft - 30) / 40) * 100}%)`,
          pointerEvents: "none",
        }} />
        <input type="range" min={30} max={70} step={5} value={draft}
          onChange={e => setDraft(parseInt(e.target.value))}
          onMouseUp={e => onSave(e.target.value)}
          onTouchEnd={e => onSave(e.target.value)}
          style={{ width: "100%", accentColor: C.primary, cursor: "pointer", position: "relative" }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2px" }}>
        <span style={{ fontSize: "10px", color: C.dim }}>30%</span>
        <span style={{ fontSize: "10px", color: C.dim }}>70%</span>
      </div>
    </BetCard>
  )
}

// ─── Scorer bet ───────────────────────────────────────────────────────────────

function ScorerBet({ saved, onSave }) {
  const [draft, setDraft] = useState(saved ?? "")
  useEffect(() => { setDraft(saved ?? "") }, [saved])

  function commit() { if (draft.trim()) onSave(draft.trim()) }

  const isDirty = draft.trim() !== (saved ?? "") && draft.trim().length > 0

  return (
    <BetCard icon="🎯" title="Buteur du match" hasBet={!!saved}>
      <p style={{ fontSize: "12px", color: C.dim, marginBottom: "10px" }}>
        Je parie que ce joueur marquera
      </p>
      <div style={{ display: "flex", gap: "8px" }}>
        <input type="text" value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") { commit(); e.target.blur() } }}
          placeholder="Nom du joueur..."
          style={{
            flex: 1, background: "#1a2634", border: `1.5px solid ${draft ? C.primary : C.border}`,
            borderRadius: "9px", padding: "10px 13px", color: C.text, fontSize: "13px",
            outline: "none", transition: "border-color 0.15s",
            fontFamily: "inherit",
          }}
        />
        {isDirty && (
          <button onClick={commit} style={{
            padding: "10px 16px", background: C.primaryGlow, border: `1.5px solid ${C.primary}`,
            borderRadius: "9px", color: C.primary, fontSize: "14px", fontWeight: "700",
            cursor: "pointer", flexShrink: 0,
          }}>✓</button>
        )}
      </div>
    </BetCard>
  )
}

// ─── Locked advanced bets summary ────────────────────────────────────────────

function LockedAdvancedSummary({ bets, matchId, homeName, awayName }) {
  const g = key => bets[`${matchId}-${key}`]
  const goals = g("exact_goals")
  const corners = g("exact_corners")
  const redCard = g("red_card_team")
  const possession = g("possession_home")
  const scorer = g("scorer")

  const redCardLabel = { none: "Aucun carton rouge", home: homeName, away: awayName, both: "Les deux équipes" }

  const items = [
    goals != null && { icon: "⚽", text: `Exactement ${goals == "1" ? "1 but" : `${goals} buts`}` },
    corners != null && { icon: "🚩", text: `Plus de ${corners} corners` },
    redCard && { icon: "🟥", text: redCardLabel[redCard] ?? redCard },
    possession != null && { icon: "📊", text: `${homeName} ${possession}% — ${awayName} ${100 - parseInt(possession)}%` },
    scorer && { icon: "🎯", text: scorer },
  ].filter(Boolean)

  if (!items.length) return null

  return (
    <div style={{ marginTop: "8px", borderTop: `1px solid ${C.border}`, paddingTop: "10px" }}>
      <p style={{ fontSize: "10px", color: C.dim, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "700" }}>
        Paris avancés
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            <span style={{ fontSize: "12px" }}>{item.icon}</span>
            <span style={{ fontSize: "12px", color: C.primary, fontWeight: "600" }}>{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Matches({ user }) {
  const [matches, setMatches] = useState([])
  const [bets, setBets] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [expandedAdvanced, setExpandedAdvanced] = useState(new Set())
  const intervalRef = useRef(null)

  useEffect(() => { fetchMatches().finally(() => setLoading(false)) }, [])

  useEffect(() => {
    if (!user) return
    async function loadBets() {
      const { data } = await supabase.from("bets").select("match_id, bet_type, bet_value").eq("user_id", user.id)
      if (data) {
        const map = {}
        data.forEach(b => { map[`${parseInt(b.match_id)}-${b.bet_type}`] = b.bet_value })
        setBets(map)
      }
    }
    loadBets()
  }, [user])

  useEffect(() => {
    clearInterval(intervalRef.current)
    if (matches.some(m => m.state === "in")) {
      intervalRef.current = setInterval(fetchMatches, 60000)
    }
    return () => clearInterval(intervalRef.current)
  }, [matches])

  async function fetchMatches() {
    try {
      const res = await fetch(ESPN_URL)
      setMatches(parseMatches(await res.json()))
      setError("")
    } catch { setError("Impossible de charger les matchs ESPN.") }
  }

  async function placeBet(matchId, betType, betValue) {
    if (!user) return
    const id = parseInt(matchId)
    const { data: existing } = await supabase
      .from("bets").select("id")
      .eq("user_id", user.id).eq("match_id", id).eq("bet_type", betType)
      .maybeSingle()
    if (existing) {
      await supabase.from("bets").update({ bet_value: betValue }).eq("id", existing.id)
    } else {
      await supabase.from("bets").insert({ user_id: user.id, match_id: id, bet_type: betType, bet_value: betValue })
    }
    setBets(prev => ({ ...prev, [`${id}-${betType}`]: betValue }))
  }

  function toggleAdvanced(matchId) {
    setExpandedAdvanced(prev => {
      const next = new Set(prev)
      next.has(matchId) ? next.delete(matchId) : next.add(matchId)
      return next
    })
  }

  async function calculatePoints() {
    const { data, error: err } = await supabase.functions.invoke("calculate-points")
    if (err) alert("Erreur : " + err.message)
    else alert(`✅ ${data.matchesProcessed} matchs traités, ${data.usersUpdated} joueurs mis à jour`)
  }

  if (loading) return (
    <div style={{ padding: "3rem", textAlign: "center", color: C.muted }}>
      <div style={{ fontSize: "32px", marginBottom: "12px" }}>⚽</div>
      Chargement des matchs...
    </div>
  )
  if (error) return <p style={{ padding: "2rem", color: "#f87171" }}>{error}</p>
  if (!matches.length) return (
    <div style={{ padding: "3rem", textAlign: "center", color: C.muted }}>
      <div style={{ fontSize: "40px", marginBottom: "12px" }}>🏟</div>
      <p style={{ fontWeight: "600", color: C.text }}>Aucun match disponible</p>
      <p style={{ fontSize: "13px", marginTop: "6px" }}>Le tournoi commence bientôt</p>
    </div>
  )

  return (
    <div style={{ padding: "16px", maxWidth: "600px", margin: "0 auto" }}>

      <button onClick={calculatePoints} style={{
        display: "block", width: "100%", padding: "11px", marginBottom: "16px",
        border: `1px dashed ${C.border}`, borderRadius: "10px", cursor: "pointer",
        background: "none", color: C.dim, fontSize: "12px",
      }}>⚙️ Calculer les points</button>

      {matches.map((match, idx) => {
        const matchId = parseInt(match.id)
        const myBet = bets[`${matchId}-result`]
        const isLive = match.state === "in"
        const isFinished = match.state === "post"
        const isLocked = isLive || isFinished
        const isAdvancedOpen = expandedAdvanced.has(match.id)
        const advancedCount = ADVANCED_TYPES.filter(t => bets[`${matchId}-${t}`] != null).length

        const save = (type, val) => placeBet(matchId, type, val)

        return (
          <div key={match.id}
            className={`card-enter ${isLive ? "card-live" : ""}`}
            style={{
              background: C.card, borderRadius: "16px", padding: "16px",
              marginBottom: "12px", border: `1px solid ${isLive ? C.primary : C.border}`,
              animationDelay: `${idx * 0.05}s`,
            }}>

            {/* Status + venue */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
              <span style={{
                fontSize: "11px", fontWeight: "700", padding: "4px 10px", borderRadius: "20px",
                background: isLive ? C.primary : isFinished ? "#1e293b" : C.primaryGlow,
                color: isLive ? "white" : isFinished ? C.muted : C.primary,
                letterSpacing: "0.3px", textTransform: "uppercase",
              }}>
                {isLive ? `● ${match.displayClock}` : isFinished ? "Terminé" : match.statusDetail}
              </span>
              {match.venue && (
                <div style={{ textAlign: "right", marginLeft: "8px" }}>
                  <div style={{ fontSize: "11px", color: C.muted }}>🏟 {match.venue}</div>
                  <div style={{ fontSize: "10px", color: C.dim }}>{match.city}</div>
                </div>
              )}
            </div>

            {/* Teams + score */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {match.home.logo && <img src={match.home.logo} alt="" width="32" height="32" referrerPolicy="no-referrer" style={{ objectFit: "contain", flexShrink: 0, borderRadius: "4px" }} />}
                  <span translate="no" style={{ fontWeight: "600", fontSize: "14px", color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{match.home.name}</span>
                </div>
                <FormDots form={match.home.form} />
              </div>

              <div style={{ textAlign: "center", flexShrink: 0, minWidth: "60px" }}>
                {isLocked ? (
                  <div>
                    <span style={{ fontSize: "28px", fontWeight: "800", color: C.text, letterSpacing: "1px" }}>{match.home.score}</span>
                    <span style={{ fontSize: "18px", color: C.dim, margin: "0 4px" }}>–</span>
                    <span style={{ fontSize: "28px", fontWeight: "800", color: C.text, letterSpacing: "1px" }}>{match.away.score}</span>
                  </div>
                ) : (
                  <span style={{ fontSize: "14px", fontWeight: "600", color: C.dim, letterSpacing: "2px" }}>VS</span>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span translate="no" style={{ fontWeight: "600", fontSize: "14px", color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{match.away.name}</span>
                  {match.away.logo && <img src={match.away.logo} alt="" width="32" height="32" referrerPolicy="no-referrer" style={{ objectFit: "contain", flexShrink: 0, borderRadius: "4px" }} />}
                </div>
                <FormDots form={match.away.form} />
              </div>
            </div>

            {/* Result bet — pre-match */}
            {!isLocked && (
              <div>
                <p style={{ fontSize: "11px", color: C.dim, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600" }}>Pronostic</p>
                <div style={{ display: "flex", gap: "8px" }}>
                  {[
                    { label: match.home.name, value: "home" },
                    { label: "Nul", value: "draw" },
                    { label: match.away.name, value: "away" },
                  ].map(opt => {
                    const sel = myBet === opt.value
                    return (
                      <button key={opt.value} onClick={() => save("result", opt.value)} style={{
                        flex: 1, padding: "10px 6px", border: `1.5px solid ${sel ? C.primary : C.border}`,
                        borderRadius: "50px", cursor: "pointer",
                        background: sel ? C.primaryGlow : "transparent",
                        color: sel ? C.primary : C.muted,
                        fontSize: "11px", fontWeight: sel ? "700" : "500",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        minWidth: 0, transition: "all 0.15s",
                      }}>{opt.label}</button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Result bet — locked display */}
            {isLocked && myBet && (
              <div style={{ marginTop: "4px", padding: "8px 12px", borderRadius: "8px", background: C.primaryGlow, border: `1px solid ${C.primary}22` }}>
                <span style={{ fontSize: "12px", color: C.primary, fontWeight: "600" }}>
                  ✓ {myBet === "home" ? match.home.name : myBet === "away" ? match.away.name : "Nul"}
                </span>
              </div>
            )}

            {/* Advanced bets — pre-match toggle */}
            {!isLocked && (
              <div style={{ marginTop: "12px", borderTop: `1px solid ${C.border}`, paddingTop: "10px" }}>
                <button onClick={() => toggleAdvanced(match.id)} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", background: "none", border: "none", cursor: "pointer",
                  color: isAdvancedOpen ? C.primary : C.muted,
                  fontSize: "11px", fontWeight: "700", padding: "0 0 2px 0",
                  textTransform: "uppercase", letterSpacing: "0.5px",
                }}>
                  <span>
                    Paris avancés
                    {advancedCount > 0 && (
                      <span style={{ marginLeft: "6px", background: C.primaryGlow, color: C.primary, borderRadius: "20px", padding: "2px 7px", fontSize: "10px", border: `1px solid ${C.primary}33` }}>
                        {advancedCount}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: "11px", marginLeft: "8px" }}>{isAdvancedOpen ? "▲" : "▼"}</span>
                </button>

                {isAdvancedOpen && (
                  <div style={{ marginTop: "10px" }}>
                    <GoalsBet
                      saved={bets[`${matchId}-exact_goals`]}
                      onSave={v => save("exact_goals", v)}
                    />
                    <CornersBet
                      saved={bets[`${matchId}-exact_corners`]}
                      onSave={v => save("exact_corners", v)}
                    />
                    <RedCardBet
                      saved={bets[`${matchId}-red_card_team`]}
                      onSave={v => save("red_card_team", v)}
                      homeName={match.home.name}
                      awayName={match.away.name}
                    />
                    <PossessionBet
                      saved={bets[`${matchId}-possession_home`]}
                      onSave={v => save("possession_home", v)}
                      homeName={match.home.name}
                      awayName={match.away.name}
                    />
                    <ScorerBet
                      saved={bets[`${matchId}-scorer`]}
                      onSave={v => save("scorer", v)}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Advanced bets — locked summary */}
            {isLocked && (
              <LockedAdvancedSummary
                bets={bets}
                matchId={matchId}
                homeName={match.home.name}
                awayName={match.away.name}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
