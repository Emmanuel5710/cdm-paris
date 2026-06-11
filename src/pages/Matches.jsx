import { useState, useEffect, useRef } from "react"
import { supabase } from "../supabase"
import { computeOddsMap, fmtOdds, DEFAULT_ODDS } from "../utils/odds"

const ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=200&dates=20260611-20260719"
const C = {
  bg: "#0F1923", card: "#1A2634", border: "#243447",
  primary: "#1D9E75", primaryDark: "#166d52", primaryGlow: "rgba(29,158,117,0.18)",
  text: "#f1f5f9", muted: "#94a3b8", dim: "#64748b",
  inner: "#0d1720", cancel: "#ef444433", cancelText: "#f87171",
  odds: "#f59e0b",
}

const DEFAULT_STAKE = 50
const MIN_BALANCE = 50
const ADVANCED_TYPES = ["total_goals", "btts"]

const FIXED_ODDS = {
  total_goals: { "0": 12.0, "1": 5.5, "2": 2.8, "3": 3.0, "4": 5.0, "5+": 5.0 },
  btts:        { "yes": 1.9, "no": 1.7 },
}

const GOALS_OPTIONS = [
  { value: "0",  label: "0 but"   },
  { value: "1",  label: "1 but"   },
  { value: "2",  label: "2 buts"  },
  { value: "3",  label: "3 buts"  },
  { value: "4",  label: "4 buts"  },
  { value: "5+", label: "5+ buts" },
]

// ─── Utilities ────────────────────────────────────────────────────────────────

// Mapping statique tiré du tirage officiel (ESPN scoreboard n'expose pas le groupe)
const TEAM_GROUP = {
  "Mexico": "A",        "South Africa": "A",        "South Korea": "A",          "Czechia": "A",
  "Canada": "B",        "Bosnia-Herzegovina": "B",  "Qatar": "B",                "Switzerland": "B",
  "Brazil": "C",        "Morocco": "C",             "Haiti": "C",                "Scotland": "C",
  "United States": "D", "Paraguay": "D",            "Australia": "D",            "Türkiye": "D",
  "Germany": "E",       "Curaçao": "E",             "Ivory Coast": "E",          "Ecuador": "E",
  "Netherlands": "F",   "Japan": "F",               "Sweden": "F",               "Tunisia": "F",
  "Belgium": "G",       "Egypt": "G",               "Iran": "G",                 "New Zealand": "G",
  "Spain": "H",         "Cape Verde": "H",          "Saudi Arabia": "H",         "Uruguay": "H",
  "France": "I",        "Senegal": "I",             "Iraq": "I",                 "Norway": "I",
  "Argentina": "J",     "Algeria": "J",             "Austria": "J",              "Jordan": "J",
  "Portugal": "K",      "Congo DR": "K",            "Uzbekistan": "K",           "Colombia": "K",
  "England": "L",       "Croatia": "L",             "Ghana": "L",                "Panama": "L",
  // Variantes ESPN possibles
  "USA": "D",           "Turkey": "D",              "Czech Republic": "A",       "Curacao": "E",
  "Côte d'Ivoire": "E", "Cote d'Ivoire": "E",       "Bosnia and Herzegovina": "B","DR Congo": "K",
}

function getGroup(ev) {
  const comp = ev.competitions?.[0]
  const home = comp?.competitors?.find(c => c.homeAway === "home")
  const away = comp?.competitors?.find(c => c.homeAway === "away")
  const letter = TEAM_GROUP[home?.team?.displayName] ?? TEAM_GROUP[away?.team?.displayName]
  return letter ? `Groupe ${letter}` : "Phase finale"
}

function getJournee(isoDate) {
  if (!isoDate) return "finale"
  const d = new Date(isoDate)
  if (d < new Date("2026-06-16T00:00:00Z")) return "j1"
  if (d < new Date("2026-06-21T00:00:00Z")) return "j2"
  if (d < new Date("2026-06-26T00:00:00Z")) return "j3"
  return "finale"
}

function getFinaleRound(ev) {
  // ESPN: ev.season.slug contient le nom du tour en phase finale
  const slug = ev.season?.slug ?? ""
  if (/round.of.32|r32/i.test(slug))  return "Round of 32"
  if (/round.of.16|r16/i.test(slug))  return "Round of 16"
  if (/quarter/i.test(slug))           return "Quarts de finale"
  if (/semi/i.test(slug))              return "Demi-finales"
  if (/third|3rd/i.test(slug))         return "3ème place"
  if (/final/i.test(slug))             return "Finale"
  // Repli par date
  const d = new Date(ev.date)
  if (d < new Date("2026-07-01T00:00:00Z")) return "Round of 32"
  if (d < new Date("2026-07-06T00:00:00Z")) return "Round of 16"
  if (d < new Date("2026-07-09T00:00:00Z")) return "Quarts de finale"
  if (d < new Date("2026-07-12T00:00:00Z")) return "Demi-finales"
  if (d < new Date("2026-07-14T00:00:00Z")) return "3ème place"
  return "Finale"
}

function formatFrenchDate(iso) {
  if (!iso) return ""
  const d = new Date(iso)
  return d.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
    .replace(/^(.)/, c => c.toUpperCase())
    .replace(/,\s*/, " à ")
    .replace(/(\d{2}):(\d{2})/, "$1h$2")
}

