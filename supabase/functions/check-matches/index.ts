import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=200&dates=20260611-20260719"
const INTERNAL_SECRET = Deno.env.get("INTERNAL_NOTIFY_SECRET") ?? ""

const adminClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

interface DbMatch {
  id: number
  home_team: string
  away_team: string
  status: string
  home_score: number | null
  away_score: number | null
}

interface MatchEvent {
  match_id: number
  title: string
  body: string
}

Deno.serve(async (req) => {
  if (req.headers.get("x-internal-secret") !== INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
  }

  // Fetch live ESPN data
  const espnRes = await fetch(ESPN_URL, { headers: { "User-Agent": "cdm-paris/1.0" } })
  if (!espnRes.ok) {
    return new Response(JSON.stringify({ error: "ESPN fetch failed" }), { status: 502 })
  }
  const espnData = await espnRes.json()

  // Fetch current DB state
  const { data: dbRows, error: dbErr } = await adminClient
    .from("matches")
    .select("id, home_team, away_team, status, home_score, away_score")
  if (dbErr) return new Response(JSON.stringify({ error: dbErr.message }), { status: 500 })

  const dbMap: Record<number, DbMatch> = {}
  for (const m of dbRows ?? []) dbMap[m.id] = m

  const events: MatchEvent[] = []
  const updates: DbMatch[] = []

  for (const ev of espnData.events ?? []) {
    const id = parseInt(ev.id)
    const comp = ev.competitions?.[0]
    if (!comp) continue

    const homeComp = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === "home")
    const awayComp = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === "away")
    if (!homeComp || !awayComp) continue

    const state     = comp.status?.type?.state ?? "pre"
    const status    = state === "in" ? "inplay" : state === "post" ? "finished" : "notstarted"
    const homeName  = homeComp.team?.displayName ?? homeComp.team?.shortDisplayName ?? "?"
    const awayName  = awayComp.team?.displayName ?? awayComp.team?.shortDisplayName ?? "?"
    const homeScore = state === "pre" ? null : parseInt(homeComp.score ?? "0")
    const awayScore = state === "pre" ? null : parseInt(awayComp.score ?? "0")
    const clock     = comp.status?.displayClock ?? ""

    const db = dbMap[id]
    if (!db) continue  // match not in DB yet, skip until import-matches runs

    const dbHome = db.home_score ?? 0
    const dbAway = db.away_score ?? 0

    // Match just kicked off
    if (db.status === "notstarted" && status === "inplay") {
      events.push({
        match_id: id,
        title: "⚽ Coup d'envoi !",
        body: `${homeName} vs ${awayName} vient de commencer`,
      })
    }

    // Goal scored (score increased)
    if (status === "inplay" && homeScore != null && awayScore != null) {
      if (homeScore > dbHome) {
        events.push({
          match_id: id,
          title: `🥅 BUT de ${homeName} !`,
          body: `${homeName} ${homeScore} – ${awayScore} ${awayName}${clock ? ` (${clock})` : ""}`,
        })
      } else if (awayScore > dbAway) {
        events.push({
          match_id: id,
          title: `🥅 BUT de ${awayName} !`,
          body: `${homeName} ${homeScore} – ${awayScore} ${awayName}${clock ? ` (${clock})` : ""}`,
        })
      }
    }

    // Match ended
    if (db.status === "inplay" && status === "finished") {
      const result =
        homeScore! > awayScore!   ? `Victoire ${homeName}` :
        awayScore! > homeScore!   ? `Victoire ${awayName}` :
                                    "Match nul"
      events.push({
        match_id: id,
        title: "🏁 Fin du match",
        body: `${homeName} ${homeScore} – ${awayScore} ${awayName} · ${result}`,
      })
    }

    // Queue DB update if anything changed
    if (
      status   !== db.status   ||
      homeScore !== db.home_score ||
      awayScore !== db.away_score
    ) {
      updates.push({ id, home_team: homeName, away_team: awayName, status, home_score: homeScore, away_score: awayScore })
    }
  }

  // Update DB (before sending notifications to keep state consistent)
  if (updates.length) {
    await adminClient.from("matches").upsert(updates, { onConflict: "id" })
  }

  // Auto-settle bets when a match finishes
  const finishedMatchIds = events
    .filter(ev => ev.title.startsWith("🏁"))
    .map(ev => ev.match_id)

  if (finishedMatchIds.length > 0) {
    await adminClient.functions.invoke("calculate-points", {
      headers: { "x-internal-secret": INTERNAL_SECRET },
      body: {},
    })
  }

  // Notify betters for each event
  let totalSent = 0
  for (const ev of events) {
    const { data: bets } = await adminClient
      .from("bets")
      .select("user_id")
      .eq("match_id", ev.match_id)

    const userIds = [...new Set((bets ?? []).map((b: { user_id: string }) => b.user_id))]
    if (!userIds.length) continue

    const notifyRes = await adminClient.functions.invoke("send-notification", {
      headers: { "x-internal-secret": INTERNAL_SECRET },
      body: { user_ids: userIds, title: ev.title, body: ev.body, url: "/" },
    })
    if (!notifyRes.error) totalSent += userIds.length
  }

  return new Response(
    JSON.stringify({ events: events.length, updates: updates.length, notifications_sent: totalSent, settled: finishedMatchIds.length }),
    { headers: { "Content-Type": "application/json" } }
  )
})
