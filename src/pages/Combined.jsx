import { useState, useEffect } from "react"
import { supabase } from "../supabase"
import { computeOddsMap, fmtOdds } from "../utils/odds"

const ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=200&dates=20260611-20260719"

const C = {
  bg: "#0F1923", card: "#1A2634", border: "#243447",
  primary: "#1D9E75", primaryGlow: "rgba(29,158,117,0.15)",
  text: "#f1f5f9", muted: "#94a3b8", dim: "#64748b",
  inner: "#0d1720",
  win: "#1D9E75", winGlow: "rgba(29,158,117,0.12)",
  lose: "#ef4444", loseGlow: "rgba(239,68,68,0.10)",
  pending: "#f59e0b", pendingGlow: "rgba(245,158,11,0.10)",
  odds: "#f59e0b",
}

// 2=×2, 3=×4, 4=×6, 5=×10, 6=×13, 7=×17, 8=×20, 9=×23, 10=×25
const MULTS = [null, null, 2, 4, 6, 10, 13, 17, 20, 23, 25]
function getMultiplier(n) { return MULTS[n] ?? null }

function parseMatches(data) {
  return (data.events || []).map(ev => {
    const comp = ev.competitions?.[0]
    const home = comp?.competitors?.find(c => c.homeAway === "home")
    const away = comp?.competitors?.find(c => c.homeAway === "away")
    return {
      id: ev.id, date: ev.date,
      state: comp?.status?.type?.state,
      statusDetail: comp?.status?.type?.shortDetail,
      home: { name: home?.team?.displayName ?? "", logo: home?.team?.logo ?? "" },
      away: { name: away?.team?.displayName ?? "", logo: away?.team?.logo ?? "" },
    }
  })
}

