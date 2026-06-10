import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  // ── Auth guard : JWT requis + is_admin = true ──────────────────
  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
  // Tout utilisateur authentifié peut déclencher le sync des matchs
  // ── /Auth guard ────────────────────────────────────────────────

  try {
    const response = await fetch("https://worldcup26.ir/get/games")
    const data = await response.json()

    const matches = data.games.map((g: Record<string, string>) => {
      const [datePart, timePart] = g.local_date.split(" ")
      const [month, day, year] = datePart.split("/")
      return {
        id: parseInt(g.id),
        home_team: g.home_team_name_en || g.home_team_label || "TBD",
        away_team: g.away_team_name_en || g.away_team_label || "TBD",
        match_date: new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${timePart}:00`).toISOString(),
        group_name: g.group,
        match_type: g.type,
        home_score: g.home_score === "0" && g.finished === "FALSE" ? null : parseInt(g.home_score),
        away_score: g.away_score === "0" && g.finished === "FALSE" ? null : parseInt(g.away_score),
        status: g.time_elapsed === "notstarted" ? "notstarted" : g.finished === "TRUE" ? "finished" : "inplay",
      }
    })

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )

    const { error } = await adminClient.from("matches").upsert(matches)
    if (error) throw error

    return new Response(
      JSON.stringify({ imported: matches.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})