function parseMatches(data) {
  return (data.events || []).map(ev => {
    const comp = ev.competitions?.[0]
    const home = comp?.competitors?.find(c => c.homeAway === "home")
    const away = comp?.competitors?.find(c => c.homeAway === "away")
    return {
      id: ev.id,
      date: ev.date ?? null,
      group: getGroup(ev),
      journee: getJournee(ev.date),
      finaleRound: getFinaleRound(ev),
      state: comp?.status?.type?.state,
      displayClock: comp?.status?.displayClock,
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

// ─── Stake stepper ────────────────────────────────────────────────────────────

function StakeStepper({ value, onChange, max }) {
  const clamp = n => Math.max(10, Math.min(max, n))
  const btn = (enabled, onClick, label) => (
    <button onClick={onClick} disabled={!enabled} style={{
      padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: "700",
      border: `1px solid ${enabled ? C.primary : C.border}`,
      background: enabled ? C.primaryGlow : "transparent",
      color: enabled ? C.primary : C.dim,
      cursor: enabled ? "pointer" : "not-allowed",
    }}>{label}</button>
  )
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "center" }}>
      <span style={{ fontSize: "11px", color: C.muted, fontWeight: "600" }}>Mise :</span>
      {btn(value > 10, () => onChange(clamp(value - 10)), "−10")}
      <input
        type="number" value={value} min={10} max={max}
        onChange={e => { const n = parseInt(e.target.value); if (!isNaN(n)) onChange(clamp(n)) }}
        style={{
          width: "60px", background: C.inner, border: `1.5px solid ${C.primary}66`,
          borderRadius: "7px", padding: "5px 4px", color: C.text,
          fontSize: "15px", fontWeight: "800", outline: "none",
          textAlign: "center", fontFamily: "inherit",
        }}
      />
      {btn(value < max, () => onChange(clamp(value + 10)), "+10")}
      <span style={{ fontSize: "11px", color: C.dim }}>pts</span>
    </div>
  )
}

// ─── Shared advanced bet card ─────────────────────────────────────────────────

function BetCard({ icon, title, hasBet, onCancel, children }) {
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
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "9px", background: C.primaryGlow, color: C.primary, borderRadius: "20px", padding: "3px 8px", fontWeight: "700", border: `1px solid ${C.primary}33` }}>
              Parié ✓
            </span>
            {onCancel && (
              <button onClick={onCancel} title="Annuler ce pari" style={{
                width: "22px", height: "22px", borderRadius: "50%", border: `1px solid ${C.cancelText}44`,
                background: C.cancel, cursor: "pointer", color: C.cancelText,
                fontSize: "11px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, transition: "all 0.15s", padding: 0,
              }}>✕</button>
            )}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

// ─── Stepper (Goals only) ─────────────────────────────────────────────────────

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

function TotalGoalsBet({ savedValue, savedData, draftStake, onDraftStakeChange, onPlace, onCancel, maxStake }) {
  const [selected, setSelected] = useState(null)
  const isPlaced = !!savedValue

  if (isPlaced) {
    const odds = savedData?.odds ?? FIXED_ODDS.total_goals[savedValue] ?? 2.8
    const stake = savedData?.stake ?? 0
    const gain = Math.round(stake * odds)
    const opt = GOALS_OPTIONS.find(o => o.value === savedValue)
    return (
      <BetCard icon="⚽" title="Total de buts" hasBet={true} onCancel={onCancel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "16px", fontWeight: "800", color: C.primary }}>{opt?.label ?? savedValue}</div>
            <div style={{ fontSize: "11px", color: C.dim, marginTop: "3px" }}>
              Cote ×{odds.toFixed(1)} · Mise {stake} pts
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "20px", fontWeight: "800", color: C.primary }}>+{gain}</div>
            <div style={{ fontSize: "10px", color: C.dim }}>pts si correct</div>
          </div>
        </div>
      </BetCard>
    )
  }

  return (
    <BetCard icon="⚽" title="Total de buts" hasBet={false}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px", marginBottom: selected ? "12px" : "0" }}>
        {GOALS_OPTIONS.map(opt => {
          const odds = FIXED_ODDS.total_goals[opt.value]
          const sel = selected === opt.value
          const gain = sel ? Math.round(draftStake * odds) : null
          return (
            <button key={opt.value} onClick={() => setSelected(opt.value)} style={{
              padding: "9px 4px", borderRadius: "10px",
              border: `1.5px solid ${sel ? C.primary : C.border}`,
              background: sel ? C.primaryGlow : "transparent",
              cursor: "pointer", textAlign: "center", transition: "all 0.15s",
            }}>
              <div style={{ fontSize: "12px", fontWeight: "700", color: sel ? C.primary : C.text }}>{opt.label}</div>
              <div style={{ fontSize: "10px", color: C.odds, marginTop: "2px", fontWeight: "600" }}>×{odds}</div>
              {sel && gain && <div style={{ fontSize: "9px", color: C.primary, marginTop: "2px" }}>→ {gain} pts</div>}
            </button>
          )
        })}
      </div>
      {selected && (
        <>
          <StakeStepper value={draftStake} onChange={onDraftStakeChange} max={maxStake} />
          <button onClick={() => onPlace(selected, draftStake)} style={{
            width: "100%", marginTop: "10px", padding: "10px",
            background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
            border: "none", borderRadius: "10px", color: "white",
            fontSize: "13px", fontWeight: "700", cursor: "pointer",
          }}>
            Parier {draftStake} pts
          </button>
        </>
      )}
    </BetCard>
  )
}