function fmtDate(iso) {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

// ─── Multiplier table ─────────────────────────────────────────────────────────

function MultTable({ current }) {
  return (
    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", justifyContent: "center" }}>
      {[2,3,4,5,6,7,8,9,10].map(n => {
        const m = MULTS[n], active = n === current
        return (
          <div key={n} style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            padding: "5px 8px", borderRadius: "8px",
            background: active ? C.primaryGlow : C.inner,
            border: `1px solid ${active ? C.primary : C.border}`,
            minWidth: "36px",
          }}>
            <span style={{ fontSize: "10px", color: active ? C.primary : C.dim, fontWeight: "700" }}>{n}</span>
            <span style={{ fontSize: "12px", fontWeight: "800", color: active ? C.primary : C.muted }}>×{m}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Ticket card ──────────────────────────────────────────────────────────────

function TicketCard({ ticket }) {
  const info = ticket.matches_info || {}
  const preds = ticket.predictions || {}
  const status = ticket.status
  const statusCfg = {
    won:     { color: C.win,     bg: C.winGlow,     border: `${C.win}33`,     icon: "✓", label: "Gagné"    },
    lost:    { color: C.lose,    bg: C.loseGlow,    border: `${C.lose}33`,    icon: "✕", label: "Perdu"    },
    pending: { color: C.pending, bg: C.pendingGlow, border: `${C.pending}33`, icon: "⏳", label: "En cours" },
  }[status] || {}

  return (
    <div style={{
      background: statusCfg.bg ?? C.card, border: `1px solid ${statusCfg.border ?? C.border}`,
      borderRadius: "14px", padding: "14px 16px", marginBottom: "10px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ background: `${statusCfg.color}22`, color: statusCfg.color, borderRadius: "20px", padding: "3px 10px", fontSize: "11px", fontWeight: "800" }}>
            {statusCfg.icon} {statusCfg.label}
          </span>
          <span style={{ background: C.primaryGlow, color: C.primary, borderRadius: "20px", padding: "3px 10px", fontSize: "11px", fontWeight: "700", border: `1px solid ${C.primary}33` }}>
            ×{ticket.multiplier}
          </span>
        </div>
        <div style={{ textAlign: "right" }}>
          {status === "won"     && <div style={{ color: C.win,     fontWeight: "800", fontSize: "15px" }}>+{ticket.stake * ticket.multiplier} pts</div>}
          {status === "lost"    && <div style={{ color: C.lose,    fontWeight: "700", fontSize: "15px" }}>−{ticket.stake} pts</div>}
          {status === "pending" && (
            <>
              <div style={{ color: C.pending, fontWeight: "700", fontSize: "13px" }}>Mise : {ticket.stake} pts</div>
              <div style={{ color: C.dim, fontSize: "10px", marginTop: "2px" }}>Gain potentiel : {ticket.stake * ticket.multiplier} pts</div>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
        {Object.entries(preds).map(([matchId, pred]) => {
          const matchInfo = info[matchId] || {}
          const predLabel = pred === "home" ? matchInfo.home : pred === "away" ? matchInfo.away : "Match nul"
          return (
            <div key={matchId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderRadius: "8px", background: C.inner }}>
              <span translate="no" style={{ fontSize: "12px", color: C.muted, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: "8px" }}>
                {matchInfo.home || "?"} <span style={{ color: C.dim }}>vs</span> {matchInfo.away || "?"}
              </span>
              <span translate="no" style={{ fontSize: "11px", fontWeight: "700", color: C.primary, background: C.primaryGlow, borderRadius: "20px", padding: "2px 8px", flexShrink: 0 }}>
                {predLabel || pred}
              </span>
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: "10px", color: C.dim, marginTop: "8px" }}>
        {new Date(ticket.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
      </div>
    </div>
  )
}

// ─── Stake input ──────────────────────────────────────────────────────────────

function StakeInput({ value, onChange, min, max, label }) {
  function step(delta) { onChange(Math.max(min, Math.min(max, value + delta))) }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={{ fontSize: "12px", color: C.muted, fontWeight: "600", minWidth: "40px" }}>{label}</span>
      {[-50, -10].map(d => (
        <button key={d} onClick={() => step(d)} disabled={value <= min} style={stepBtn(value > min)}>{d}</button>
      ))}
      <input type="number" value={value} min={min} max={max}
        onChange={e => { const n = parseInt(e.target.value); if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n))) }}
        style={{
          width: "70px", background: C.inner, border: `1.5px solid ${C.primary}`,
          borderRadius: "8px", padding: "7px 6px", color: C.text, fontSize: "16px",
          fontWeight: "800", outline: "none", textAlign: "center", fontFamily: "inherit",
        }}
      />
      {[10, 50].map(d => (
        <button key={d} onClick={() => step(d)} disabled={value >= max} style={stepBtn(value < max)}>+{d}</button>
      ))}
      <span style={{ fontSize: "12px", color: C.dim }}>pts</span>
    </div>
  )
}

function stepBtn(enabled) {
  return {
    padding: "5px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700",
    border: `1px solid ${enabled ? C.primary : C.border}`,
    background: enabled ? C.primaryGlow : "transparent",
    color: enabled ? C.primary : C.dim,
    cursor: enabled ? "pointer" : "not-allowed",
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Combined({ user, balance, onBalanceChange }) {
  const [view, setView] = useState("create")
  const [matches, setMatches] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [preds, setPreds] = useState({})
  const [stake, setStake] = useState(50)
  const [tickets, setTickets] = useState([])
  const [oddsMap, setOddsMap] = useState({})   // { matchId: { home, draw, away } }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchData() }, [])

  // Live odds: all result bets + Realtime + 30s polling
  useEffect(() => {
    fetchAllResultBets()
    const ch = supabase.channel("combined-odds")
      .on("postgres_changes", { event: "*", schema: "public", table: "bets" }, fetchAllResultBets)
      .subscribe()
    const iv = setInterval(fetchAllResultBets, 30000)
    return () => { supabase.removeChannel(ch); clearInterval(iv) }
  }, [])

  async function fetchAllResultBets() {
    const { data } = await supabase.from("bets").select("match_id, bet_value, stake").eq("bet_type", "result")
    if (data) setOddsMap(computeOddsMap(data))
  }

  async function fetchData() {
    const [, { data: ticketData }] = await Promise.all([
      fetchMatches(),
      supabase.from("combined_bets").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    ])
    setTickets(ticketData || [])
  }

  async function fetchMatches() {
    try {
      const res = await fetch(ESPN_URL)
      setMatches(parseMatches(await res.json()).filter(m => m.state === "pre"))
    } catch {}
    setLoading(false)
  }

  async function refreshTickets() {
    const { data } = await supabase.from("combined_bets").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
    setTickets(data || [])
  }

  function toggleSelect(matchId) {
    const sid = String(matchId)
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(sid)) {
        next.delete(sid)
        setPreds(p => { const n = { ...p }; delete n[sid]; return n })
      } else if (next.size < 10) {
        next.add(sid)
      }
      return next
    })
  }

  function setPred(matchId, value) {
    setPreds(prev => ({ ...prev, [String(matchId)]: value }))
  }

  const selCount = selected.size
  const mult = getMultiplier(selCount)
  const allPredicted = selCount >= 2 && [...selected].every(id => preds[id])
  const safeBalance = balance ?? 1000
  const MIN_BALANCE = 50
  const canBet = safeBalance > MIN_BALANCE
  const maxStake = Math.max(10, safeBalance - MIN_BALANCE)
  const cappedStake = Math.max(10, Math.min(stake, maxStake))
  const potentialGain = mult ? cappedStake * mult : 0

  async function validate() {
    if (!allPredicted || saving || !mult) return
    if (!canBet || safeBalance - cappedStake < MIN_BALANCE) { alert("Solde insuffisant — minimum 50 points requis"); return }

    setSaving(true)

    const matchIds = [...selected].map(s => parseInt(s))
    const matchesInfo = {}
    for (const sid of selected) {
      const m = matches.find(m => String(m.id) === sid)
      if (m) matchesInfo[sid] = { home: m.home.name, away: m.away.name, detail: m.statusDetail }
    }
    const predsToSave = {}
    for (const [id, p] of Object.entries(preds)) {
      if (selected.has(id)) predsToSave[id] = p
    }

    const { error } = await supabase.from("combined_bets").insert({
      user_id: user.id, match_ids: matchIds, predictions: predsToSave,
      matches_info: matchesInfo, multiplier: mult, stake: cappedStake, status: "pending",
    })

    if (error) { alert("Erreur : " + error.message); setSaving(false); return }

    await supabase.rpc("adjust_balance", { uid: user.id, delta: -cappedStake })
    onBalanceChange?.()

    setSelected(new Set()); setPreds({})
    setView("tickets"); refreshTickets()
    setSaving(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const pendingTickets = tickets.filter(t => t.status === "pending")
  const historyTickets = tickets.filter(t => t.status !== "pending")

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto" }}>

      {/* View switcher */}
      <div style={{ display: "flex", background: "#0a1520", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 10 }}>
        {[
          { id: "create",  label: "Créer un combiné", badge: null },
          { id: "tickets", label: "Mes tickets", badge: tickets.length || null },
        ].map(tab => (
          <button key={tab.id} onClick={() => setView(tab.id)} style={{
            flex: 1, padding: "14px 8px", background: "none", border: "none", cursor: "pointer",
            color: view === tab.id ? C.primary : C.muted,
            fontWeight: view === tab.id ? "700" : "500", fontSize: "13px",
            borderBottom: `2px solid ${view === tab.id ? C.primary : "transparent"}`,
            display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
          }}>
            {tab.label}
            {tab.badge !== null && (
              <span style={{ background: C.primaryGlow, color: C.primary, borderRadius: "20px", padding: "1px 7px", fontSize: "10px", fontWeight: "700", border: `1px solid ${C.primary}33` }}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── CREATE VIEW ── */}
      {view === "create" && (
        <div style={{ padding: "16px", paddingBottom: selCount >= 2 ? "200px" : "16px" }}>

          {/* Multiplier table */}
          <div style={{ background: C.card, borderRadius: "14px", padding: "14px 16px", marginBottom: "16px", border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: "11px", color: C.dim, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>
              Multiplicateurs de gain
            </div>
            <MultTable current={selCount >= 2 ? selCount : null} />
            <div style={{ fontSize: "11px", color: C.dim, textAlign: "center", marginTop: "10px" }}>
              Sélectionne 2 à 10 matchs · Cotes ESPN affichées en temps réel
            </div>
          </div>

          {/* Match list */}
          {loading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: C.muted }}>Chargement des matchs...</div>
          ) : matches.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", color: C.muted }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>⏳</div>
              <p style={{ fontWeight: "600", color: C.text }}>Aucun match à venir</p>
            </div>
          ) : matches.map(match => {
            const sid = String(match.id)
            const isSel = selected.has(sid)
            const pred = preds[sid]
            const maxSel = selected.size >= 10 && !isSel
            const matchOdds = oddsMap[parseInt(match.id)] ?? {}

            return (
              <div key={match.id} style={{
                background: isSel ? `linear-gradient(135deg, rgba(29,158,117,0.1), rgba(29,158,117,0.03))` : C.card,
                border: `1px solid ${isSel ? `${C.primary}55` : C.border}`,
                borderRadius: "12px", marginBottom: "8px",
                opacity: maxSel ? 0.5 : 1, transition: "all 0.15s",
              }}>
                {/* Match row */}
                <div style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "12px 14px", cursor: maxSel ? "not-allowed" : "pointer",
                }} onClick={() => !maxSel && toggleSelect(match.id)}>
                  {/* Checkbox */}
                  <div style={{
                    width: "20px", height: "20px", borderRadius: "6px", flexShrink: 0,
                    border: `2px solid ${isSel ? C.primary : C.border}`,
                    background: isSel ? C.primary : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "12px", color: "white", fontWeight: "700", transition: "all 0.15s",
                  }}>{isSel ? "✓" : ""}</div>

                  {/* Teams */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {match.home.logo && <img src={match.home.logo} alt="" width="18" height="18" referrerPolicy="no-referrer" style={{ objectFit: "contain" }} />}
                      <span translate="no" style={{ fontSize: "13px", fontWeight: "600", color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {match.home.name}
                      </span>
                      <span style={{ fontSize: "11px", color: C.dim }}>vs</span>
                      <span translate="no" style={{ fontSize: "13px", fontWeight: "600", color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {match.away.name}
                      </span>
                      {match.away.logo && <img src={match.away.logo} alt="" width="18" height="18" referrerPolicy="no-referrer" style={{ objectFit: "contain" }} />}
                    </div>
                    <div style={{ fontSize: "10px", color: C.dim, marginTop: "2px" }}>{fmtDate(match.date)}</div>
                  </div>

                  {/* Prediction indicator */}
                  {pred && (
                    <span translate="no" style={{
                      fontSize: "10px", fontWeight: "700", color: C.primary,
                      background: C.primaryGlow, borderRadius: "20px", padding: "2px 8px",
                      border: `1px solid ${C.primary}33`, flexShrink: 0,
                    }}>
                      {pred === "home" ? match.home.name : pred === "away" ? match.away.name : "Nul"}
                    </span>
                  )}
                </div>

                {/* Prediction buttons with odds — only when selected */}
                {isSel && (
                  <div style={{ padding: "0 14px 12px", display: "flex", gap: "6px" }}>
                    {[
                      { value: "home", label: match.home.name },
                      { value: "draw", label: "Nul" },
                      { value: "away", label: match.away.name },
                    ].map(opt => {
                      const sel = pred === opt.value
                      const oddsVal = matchOdds[opt.value]
                      return (
                        <button key={opt.value} onClick={e => { e.stopPropagation(); setPred(match.id, opt.value) }} style={{
                          flex: 1, padding: "8px 4px",
                          border: `1.5px solid ${sel ? C.primary : C.border}`,
                          borderRadius: "10px", cursor: "pointer",
                          background: sel ? C.primaryGlow : C.inner,
                          textAlign: "center", transition: "all 0.15s",
                        }}>
                          <div style={{
                            fontSize: "10px", fontWeight: "600",
                            color: sel ? C.primary : C.muted,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }} translate="no">{opt.label}</div>
                          <div style={{
                            fontSize: "13px", fontWeight: "800",
                            color: sel ? C.primary : (oddsVal ? C.odds : C.dim),
                            marginTop: "3px",
                          }}>
                            {fmtOdds(oddsVal)}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── TICKETS VIEW ── */}
      {view === "tickets" && (
        <div style={{ padding: "16px" }}>
          {tickets.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem 1rem", color: C.muted }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>🎯</div>
              <p style={{ fontWeight: "600", color: C.text }}>Aucun ticket pour l'instant</p>
              <p style={{ fontSize: "13px", marginTop: "6px" }}>Crée ton premier combiné</p>
              <button onClick={() => setView("create")} style={{
                marginTop: "20px", padding: "10px 24px", borderRadius: "30px",
                background: C.primaryGlow, border: `1px solid ${C.primary}`, color: C.primary,
                cursor: "pointer", fontSize: "13px", fontWeight: "700",
              }}>Créer un combiné</button>
            </div>
          ) : (
            <>
              {pendingTickets.length > 0 && (
                <>
                  <div style={{ fontSize: "11px", color: C.dim, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>
                    En cours · {pendingTickets.length} ticket{pendingTickets.length > 1 ? "s" : ""}
                  </div>
                  {pendingTickets.map(t => <TicketCard key={t.id} ticket={t} />)}
                </>
              )}
              {historyTickets.length > 0 && (
                <>
                  <div style={{ fontSize: "11px", color: C.dim, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", margin: "16px 0 10px" }}>
                    Historique
                  </div>
                  {historyTickets.map(t => <TicketCard key={t.id} ticket={t} />)}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Bottom action bar — 2+ matches selected ── */}
      {view === "create" && selCount >= 2 && (
        <div style={{
          position: "fixed", bottom: "64px", left: 0, right: 0, zIndex: 15,
          background: C.card, borderTop: `1px solid ${C.border}`,
          padding: "12px 16px",
          boxShadow: "0 -4px 24px rgba(0,0,0,0.5)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <div>
              <span style={{ fontSize: "13px", color: C.text, fontWeight: "700" }}>
                {selCount} match{selCount > 1 ? "s" : ""}
              </span>
              {mult && (
                <span style={{
                  marginLeft: "8px", fontSize: "13px", fontWeight: "800", color: C.primary,
                  background: C.primaryGlow, borderRadius: "20px", padding: "2px 10px",
                  border: `1px solid ${C.primary}33`,
                }}>×{mult}</span>
              )}
              {!allPredicted && (
                <div style={{ fontSize: "10px", color: C.pending, marginTop: "2px" }}>
                  {selCount - [...selected].filter(id => preds[id]).length} pronostic(s) manquant(s)
                </div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "11px", color: C.dim }}>Gain si tout correct</div>
              <div style={{ fontSize: "20px", fontWeight: "800", color: C.primary }}>{potentialGain} pts</div>
            </div>
          </div>

          {!canBet ? (
            <div style={{ padding: "10px 12px", borderRadius: "10px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", textAlign: "center" }}>
              <div style={{ fontSize: "13px", color: "#f87171", fontWeight: "600" }}>Vous avez atteint le solde minimum.</div>
              <div style={{ fontSize: "11px", color: C.dim, marginTop: "4px" }}>Achetez des points en boutique pour continuer.</div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <StakeInput value={stake} onChange={v => setStake(v)} min={10} max={maxStake} label="Mise :" />
                <div style={{ fontSize: "10px", color: C.dim, marginTop: "4px", paddingLeft: "40px" }}>
                  Solde : {safeBalance.toLocaleString("fr-FR")} pts · max {maxStake} pts (min. 50 réservés)
                </div>
              </div>
              <button onClick={validate} disabled={!allPredicted || saving} style={{
                padding: "12px 18px", borderRadius: "30px", border: "none",
                cursor: allPredicted && !saving ? "pointer" : "not-allowed",
                background: allPredicted && !saving
                  ? `linear-gradient(135deg, ${C.primary}, #166d52)` : C.border,
                color: allPredicted && !saving ? "white" : C.dim,
                fontSize: "13px", fontWeight: "800", flexShrink: 0,
                boxShadow: allPredicted ? "0 4px 16px rgba(29,158,117,0.35)" : "none",
                transition: "all 0.2s",
              }}>
                {saving ? "Validation..." : "Valider ✓"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
