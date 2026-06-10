import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const adminClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

Deno.serve(async (req) => {
  // ── Auth guard : JWT requis + is_admin = true ──────────────────
  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    })
  }
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    })
  }
  const { data: profile } = await userClient.from("profiles").select("is_admin").eq("id", user.id).single()
  if (!profile?.is_admin) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { "Content-Type": "application/json" },
    })
  }
  // ── /Auth guard ────────────────────────────────────────────────

  try {
    const { data: matches } = await adminClient
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

      const { data: bets } = await adminClient
        .from("bets")
        .select("id, user_id, bet_value, stake, odds")
        .eq("match_id", match.id)
        .eq("bet_type", "result")
        .eq("processed", false)

      for (const bet of bets ?? []) {
        const correct = bet.bet_value === result
        const stake = bet.stake ?? 10
        const odds = bet.odds ?? 2.0
        const payout = Math.round(stake * odds)

        if (correct) {
          await adminClient.rpc("award_bet_win", { uid: bet.user_id, delta_balance: payout })
        }

        await adminClient.from("bets").update({ processed: true, won: correct }).eq("id", bet.id)
        usersUpdated.add(bet.user_id)
      }
      matchesProcessed++
    }

    // Process pending combined bets
    const { data: pendingCombined } = await adminClient
      .from("combined_bets")
      .select("*")
      .eq("status", "pending")

    for (const cb of pendingCombined ?? []) {
      const matchIds = cb.match_ids
      const predictions = cb.predictions

      const { data: cbMatches } = await adminClient
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
        const gain = cb.stake * cb.multiplier
        await adminClient.rpc("adjust_credits", { uid: cb.user_id, delta: gain })
        await adminClient.rpc("adjust_xp",      { uid: cb.user_id, delta: gain })
      }

      await adminClient
        .from("combined_bets")
        .update({ status: allCorrect ? "won" : "lost" })
        .eq("id", cb.id)

      usersUpdated.add(cb.user_id)
    }

    // Envoyer les notifications push aux utilisateurs mis à jour
    const updatedIds = [...usersUpdated]
    if (updatedIds.length > 0) {
      await adminClient.functions.invoke("send-notification", {
        body: {
          user_ids: updatedIds,
          title: "Kick off — Résultats",
          body: "Tes paris ont été traités. Regarde tes résultats !",
          url: "/",
        },
      })
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