function BttsBet({ savedValue, savedData, draftStake, onDraftStakeChange, onPlace, onCancel, maxStake }) {
  const [selected, setSelected] = useState(null)
  const isPlaced = !!savedValue

  if (isPlaced) {
    const odds = savedData?.odds ?? FIXED_ODDS.btts[savedValue] ?? 1.9
    const stake = savedData?.stake ?? 0
    const gain = Math.round(stake * odds)
    return (
      <BetCard icon="🥅" title="Les deux équipes marquent" hasBet={true} onCancel={onCancel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "16px", fontWeight: "800", color: C.primary }}>
              {savedValue === "yes" ? "Oui" : "Non"}
            </div>
            <div style={{ fontSize: "11px", color: C.dim, marginTop: "3px" }}>
              Cote ×{odds.toFixed(1)} · Mise {stake} pts
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "20px", fontWeight: "800", color: C.primary }}>+{gain}</div>
            <div style={{ fontSize: "10px", color: C.dim }}>pts si correct</div>
          </div>
        </div>
      </BetCard>
    )
  }

  return (
    <BetCard icon="🥅" title="Les deux équipes marquent" hasBet={false}>
      <div style={{ display: "flex", gap: "8px", marginBottom: selected ? "12px" : "0" }}>
        {[
          { value: "yes", label: "Oui", odds: FIXED_ODDS.btts.yes },
          { value: "no",  label: "Non", odds: FIXED_ODDS.btts.no  },
        ].map(opt => {
          const sel = selected === opt.value
          const gain = sel ? Math.round(draftStake * opt.odds) : null
          return (
            <button key={opt.value} onClick={() => setSelected(opt.value)} style={{
              flex: 1, padding: "12px 8px", borderRadius: "10px",
              border: `1.5px solid ${sel ? C.primary : C.border}`,
              background: sel ? C.primaryGlow : "transparent",
              cursor: "pointer", textAlign: "center", transition: "all 0.15s",
            }}>
              <div style={{ fontSize: "14px", fontWeight: "800", color: sel ? C.primary : C.text }}>{opt.label}</div>
              <div style={{ fontSize: "11px", color: C.odds, marginTop: "3px", fontWeight: "600" }}>×{opt.odds}</div>
              {sel && gain && <div style={{ fontSize: "9px", color: C.primary, marginTop: "2px" }}>→ {gain} pts</div>}
            </button>
          )
        })}
      </div>
      {selected && (
        <>
          <StakeStepper value={draftStake} onChange={onDraftStakeChange} max={maxStake} />
          <button onClick={() => onPlace(selected, draftStake)} style={{
            width: "100%", marginTop: "10px", padding: "10px",
            background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
            border: "none", borderRadius: "10px", color: "white",
            fontSize: "13px", fontWeight: "700", cursor: "pointer",
          }}>
            Parier {draftStake} pts
          </button>
        </>
      )}
    </BetCard>
  )
}

function ScorersBet({ savedScorers, onSave, onCancel }) {
  const savedNums = Object.keys(savedScorers)
    .map(k => parseInt(k.replace("scorer_", ""))).filter(n => !isNaN(n)).sort((a, b) => a - b)
  const [emptySlots, setEmptySlots] = useState([])
  const [drafts, setDrafts] = useState({})
  const savedScorersKey = JSON.stringify(savedScorers)

  useEffect(() => {
    setEmptySlots(prev => prev.filter(n => !savedScorers[`scorer_${n}`]))
  }, [savedScorersKey])

  const allNums = [...new Set([...savedNums, ...emptySlots])].sort((a, b) => a - b)
  const hasBet = savedNums.length > 0

  function addSlot() {
    if (allNums.length >= 5) return
    const maxN = Math.max(0, ...savedNums, ...emptySlots)
    setEmptySlots(prev => [...prev, maxN + 1])
    setDrafts(prev => ({ ...prev, [maxN + 1]: "" }))
  }
  function getDraft(n) { return n in drafts ? drafts[n] : savedScorers[`scorer_${n}`] ?? "" }
  function commit(n) {
    const d = getDraft(n).trim()
    if (d) { onSave(`scorer_${n}`, d); setDrafts(prev => { const next = { ...prev }; delete next[n]; return next }) }
  }
  function removeRow(n) {
    if (savedScorers[`scorer_${n}`]) onCancel(`scorer_${n}`)
    setEmptySlots(prev => prev.filter(x => x !== n))
    setDrafts(prev => { const next = { ...prev }; delete next[n]; return next })
  }
  function cancelAll() {
    savedNums.forEach(n => onCancel(`scorer_${n}`))
    setEmptySlots([]); setDrafts({})
  }
  const rowInputStyle = d => ({
    flex: 1, background: "#1a2634", border: `1.5px solid ${d ? C.primary : C.border}`,
    borderRadius: "9px", padding: "9px 12px", color: C.text, fontSize: "13px",
    outline: "none", transition: "border-color 0.15s", fontFamily: "inherit",
  })
  const iconBtn = (color, bg) => ({
    width: "36px", height: "36px", borderRadius: "8px", border: `1.5px solid ${color}55`,
    background: bg, cursor: "pointer", color, fontSize: "13px", fontWeight: "700",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  })

  return (
    <BetCard icon="🎯" title="Buteurs du match" hasBet={hasBet} onCancel={hasBet ? cancelAll : null}>
      <p style={{ fontSize: "12px", color: C.dim, marginBottom: "10px" }}>Je parie que ces joueurs marqueront</p>
      {allNums.length === 0 && (
        <p style={{ fontSize: "12px", color: C.dim, fontStyle: "italic", marginBottom: "8px", textAlign: "center" }}>
          Aucun buteur — cliquez sur &quot;+ Ajouter&quot;
        </p>
      )}
      {allNums.map((n, i) => {
        const savedVal = savedScorers[`scorer_${n}`]
        const draft = getDraft(n)
        const isDirty = draft.trim() !== (savedVal ?? "") && draft.trim().length > 0
        return (
          <div key={n} style={{ display: "flex", gap: "7px", marginBottom: "7px", alignItems: "center" }}>
            <input type="text" value={draft}
              onChange={e => setDrafts(p => ({ ...p, [n]: e.target.value }))}
              onBlur={() => commit(n)}
              onKeyDown={e => { if (e.key === "Enter") { commit(n); e.target.blur() } }}
              placeholder={`Buteur ${i + 1}...`} style={rowInputStyle(draft)} />
            {isDirty && <button onClick={() => commit(n)} style={iconBtn(C.primary, C.primaryGlow)}>✓</button>}
            <button onClick={() => removeRow(n)} style={iconBtn(C.cancelText, C.cancel)}>✕</button>
          </div>
        )
      })}
      {allNums.length < 5 && (
        <button onClick={addSlot} style={{
          width: "100%", padding: "9px", marginTop: allNums.length ? "4px" : 0,
          border: `1.5px dashed ${C.border}`, borderRadius: "9px",
          background: "none", cursor: "pointer", color: C.muted, fontSize: "12px", fontWeight: "600",
        }}>+ Ajouter un buteur</button>
      )}
    </BetCard>
  )
}

