import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY")!
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!
const VAPID_SUBJECT = "mailto:emmanuelfayard57@gmail.com"

const adminClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

// ── VAPID helpers ──────────────────────────────────────────────────

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(s.length + (4 - s.length % 4) % 4, "=")
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}
function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

async function buildVapidJwt(audience: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header  = { typ: "JWT", alg: "ES256" }
  const payload = { aud: audience, exp: now + 43200, sub: VAPID_SUBJECT }
  const enc = (o: object) => b64urlEncode(new TextEncoder().encode(JSON.stringify(o)))
  const sigInput = `${enc(header)}.${enc(payload)}`

  // VAPID_PRIVATE is the raw base64url-encoded 32-byte EC private key
  const rawKey = b64urlDecode(VAPID_PRIVATE)
  const key = await crypto.subtle.importKey(
    "raw", rawKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
  )
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(sigInput)
  )
  return `${sigInput}.${b64urlEncode(sig)}`
}

// ── Push sender — empty push (no encrypted payload required) ──────

async function sendPush(endpoint: string): Promise<boolean> {
  const url = new URL(endpoint)
  const audience = `${url.protocol}//${url.host}`
  const jwt = await buildVapidJwt(audience)

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt},k=${VAPID_PUBLIC}`,
      TTL: "86400",
    },
  })
  if (!res.ok && res.status !== 201) {
    console.error(`Push failed ${res.status}:`, await res.text().catch(() => ""))
  }
  return res.ok || res.status === 201
}

// ── Main handler ───────────────────────────────────────────────────

const INTERNAL_SECRET = Deno.env.get("INTERNAL_NOTIFY_SECRET") ?? ""

Deno.serve(async (req) => {
  const secret = req.headers.get("x-internal-secret") ?? ""
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
  }

  try {
    const { user_ids } = await req.json() as { user_ids: string[] }

    if (!user_ids?.length) {
      return new Response(JSON.stringify({ error: "Missing user_ids" }), { status: 400 })
    }

    const { data: subs } = await adminClient
      .from("push_subscriptions")
      .select("endpoint, user_id")
      .in("user_id", user_ids)

    if (!subs?.length) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    let sent = 0
    const dead: string[] = []

    for (const sub of subs) {
      const ok = await sendPush(sub.endpoint)
      if (ok) sent++
      else dead.push(sub.endpoint)
    }

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
