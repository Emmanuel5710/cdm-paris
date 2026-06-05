import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  )

  // 1. Tous les matchs terminés
  const { data: matches, error: matchErr } = await supabase
    .from("matches")
    .select("id, home_score, away_score")
    .eq("status", "finished")

  if (matchErr) return json({ error: matchErr.message }, 500)
  if (!matches?.length) return json({ message: "Aucun match terminé", matchesProcessed: 0 })

  // 2. Pour chaque match, marquer les paris corrects/incorrects (2 requêtes par match)
  for (const match of matches) {
    const result = match.home_score > match.away_score ? "home"
      : match.away_score > match.home_score ? "away"
      : "draw"

    await Promise.all([
      supabase.from("bets")
        .update({ is_correct: true })
        .eq("match_id", match.id).eq("bet_type", "result").eq("bet_value", result),
      supabase.from("bets")
        .update({ is_correct: false })
        .eq("match_id", match.id).eq("bet_type", "result").neq("bet_value", result),
    ])
  }

  // 3. Agréger les points par utilisateur (10 pts par pari correct)
  const { data: correctBets } = await supabase
    .from("bets")
    .select("user_id")
    .eq("is_correct", true)

  const pointsMap: Record<string, number> = {}
  for (const bet of correctBets ?? []) {
    pointsMap[bet.user_id] = (pointsMap[bet.user_id] ?? 0) + 10
  }

  // 4. Mettre à jour points_total dans profiles
  await Promise.all(
    Object.entries(pointsMap).map(([userId, points]) =>
      supabase.from("profiles").update({ points_total: points }).eq("id", userId)
    )
  )

  return json({
    message: "Points calculés avec succès",
    matchesProcessed: matches.length,
    usersUpdated: Object.keys(pointsMap).length,
    pointsMap,
  })
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
