import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const adminClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

const INTERNAL_SECRET = Deno.env.get("INTERNAL_NOTIFY_SECRET") ?? ""

Deno.serve(async (req) => {
  // ── Auth : secret interne (appel serveur) OU JWT admin (appel manuel) ──
  const internalSecret = req.headers.get("x-internal-secret")
  const isInternalCall = internalSecret && internalSecret === INTERNAL_SECRET

  if (!isInternalCall) {
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
    const { data: profileData } = await userClient.rpc("get_my_profile")
    const profile = profileData?.[0]
    if (!profile?.is_admin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { "Content-Type": "application/json" },
      })
    }
  }
  // ── /Auth ──────────────────────────────────────────────────────

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
        .select("id, user_id, bet_value, stake")
        .eq("match_id", match.id)
        .eq("bet_type", "result")
        .eq("processed", false)

      // Parimutuel payout: recalculated server-side from actual stake distribution
      // Never trust client-provided odds stored in the DB
      const allBets = bets ?? []
      const totalPool = allBets.reduce((s, b) => s + (b.stake ?? 10), 0)
      const winnerPool = allBets.filter(b => b.bet_value === result).reduce((s, b) => s + (b.stake ?? 10), 0)
      const computedOdds = winnerPool > 0 ? totalPool / winnerPool : 2.0

      for (const bet of allBets) {
        const correct = bet.bet_value === result
        const stake = bet.stake ?? 10
        const payout = Math.round(stake * Math.max(1.05, Math.min(computedOdds, 50)))

        if (correct) {
          await adminClient.rpc("award_bet_win", { uid: bet.user_id, delta_balance: payout, original_stake: stake })
        } else {
          await adminClient.rpc("deduct_bet_loss", { uid: bet.user_id, stake })
        }

        await adminClient.from("bets").update({ processed: true, won: correct }).eq("id", bet.id)
        usersUpdated.add(bet.user_id)
      }

      // ── Paris total_goals ──────────────────────────────────────
      const { data: goalsBets } = await adminClient
        .from("bets")
        .select("id, user_id, bet_value, stake, odds")
        .eq("match_id", match.id)
        .eq("bet_type", "total_goals")
        .eq("processed", false)

      const actualGoals = hs + as_
      for (const bet of goalsBets ?? []) {
        const correct = bet.bet_value === "5+"
          ? actualGoals >= 5
          : actualGoals === parseInt(bet.bet_value)
        const stake = bet.stake ?? 10
        if (correct) {
          const payout = Math.round(stake * Number(bet.odds ?? 2.8))
          await adminClient.rpc("award_bet_win", { uid: bet.user_id, delta_balance: payout, original_stake: stake })
        } else {
          await adminClient.rpc("deduct_bet_loss", { uid: bet.user_id, stake })
        }
        await adminClient.from("bets").update({ processed: true, won: correct }).eq("id", bet.id)
        usersUpdated.add(bet.user_id)
      }

      // ── Paris btts (les deux équipes marquent) ─────────────────
      const { data: bttsBets } = await adminClient
        .from("bets")
        .select("id, user_id, bet_value, stake, odds")
        .eq("match_id", match.id)
        .eq("bet_type", "btts")
        .eq("processed", false)

      const bothScored = hs > 0 && as_ > 0
      for (const bet of bttsBets ?? []) {
        const correct = bet.bet_value === "yes" ? bothScored : !bothScored
        const stake = bet.stake ?? 10
        if (correct) {
          const payout = Math.round(stake * Number(bet.odds ?? 1.9))
          await adminClient.rpc("award_bet_win", { uid: bet.user_id, delta_balance: payout, original_stake: stake })
        } else {
          await adminClient.rpc("deduct_bet_loss", { uid: bet.user_id, stake })
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
      } else {
        // stake already deducted at placement; deduct same amount from XP
        await adminClient.rpc("deduct_bet_loss", { uid: cb.user_id, stake: cb.stake })
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
        headers: { "x-internal-secret": Deno.env.get("INTERNAL_NOTIFY_SECRET") ?? "" },
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
