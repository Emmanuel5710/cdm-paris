import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=200&dates=20260611-20260719"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

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

  try {
    const res = await fetch(ESPN_URL)
    const data = await res.json()

    const matches = (data.events ?? []).map((ev: Record<string, unknown>) => {
      const comp = (ev.competitions as Record<string, unknown>[])?.[0]
      const competitors = (comp?.competitors as Record<string, unknown>[]) ?? []
      const home = competitors.find((c) => c.homeAway === "home")
      const away = competitors.find((c) => c.homeAway === "away")
      const state = (comp?.status as Record<string, unknown>)?.type
        ? ((comp!.status as Record<string, unknown>).type as Record<string, unknown>).state as string
        : "pre"
      const status = state === "in" ? "inplay" : state === "post" ? "finished" : "notstarted"
      const homeScore = state === "pre" ? null : parseInt((home?.score as string) ?? "0")
      const awayScore = state === "pre" ? null : parseInt((away?.score as string) ?? "0")

      return {
        id: parseInt(ev.id as string),
        home_team: (home?.team as Record<string, unknown>)?.displayName ?? "TBD",
        away_team: (away?.team as Record<string, unknown>)?.displayName ?? "TBD",
        match_date: ev.date as string,
        group_name: null,
        match_type: "group",
        home_score: homeScore,
        away_score: awayScore,
        status,
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