function LockedAdvancedSummary({ bets, matchId }) {
  const g = key => bets[`${matchId}-${key}`]
  const scorerValues = Object.entries(bets)
    .filter(([k]) => k.startsWith(`${matchId}-scorer_`)).map(([, v]) => v).filter(Boolean)
  const totalGoals = g("total_goals")
  const btts = g("btts")
  const items = [
    totalGoals != null && { icon: "⚽", text: `Total buts : ${totalGoals}` },
    btts != null && { icon: "🥅", text: `Les 2 équipes marquent : ${btts === "yes" ? "Oui" : "Non"}` },
    ...scorerValues.map(name => ({ icon: "🎯", text: name })),
  ].filter(Boolean)
  if (!items.length) return null
  return (
    <div style={{ marginTop: "8px", borderTop: `1px solid ${C.border}`, paddingTop: "10px" }}>
      <p style={{ fontSize: "10px", color: C.dim, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "700" }}>Paris avancés</p>
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

// ── Cache localStorage ────────────────────────────────────────────────────────
function cacheKey(uid) { return `bets_cache_${uid}` }
function readCache(uid) {
  try { return JSON.parse(localStorage.getItem(cacheKey(uid)) || "null") } catch { return null }
}
function writeCache(uid, bets, stakes, odds, advSaved) {
  try { localStorage.setItem(cacheKey(uid), JSON.stringify({ bets, stakes, odds, advSaved })) } catch {}
}

export default function Matches({ user, credits, onBalanceChange, onBetPlaced }) {
  // Initialise immédiatement depuis le cache localStorage
  const cached = user?.id ? readCache(user.id) : null
  const [bets, setBets] = useState(cached?.bets ?? {})
  const [matches, setMatches] = useState([])
  const [draftStakes, setDraftStakes] = useState({})
  const [savedStakes, setSavedStakes] = useState(cached?.stakes ?? {})
  const [savedOdds, setSavedOdds] = useState(cached?.odds ?? {})
  const [advDraftStakes, setAdvDraftStakes] = useState({})
  const [advSavedData, setAdvSavedData] = useState(cached?.advSaved ?? {})
  const [oddsMap, setOddsMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [expandedAdvanced, setExpandedAdvanced] = useState(new Set())
  const [expandedJournees, setExpandedJournees] = useState(() => {
    const t = new Date().toISOString().slice(0, 10)
    if (t < "2026-06-16") return new Set(["j1"])
    if (t < "2026-06-21") return new Set(["j2"])
    if (t < "2026-06-26") return new Set(["j3"])
    return new Set(["finale"])
  })
  const intervalRef = useRef(null)

  // Sync des paris depuis Supabase
  useEffect(() => {
    if (!user?.id) return
    supabase.from('bets')
      .select('match_id, bet_type, bet_value, stake, odds')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (!data || data.length === 0) return
        const betsMap = {}, stakesMap = {}, oddsMap = {}, advSavedMap = {}
        data.forEach(b => {
          const mid = parseInt(b.match_id)
          betsMap[`${mid}-${b.bet_type}`] = b.bet_value
          if (b.bet_type === "result") {
            if (b.stake != null) stakesMap[mid] = b.stake
            if (b.odds != null) oddsMap[mid] = Number(b.odds)
          } else if (b.bet_type === "total_goals" || b.bet_type === "btts") {
            advSavedMap[`${mid}-${b.bet_type}`] = { stake: b.stake, odds: Number(b.odds) }
          }
        })
        setBets(betsMap)
        setSavedStakes(stakesMap)
        setSavedOdds(oddsMap)
        setAdvSavedData(advSavedMap)
        writeCache(user.id, betsMap, stakesMap, oddsMap, advSavedMap)
      })
  }, [user?.id])

  // Local credits mirrors the App prop but updates optimistically on bet placement
  const [localCredits, setLocalCredits] = useState(null)
  useEffect(() => { if (credits != null) setLocalCredits(credits) }, [credits])
  const safeBalance = localCredits ?? 0

  // ── ESPN matches ────────────────────────────────────────────────────────────
  useEffect(() => { fetchMatches().finally(() => setLoading(false)) }, [])

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

  // ── Live odds: all result bets + Realtime + 30s polling ─────────────────────
  useEffect(() => {
    fetchAllResultBets()
    const ch = supabase.channel("matches-odds")
      .on("postgres_changes", { event: "*", schema: "public", table: "bets" }, fetchAllResultBets)
      .subscribe()
    const iv = setInterval(fetchAllResultBets, 30000)
    return () => { supabase.removeChannel(ch); clearInterval(iv) }
  }, [])

  async function fetchAllResultBets() {
    const { data } = await supabase.from("bets").select("match_id, bet_value, stake").eq("bet_type", "result")
    if (!data) return null
    const map = computeOddsMap(data)
    setOddsMap(map)
    return map
  }

  // ── Stake helpers ────────────────────────────────────────────────────────────
  function getStake(matchId) { return draftStakes[matchId] ?? DEFAULT_STAKE }
  function updateStake(matchId, value) {
    const max = Math.max(10, safeBalance - MIN_BALANCE)
    setDraftStakes(prev => ({ ...prev, [matchId]: Math.max(10, Math.min(max, value)) }))
  }
  function getAdvStake(matchId, betType) {
    return advDraftStakes[`${matchId}-${betType}`] ?? DEFAULT_STAKE
  }
  function updateAdvStake(matchId, betType, value) {
    const max = Math.max(10, safeBalance - MIN_BALANCE)
    setAdvDraftStakes(prev => ({ ...prev, [`${matchId}-${betType}`]: Math.max(10, Math.min(max, value)) }))
  }

  // ── Bet placement ────────────────────────────────────────────────────────────
  async function placeBet(matchId, betType, betValue, advStakeArg = null) {
    if (!user) return
    const id = parseInt(matchId)

    // ── Paris résultat ──────────────────────────────────────────
    if (betType === "result") {
      const stake = getStake(id)
      const liveOdds = oddsMap[id]?.odds?.[betValue] ?? DEFAULT_ODDS[betValue]

      const { data: existing } = await supabase
        .from("bets").select("id").eq("user_id", user.id).eq("match_id", id).eq("bet_type", "result").maybeSingle()

      if (existing) {
        const { error: updErr } = await supabase.rpc("update_bet", {
          p_match_id: id, p_bet_value: betValue, p_odds: liveOdds,
        })
        if (updErr) { console.error("update_bet:", updErr.message); return }
        setSavedOdds(prev => ({ ...prev, [id]: liveOdds }))
      } else {
        const { error: rpcErr } = await supabase.rpc("place_bet", {
          p_match_id: id, p_bet_type: "result", p_bet_value: betValue,
          p_stake: stake, p_odds: liveOdds,
        })
        if (rpcErr) { console.error("place_bet result:", rpcErr.message); return }
        // Refetch odds immédiatement pour inclure le nouveau pari dans le calcul
        const freshMap = await fetchAllResultBets()
        const freshOdds = freshMap?.[id]?.odds?.[betValue] ?? liveOdds
        setLocalCredits(prev => prev - stake)
        setSavedStakes(prev => ({ ...prev, [id]: stake }))
        setSavedOdds(prev => ({ ...prev, [id]: freshOdds }))
        onBalanceChange?.(stake)
        onBetPlaced?.()
      }
      setBets(prev => {
        const next = { ...prev, [`${id}-result`]: betValue }
        writeCache(user.id, next, { ...savedStakes, [id]: getStake(id) }, { ...savedOdds, [id]: liveOdds }, advSavedData)
        return next
      })
      return
    }

    // ── Paris avancés avec mise (total_goals, btts) ─────────────
    if (betType === "total_goals" || betType === "btts") {
      const stake = advStakeArg ?? getAdvStake(id, betType)
      const { error: rpcErr } = await supabase.rpc("place_bet", {
        p_match_id: id, p_bet_type: betType, p_bet_value: betValue,
        p_stake: stake, p_odds: null,
      })
      if (rpcErr) { console.error(`place_bet ${betType}:`, rpcErr.message); return }
      const fixedOdds = FIXED_ODDS[betType][betValue]
      setLocalCredits(prev => prev - stake)
      onBalanceChange?.(stake)
      const newAdvSaved = { ...advSavedData, [`${id}-${betType}`]: { stake, odds: fixedOdds } }
      setAdvSavedData(newAdvSaved)
      setBets(prev => {
        const next = { ...prev, [`${id}-${betType}`]: betValue }
        writeCache(user.id, next, savedStakes, savedOdds, newAdvSaved)
        return next
      })
      return
    }

    // ── Paris libres (scorer_N) : sans mise ─────────────────────
    const { data: existing } = await supabase
      .from("bets").select("id").eq("user_id", user.id).eq("match_id", id).eq("bet_type", betType).maybeSingle()
    if (existing) {
      await supabase.from("bets").update({ bet_value: betValue }).eq("id", existing.id)
    } else {
      await supabase.from("bets").insert({ user_id: user.id, match_id: id, bet_type: betType, bet_value: betValue })
    }
    setBets(prev => {
      const next = { ...prev, [`${id}-${betType}`]: betValue }
      writeCache(user.id, next, savedStakes, savedOdds, advSavedData)
      return next
    })
  }

  async function cancelBet(matchId, betType) {
    if (!user) return
    const id = parseInt(matchId)

    if (betType === "result") {
      const { error: rpcErr } = await supabase.rpc("cancel_bet", { p_match_id: id, p_bet_type: betType })
      if (rpcErr) { console.error("cancel_bet result:", rpcErr.message); return }
      const stake = savedStakes[id] ?? 0
      if (stake > 0) {
        setLocalCredits(prev => prev + stake)
        setSavedStakes(prev => { const n = { ...prev }; delete n[id]; return n })
        setSavedOdds(prev => { const n = { ...prev }; delete n[id]; return n })
        onBalanceChange?.(-stake)
        onBetPlaced?.()
      }
    } else if (betType === "total_goals" || betType === "btts") {
      const { error: rpcErr } = await supabase.rpc("cancel_bet", { p_match_id: id, p_bet_type: betType })
      if (rpcErr) { console.error(`cancel_bet ${betType}:`, rpcErr.message); return }
      const stake = advSavedData[`${id}-${betType}`]?.stake ?? 0
      if (stake > 0) {
        setLocalCredits(prev => prev + stake)
        onBalanceChange?.(-stake)
      }
      setAdvSavedData(prev => {
        const n = { ...prev }; delete n[`${id}-${betType}`]
        return n
      })
    } else {
      await supabase.from("bets").delete().eq("user_id", user.id).eq("match_id", id).eq("bet_type", betType)
    }

    setBets(prev => {
      const next = { ...prev }
      delete next[`${id}-${betType}`]
      writeCache(user.id, next, savedStakes, savedOdds, advSavedData)
      return next
    })
  }

  function toggleAdvanced(matchId) {
    setExpandedAdvanced(prev => {
      const next = new Set(prev)
      next.has(matchId) ? next.delete(matchId) : next.add(matchId)
      return next
    })
  }

  // ── Render ───────────────────────────────────────────────────────────────────
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

  const JOURNEES = [
    { id: "j1",     label: "Journée 1",    dates: "11–15 juin"         },
    { id: "j2",     label: "Journée 2",    dates: "16–20 juin"         },
    { id: "j3",     label: "Journée 3",    dates: "21–25 juin"         },
    { id: "finale", label: "Phase finale", dates: "26 juin – 19 juil." },
  ]
  const GROUP_ORDER = ["Groupe A","Groupe B","Groupe C","Groupe D","Groupe E","Groupe F","Groupe G","Groupe H","Groupe I","Groupe J","Groupe K","Groupe L"]
  const ROUND_ORDER = ["Round of 32","Round of 16","Quarts de finale","Demi-finales","3ème place","Finale"]

  const byJournee = {}, byJourneeGroup = {}, byJourneeRound = {}
  for (const m of matches) {
    if (!byJournee[m.journee]) byJournee[m.journee] = []
    byJournee[m.journee].push(m)
    if (m.journee !== "finale") {
      if (!byJourneeGroup[m.journee]) byJourneeGroup[m.journee] = {}
      if (!byJourneeGroup[m.journee][m.group]) byJourneeGroup[m.journee][m.group] = []
      byJourneeGroup[m.journee][m.group].push(m)
    } else {
      if (!byJourneeRound[m.finaleRound]) byJourneeRound[m.finaleRound] = []
      byJourneeRound[m.finaleRound].push(m)
    }
  }

  function toggleJournee(id) {
    setExpandedJournees(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function renderMatchCard(match, idx) {
        const matchId = parseInt(match.id)
        const myBet = bets[`${matchId}-result`]
        const isLive = match.state === "in"
        const isFinished = match.state === "post"
        // Lock as soon as the match's scheduled kickoff time has passed,
        // even before ESPN reflects state="in" (covers the ~60s polling gap)
        const kickoffPassed = match.date ? new Date(match.date) <= new Date() : false
        const isLocked = isLive || isFinished || kickoffPassed
        const isAdvancedOpen = expandedAdvanced.has(match.id)
        const stake = getStake(matchId)
        const canBet = safeBalance - stake >= MIN_BALANCE
        const maxStake = Math.max(10, safeBalance - MIN_BALANCE)
        const stakeMax = maxStake
        const matchData  = oddsMap[matchId] ?? {}
        const matchOdds  = matchData.odds  ?? DEFAULT_ODDS
        const matchPct   = matchData.pct   ?? {}
        const matchTotal = matchData.total ?? 0

        const scorerCount = Object.keys(bets).filter(k => k.startsWith(`${matchId}-scorer_`)).length
        const advancedCount = ADVANCED_TYPES.filter(t => bets[`${matchId}-${t}`] != null).length + scorerCount

        const save = (type, val) => placeBet(matchId, type, val)
        const cancel = type => cancelBet(matchId, type)
        const savedScorers = Object.fromEntries(
          Object.entries(bets)
            .filter(([k]) => k.startsWith(`${matchId}-scorer_`))
            .map(([k, v]) => [k.slice(`${matchId}-`.length), v])
        )

        // Saved odds & gain for placed result bet
        const lockedOdds = savedOdds[matchId] ?? null
        const lockedStake = savedStakes[matchId] ?? DEFAULT_STAKE
        const lockedGain = lockedOdds ? Math.round(lockedStake * lockedOdds) : lockedStake * 2

        if (/(winner|runner.?up|tbd)/i.test(`${match.home.name} ${match.away.name}`)) {
          return (
            <div key={match.id} style={{
              background: C.card, borderRadius: "16px", padding: "16px",
              marginBottom: "12px", border: `1px solid ${C.border}`,
              animationDelay: `${idx * 0.05}s`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                <span style={{
                  fontSize: "11px", fontWeight: "700", padding: "4px 10px", borderRadius: "20px",
                  background: C.primaryGlow, color: C.primary,
                  letterSpacing: "0.3px", textTransform: "uppercase",
                }}>
                  {formatFrenchDate(match.date)}
                </span>
                {match.venue && (
                  <div style={{ textAlign: "right", marginLeft: "8px" }}>
                    <div style={{ fontSize: "11px", color: C.muted }}>🏟 {match.venue}</div>
                    <div style={{ fontSize: "10px", color: C.dim }}>{match.city}</div>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
                  <span style={{ fontSize: "26px", fontWeight: "900", color: C.dim }}>?</span>
                </div>
                <span style={{ fontSize: "13px", fontWeight: "600", color: C.dim, letterSpacing: "2px", padding: "0 8px" }}>VS</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: "26px", fontWeight: "900", color: C.dim }}>?</span>
                </div>
              </div>
              <div style={{ textAlign: "center", marginTop: "10px", fontSize: "11px", color: C.dim, fontStyle: "italic" }}>
                Équipes à déterminer après la phase de groupes
              </div>
            </div>
          )
        }

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
                {isLive ? `● ${match.displayClock}` : isFinished ? "Terminé" : kickoffPassed ? "🔒 En attente" : formatFrenchDate(match.date)}
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
                {myBet ? (
                  /* Placed — cotes live (se mettent à jour avec les nouveaux parieurs) */
                  (() => {
                    const liveOddsVal = matchOdds[myBet] ?? lockedOdds
                    const liveGainVal = liveOddsVal ? Math.round(lockedStake * liveOddsVal) : lockedStake * 2
                    return (
                      <div style={{
                        padding: "10px 14px", borderRadius: "10px",
                        background: C.primaryGlow, border: `1px solid ${C.primary}33`,
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                      }}>
                        <div>
                          <div style={{ fontSize: "13px", color: C.primary, fontWeight: "700" }}>
                            ✓ {myBet === "home" ? match.home.name : myBet === "away" ? match.away.name : "Nul"}
                          </div>
                          <div style={{ fontSize: "11px", color: C.dim, marginTop: "2px", display: "flex", gap: "8px" }}>
                            {liveOddsVal && (
                              <span style={{ color: C.odds, fontWeight: "700" }}>{fmtOdds(liveOddsVal)}</span>
                            )}
                            <span>Mise : {lockedStake} pts</span>
                            <span style={{ color: C.primary }}>→ {liveGainVal} pts si correct</span>
                          </div>
                        </div>
                        <button onClick={() => cancel("result")} style={{
                          padding: "5px 10px", borderRadius: "20px",
                          background: C.cancel, border: `1px solid ${C.cancelText}44`,
                          color: C.cancelText, cursor: "pointer", fontSize: "11px", fontWeight: "700",
                        }}>✕ Annuler</button>
                      </div>
                    )
                  })()
                ) : localCredits == null ? (
                  <div style={{ padding: "12px", textAlign: "center", color: C.dim, fontSize: "12px" }}>
                    Chargement…
                  </div>
                ) : !canBet ? (
                  <div style={{
                    padding: "12px 14px", borderRadius: "10px",
                    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: "13px", color: "#f87171", fontWeight: "600" }}>
                      Crédits insuffisants — minimum {MIN_BALANCE + 10} requis pour parier.
                    </div>
                  </div>
                ) : (
                  /* No bet — prediction buttons with live odds + stake */
                  <>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                      <p style={{ fontSize: "11px", color: C.dim, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600", margin: 0 }}>
                        Pronostic · Cotes parimutuel
                      </p>
                      {matchTotal > 0 && (
                        <span style={{ fontSize: "10px", color: C.dim }}>
                          👥 {matchData.counts ? (matchData.counts.home + matchData.counts.draw + matchData.counts.away) : 0} parieur{(matchData.counts?.home + matchData.counts?.draw + matchData.counts?.away) > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                      {[
                        { label: match.home.name, value: "home" },
                        { label: "Nul",            value: "draw" },
                        { label: match.away.name,  value: "away" },
                      ].map(opt => {
                        const oddsVal = matchOdds[opt.value]
                        const pct     = matchPct[opt.value] ?? 0
                        const count   = matchData.counts?.[opt.value] ?? 0
                        const potGain = oddsVal ? Math.round(stake * oddsVal) : null
                        return (
                          <button key={opt.value} onClick={() => save("result", opt.value)} style={{
                            flex: 1, padding: "8px 6px",
                            border: `1.5px solid ${C.border}`,
                            borderRadius: "12px", cursor: "pointer",
                            background: C.inner,
                            color: C.muted,
                            textAlign: "center",
                            minWidth: 0, transition: "all 0.15s",
                          }}
                            onMouseEnter={e => {
                              e.currentTarget.style.borderColor = C.primary
                              e.currentTarget.style.background = C.primaryGlow
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.borderColor = C.border
                              e.currentTarget.style.background = C.inner
                            }}
                          >
                            <div style={{
                              fontSize: "10px", fontWeight: "600", color: C.muted,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }} translate="no">{opt.label}</div>
                            <div style={{
                              fontSize: "13px", fontWeight: "800",
                              color: oddsVal ? C.odds : C.dim,
                              marginTop: "4px", letterSpacing: "-0.3px",
                            }}>
                              {fmtOdds(oddsVal)}
                            </div>
                            <div style={{ fontSize: "9px", color: C.dim, marginTop: "3px" }}>
                              {count > 0 ? `👤 ${count}` : "—"}
                            </div>
                            {pct > 0 && (
                              <div style={{ fontSize: "9px", color: C.muted, marginTop: "1px" }}>
                                {pct}%
                              </div>
                            )}
                            {potGain && (
                              <div style={{ fontSize: "9px", color: C.primary, marginTop: "1px", fontWeight: "600" }}>
                                → {potGain} pts
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>

                    {/* Distribution bar */}
                    {matchTotal > 0 ? (
                      <div style={{ marginBottom: "10px" }}>
                        <div style={{ display: "flex", height: "5px", borderRadius: "4px", overflow: "hidden", gap: "1px" }}>
                          {matchPct.home > 0 && <div style={{ flex: matchPct.home, background: C.primary, borderRadius: "4px 0 0 4px" }} />}
                          {matchPct.draw > 0 && <div style={{ flex: matchPct.draw, background: "#64748b" }} />}
                          {matchPct.away > 0 && <div style={{ flex: matchPct.away, background: "#f59e0b", borderRadius: "0 4px 4px 0" }} />}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                          <span style={{ fontSize: "9px", color: C.primary, fontWeight: "600" }}>{matchPct.home || 0}% dom.</span>
                          <span style={{ fontSize: "9px", color: "#64748b", fontWeight: "600" }}>{matchPct.draw || 0}% nul</span>
                          <span style={{ fontSize: "9px", color: "#f59e0b", fontWeight: "600" }}>{matchPct.away || 0}% ext.</span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginBottom: "10px", textAlign: "center" }}>
                        <span style={{ fontSize: "10px", color: C.dim, fontStyle: "italic" }}>Sois le premier à parier sur ce match !</span>
                      </div>
                    )}

                    {/* Stake selector */}
                    <div style={{
                      background: C.inner, borderRadius: "10px", padding: "10px 12px",
                      border: `1px solid ${C.border}`,
                    }}>
                      <StakeStepper value={stake} onChange={v => updateStake(matchId, v)} max={stakeMax} />
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
                        <span style={{ fontSize: "10px", color: C.dim }}>
                          Gain = mise × cote · Perte = mise
                        </span>
                        <span style={{ fontSize: "10px", color: C.primary, fontWeight: "600" }}>
                          💰 {safeBalance} crédits
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* No bet + locked */}
            {isLocked && !myBet && (
              <div style={{
                marginTop: "4px", padding: "8px 14px", borderRadius: "8px",
                background: "rgba(100,116,139,0.1)", border: `1px solid ${C.border}`,
                textAlign: "center",
              }}>
                <span style={{ fontSize: "12px", color: C.dim }}>🔒 Paris fermés — aucun pronostic enregistré</span>
              </div>
            )}

            {/* Result bet — locked display */}
            {isLocked && myBet && (
              <div style={{ marginTop: "4px", padding: "8px 12px", borderRadius: "8px", background: C.primaryGlow, border: `1px solid ${C.primary}22`, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", color: C.primary, fontWeight: "600" }}>
                  ✓ {myBet === "home" ? match.home.name : myBet === "away" ? match.away.name : "Nul"}
                </span>
                <span style={{ fontSize: "11px", color: C.dim }}>
                  {lockedOdds && <span style={{ color: C.odds, fontWeight: "700", marginRight: "6px" }}>{fmtOdds(lockedOdds)}</span>}
                  Mise {lockedStake} pts
                </span>
              </div>
            )}

            {/* Advanced bets toggle */}
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
                    <TotalGoalsBet
                      savedValue={bets[`${matchId}-total_goals`]}
                      savedData={advSavedData[`${matchId}-total_goals`]}
                      draftStake={getAdvStake(matchId, "total_goals")}
                      onDraftStakeChange={v => updateAdvStake(matchId, "total_goals", v)}
                      onPlace={(val, stk) => placeBet(matchId, "total_goals", val, stk)}
                      onCancel={() => cancel("total_goals")}
                      maxStake={Math.max(10, safeBalance - MIN_BALANCE)}
                    />
                    <BttsBet
                      savedValue={bets[`${matchId}-btts`]}
                      savedData={advSavedData[`${matchId}-btts`]}
                      draftStake={getAdvStake(matchId, "btts")}
                      onDraftStakeChange={v => updateAdvStake(matchId, "btts", v)}
                      onPlace={(val, stk) => placeBet(matchId, "btts", val, stk)}
                      onCancel={() => cancel("btts")}
                      maxStake={Math.max(10, safeBalance - MIN_BALANCE)}
                    />
                    <ScorersBet savedScorers={savedScorers} onSave={(key, val) => save(key, val)} onCancel={key => cancel(key)} />
                  </div>
                )}
              </div>
            )}

            {isLocked && (
              <LockedAdvancedSummary bets={bets} matchId={matchId} />
            )}
          </div>
        )
  }

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", paddingBottom: "16px" }}>
      {JOURNEES.filter(j => j.id !== "finale" && byJournee[j.id]?.length).map(j => {
        const sections = j.id !== "finale"
          ? GROUP_ORDER
              .filter(grp => byJourneeGroup[j.id]?.[grp]?.length)
              .map(grp => ({ key: grp, label: grp, matches: byJourneeGroup[j.id][grp] }))
          : ROUND_ORDER
              .filter(r => byJourneeRound[r]?.length)
              .map(r => ({ key: r, label: r, matches: byJourneeRound[r] }))

        return (
          <div key={j.id}>
            {/* Journée title */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "20px 16px 8px" }}>
              <span style={{
                fontSize: "20px", fontWeight: "900", color: C.text,
                textTransform: "uppercase", letterSpacing: "0.3px", flexShrink: 0,
              }}>{j.label}</span>
              <span style={{ fontSize: "11px", color: C.muted, flexShrink: 0 }}>{j.dates}</span>
              <div style={{ flex: 1, height: "2px", background: `linear-gradient(90deg, ${C.border}, transparent)` }} />
            </div>

            {sections.map(({ key, label, matches: sm }) => (
              <div key={key}>
                {/* Group badge */}
                <div style={{ padding: "2px 16px 8px" }}>
                  <span style={{
                    display: "inline-block", fontSize: "11px", fontWeight: "700",
                    color: C.muted, background: C.card,
                    border: `1px solid ${C.border}`, borderRadius: "20px",
                    padding: "3px 10px", letterSpacing: "0.5px",
                  }}>{label}</span>
                </div>
                {/* Match cards — unchanged */}
                <div style={{ padding: "0 16px" }}>
                  {sm.map((match, idx) => renderMatchCard(match, idx))}
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
