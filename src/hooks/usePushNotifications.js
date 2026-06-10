import { useEffect, useState } from "react"
import { supabase } from "../supabase"

const VAPID_PUBLIC = "BDzFaVWZwhxGylgn79YvZAkgA-XFu-R7lExOTuWPZy0SG79llsh7z6Q45byWWidJj9kmetvuqJe3SRnyeFbQkWw"

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export function usePushNotifications(user) {
  const [status, setStatus] = useState("idle") // idle | granted | denied | unsupported

  useEffect(() => {
    if (!user || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported")
      return
    }
    setStatus(Notification.permission === "granted" ? "granted"
            : Notification.permission === "denied"  ? "denied"
            : "idle")
  }, [user])

  async function requestPermission() {
    if (!user || !("serviceWorker" in navigator)) return

    const permission = await Notification.requestPermission()
    if (permission !== "granted") { setStatus("denied"); return }
    setStatus("granted")

    try {
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      if (existing) { await saveSubscription(existing); return }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      })
      await saveSubscription(sub)
    } catch (err) {
      console.error("Push subscription error:", err)
    }
  }

  async function saveSubscription(sub) {
    const json = sub.toJSON()
    await supabase.from("push_subscriptions").upsert({
      user_id:  user.id,
      endpoint: json.endpoint,
      p256dh:   json.keys.p256dh,
      auth_key: json.keys.auth,
    }, { onConflict: "user_id,endpoint" })
  }

  return { status, requestPermission }
}
