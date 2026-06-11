import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY")!
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!
const VAPID_SUBJECT = "mailto:emmanuelfayard57@gmail.com"

const adminClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

// ── Crypto helpers ─────────────────────────────────────────────────

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(s.length + (4 - s.length % 4) % 4, "=")
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}
function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}
function concat(...arrays: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(arrays.reduce((s, a) => s + a.length, 0))
  let offset = 0
  for (const a of arrays) { out.set(a, offset); offset += a.length }
  return out
}
async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data))
}

// ── RFC 8291 Web Push payload encryption ──────────────────────────

async function encryptPayload(p256dh: string, auth: string, plaintext: string): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const receiverPub = b64urlDecode(p256dh)  // 65 bytes
  const authSecret  = b64urlDecode(auth)     // 16 bytes

  // Ephemeral sender key pair
  const senderKP  = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])
  const senderPub = new Uint8Array(await crypto.subtle.exportKey("raw", senderKP.publicKey))

  // ECDH shared secret
  const receiverKey = await crypto.subtle.importKey("raw", receiverPub, { name: "ECDH", namedCurve: "P-256" }, false, [])
  const ecdhSecret  = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: receiverKey }, senderKP.privateKey, 256))

  const salt = crypto.getRandomValues(new Uint8Array(16))

  // IKM (RFC 8291 §3.3)
  const prkKey = await hmacSha256(authSecret, ecdhSecret)
  const keyInfo = concat(enc.encode("WebPush: info\0"), receiverPub, senderPub)
  const ikm = (await hmacSha256(prkKey, concat(keyInfo, new Uint8Array([1])))).slice(0, 32)

  // CEK + NONCE (RFC 8291 §3.4)
  const prkCek = await hmacSha256(salt, ikm)
  const cek   = (await hmacSha256(prkCek, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16)
  const nonce = (await hmacSha256(prkCek, concat(enc.encode("Content-Encoding: nonce\0"),    new Uint8Array([1])))).slice(0, 12)

  // AES-128-GCM encrypt (0x02 = end-of-record per RFC 8188)
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey,
      concat(enc.encode(plaintext), new Uint8Array([2])))
  )

  // RFC 8188 header: salt(16) | rs(4 BE) | idlen(1) | senderPub(65) | ciphertext
  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096, false)
  return concat(salt, rs, new Uint8Array([65]), senderPub, ciphertext)
}

// ── VAPID JWT ──────────────────────────────────────────────────────

async function buildVapidJwt(audience: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const enc = (o: object) => b64urlEncode(new TextEncoder().encode(JSON.stringify(o)))
  const sigInput = `${enc({ typ: "JWT", alg: "ES256" })}.${enc({ aud: audience, exp: now + 43200, sub: VAPID_SUBJECT })}`

  const key = await crypto.subtle.importKey("raw", b64urlDecode(VAPID_PRIVATE),
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"])
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(sigInput))
  return `${sigInput}.${b64urlEncode(sig)}`
}

// ── Push sender ────────────────────────────────────────────────────

async function sendPush(
  sub: { endpoint: string; p256dh: string; auth_key: string },
  title: string, body: string, url = "/"
): Promise<boolean> {
  const audience = new URL(sub.endpoint)
  const jwt = await buildVapidJwt(`${audience.protocol}//${audience.host}`)
  const payload = JSON.stringify({ title, body, url })
  const encrypted = await encryptPayload(sub.p256dh, sub.auth_key, payload)

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt},k=${VAPID_PUBLIC}`,
      TTL: "86400",
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
    },
    body: encrypted,
  })
  return res.ok || res.status === 201
}

// ── Main handler ───────────────────────────────────────────────────

const INTERNAL_SECRET = Deno.env.get("INTERNAL_NOTIFY_SECRET") ?? ""

Deno.serve(async (req) => {
  if (req.headers.get("x-internal-secret") !== INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
  }

  try {
    const { user_ids, title, body, url } = await req.json() as {
      user_ids: string[]; title: string; body: string; url?: string
    }
    if (!user_ids?.length) return new Response(JSON.stringify({ sent: 0 }), { headers: { "Content-Type": "application/json" } })

    const { data: subs } = await adminClient
      .from("push_subscriptions").select("endpoint, p256dh, auth_key").in("user_id", user_ids)

    if (!subs?.length) return new Response(JSON.stringify({ sent: 0 }), { headers: { "Content-Type": "application/json" } })

    let sent = 0
    const dead: string[] = []
    for (const sub of subs) {
      const ok = await sendPush(sub, title, body, url ?? "/")
      if (ok) sent++; else dead.push(sub.endpoint)
    }
    if (dead.length) await adminClient.from("push_subscriptions").delete().in("endpoint", dead)

    return new Response(JSON.stringify({ sent, removed: dead.length }), { headers: { "Content-Type": "application/json" } })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
