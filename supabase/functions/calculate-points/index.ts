import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

Deno.serve(async (_req) => {
  try {
    const { data: matches } = await supabase
      .from("matches")
      .select("id, home_score, away_score")
      .eq("status", "finished")

    let matchesProcessed = 0
    const usersUpdated = new Set()

    // Process unprocessed result bets
    for (const match of matches ?? []) {
      const hs = Number(match.home_score)
      const as_ = Number(match.away_score)
      const result = hs > as_ ? "home" : as_ > hs ? "away" : "draw"

      const { data: bets } = await supabase
        .from("bets")
        .select("id, user_id, bet_value, stake, odds")
        .eq("match_id", match.id)
        .eq("bet_type", "result")
        .eq("processed", false)

      for (const bet of bets ?? []) {
        const correct = bet.bet_value === result
        const stake = bet.stake ?? 10
        // Use stored odds for payout; fallback to 2.0 if no odds recorded
        const odds = bet.odds ?? 2.0
        const payout = Math.round(stake * odds)

        if (correct) {
          // Award: +1 point AND pay stake*odds (stake was already deducted on placement)
          await supabase.rpc("award_bet_win", { uid: bet.user_id, delta_balance: payout })
        }
        // Incorrect: stake already gone — nothing more to do

        await supabase.from("bets").update({ processed: true }).eq("id", bet.id)
        usersUpdated.add(bet.user_id)
      }
      matchesProcessed++
    }

    // Process pending combined bets
    const { data: pendingCombined } = await supabase
      .from("combined_bets")
      .select("*")
      .eq("status", "pending")

    for (const cb of pendingCombined ?? []) {
      const matchIds = cb.match_ids
      const predictions = cb.predictions

      const { data: cbMatches } = await supabase
        .from("matches")
        .select("id, home_score, away_score, status")
        .in("id", matchIds)

      if (!cbMatches || cbMatches.length < matchIds.length) continue
      if (!cbMatches.every((m) => m.status === "finished")) continue

      let allCorrect = true
      for (const m of cbMatches) {
        const hs = Number(m.home_score)
        const as_ = Number(m.away_score)
        const result = hs > as_ ? "home" : as_ > hs ? "away" : "draw"
        if (predictions[String(m.id)] !== result) { allCorrect = false; break }
      }

      if (allCorrect) {
        await supabase.rpc("adjust_balance", { uid: cb.user_id, delta: cb.stake * cb.multiplier })
      }

      await supabase
        .from("combined_bets")
        .update({ status: allCorrect ? "won" : "lost" })
        .eq("id", cb.id)

      usersUpdated.add(cb.user_id)
    }

    return new Response(
      JSON.stringify({ matchesProcessed, usersUpdated: usersUpdated.size }),
      { headers: { "Content-Type": "application/json" } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})
