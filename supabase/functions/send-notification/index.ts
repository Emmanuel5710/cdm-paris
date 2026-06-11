import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY")!
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!
const VAPID_SUBJECT = "mailto:emmanuelfayard57@gmail.com"

const adminClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

// ── VAPID signature helpers ────────────────────────────────────────

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + (4 - s.length % 4) % 4, "=")
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}
function b64urlEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

async function buildVapidHeaders(audience: string): Promise<Record<string, string>> {
  const now = Math.floor(Date.now() / 1000)
  const header = { typ: "JWT", alg: "ES256" }
  const payload = { aud: audience, exp: now + 43200, sub: VAPID_SUBJECT }
  const enc = (o: object) => b64urlEncode(new TextEncoder().encode(JSON.stringify(o)))
  const sigInput = `${enc(header)}.${enc(payload)}`

  const rawKey = b64urlDecode(VAPID_PRIVATE.replace(/^MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg/, "").slice(0, 44))
  const key = await crypto.subtle.importKey(
    "raw", rawKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
  )
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(sigInput)
  )
  const jwt = `${sigInput}.${b64urlEncode(sig)}`

  return {
    Authorization: `vapid t=${jwt},k=${VAPID_PUBLIC}`,
    "Content-Type": "application/json",
  }
}

// ── Push sender ────────────────────────────────────────────────────

async function sendPush(sub: { endpoint: string; p256dh: string; auth_key: string }, payload: string): Promise<boolean> {
  const url = new URL(sub.endpoint)
  const audience = `${url.protocol}//${url.host}`
  const headers = await buildVapidHeaders(audience)

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: { ...headers, "TTL": "86400" },
    body: payload,
  })
  return res.ok || res.status === 201
}

// ── Main handler ───────────────────────────────────────────────────

const INTERNAL_SECRET = Deno.env.get("INTERNAL_NOTIFY_SECRET") ?? ""

Deno.serve(async (req) => {
  // Only callable server-side (from calculate-points via service role)
  const secret = req.headers.get("x-internal-secret") ?? ""
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
  }

  try {
    const { user_ids, title, body, url } = await req.json() as {
      user_ids: string[]
      title:    string
      body:     string
      url?:     string
    }

    if (!user_ids?.length || !title || !body) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 })
    }

    const { data: subs } = await adminClient
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth_key")
      .in("user_id", user_ids)

    if (!subs?.length) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { "Content-Type": "application/json" } })
    }

    const payload = JSON.stringify({ title, body, url: url ?? "/" })
    let sent = 0
    const dead: string[] = []

    for (const sub of subs) {
      const ok = await sendPush(sub, payload)
      if (ok) sent++
      else dead.push(sub.endpoint)
    }

    // Supprimer les subscriptions expirées (410 Gone)
    if (dead.length) {
      await adminClient.from("push_subscriptions").delete().in("endpoint", dead)
    }

    return new Response(JSON.stringify({ sent, removed: dead.length }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
