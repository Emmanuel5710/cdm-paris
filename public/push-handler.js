// Service Worker — gestionnaire de notifications push

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {}
  const title   = data.title   ?? "⚽ Kick off"
  const body    = data.body    ?? "Tes paris ont été traités !"
  const url     = data.url     ?? "/"
  const icon    = "/icon.png"
  const badge   = "/icon.png"

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      data: { url },
      vibrate: [200, 100, 200],
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? "/"
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
