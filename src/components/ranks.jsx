// Shared rank system — used by League.jsx and Ranking.jsx

export const RANKS = [
  { name: "Bronze",  abbrev: "BRZ", min: 0,    max: 99,
    color: "#CD7F32", colorLight: "#E09A50", colorDark: "#7A4010" },
  { name: "Argent",  abbrev: "ARG", min: 100,  max: 249,
    color: "#C0C0C0", colorLight: "#E0E0E0", colorDark: "#787878" },
  { name: "Or",      abbrev: "OR",  min: 250,  max: 499,
    color: "#FFD700", colorLight: "#FFE84D", colorDark: "#A07800" },
  { name: "Diamant", abbrev: "DIA", min: 500,  max: 999,
    color: "#00BFFF", colorLight: "#50D8FF", colorDark: "#006FA8" },
  { name: "Légende", abbrev: "LGD", min: 1000, max: null,
    color: "#9B59B6", colorLight: "#BF7FD8", colorDark: "#5B2878" },
]

export function getRank(pts) {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (pts >= RANKS[i].min) return RANKS[i]
  }
  return RANKS[0]
}

export function getNextRank(pts) {
  return RANKS.find(r => r.min > pts) ?? null
}

export function getRankProgress(pts) {
  const rank = getRank(pts)
  const next = getNextRank(pts)
  if (!next) return { pct: 100, rank, next: null }
  const pct = Math.round(((pts - rank.min) / (next.min - rank.min)) * 100)
  return { pct, rank, next }
}

// ─── SVG shield badge ─────────────────────────────────────────────────────────
// Shield path fits inside viewBox 0 0 40 48.
// At small sizes (< 28px), shows single initial letter.
// At larger sizes, shows 2-3 char abbreviation.

export function RankShield({ rank, size = 32 }) {
  const h = Math.round(size * 1.2)
  const gid = `rg-${rank.name}` // unique per rank name, safe for multiple instances
  const label = size >= 28 ? rank.abbrev : rank.name[0]
  const fs = size >= 36 ? 9.5 : size >= 28 ? 9 : 11 // SVG user-space font size

  return (
    <svg
      width={size} height={h}
      viewBox="0 0 40 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, display: "block" }}
      aria-label={rank.name}
    >
      <defs>
        <linearGradient id={gid} x1="20" y1="4" x2="20" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor={rank.colorLight} />
          <stop offset="100%" stopColor={rank.colorDark}  />
        </linearGradient>
      </defs>

      {/* Main shield body */}
      <path
        d="M20 4 L36 10 L36 28 C36 38 20 46 20 46 C20 46 4 38 4 28 L4 10 Z"
        fill={`url(#${gid})`}
        stroke={rank.color}
        strokeWidth="1.5"
      />

      {/* Inner highlight arc */}
      <path
        d="M20 8 L32 13 L32 27 C32 35 22 42 20 43"
        fill="none"
        stroke="rgba(255,255,255,0.28)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      {/* Rank label */}
      <text
        x="20" y="30"
        textAnchor="middle"
        dominantBaseline="auto"
        fill="rgba(255,255,255,0.95)"
        fontSize={fs}
        fontWeight="900"
        fontFamily="system-ui, -apple-system, Arial, sans-serif"
        letterSpacing="0.6"
      >
        {label}
      </text>
    </svg>
  )
}

// ─── Podium position circle ───────────────────────────────────────────────────

const PODIUM_COLORS = {
  1: { bg: "#FFD700", shadow: "rgba(255,215,0,0.55)" },
  2: { bg: "#C0C0C0", shadow: "rgba(192,192,192,0.45)" },
  3: { bg: "#CD7F32", shadow: "rgba(205,127,50,0.45)" },
}

export function PositionBadge({ position, size = 28 }) {
  const cfg = PODIUM_COLORS[position]
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: cfg?.bg ?? "#2d3f52",
      boxShadow: cfg ? `0 2px 10px ${cfg.shadow}` : "none",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: "800", fontSize: Math.round(size * 0.46),
      color: cfg ? "white" : "#64748b",
      fontFamily: "system-ui, sans-serif",
      letterSpacing: "-0.5px",
    }}>
      {position}
    </div>
  )
}
