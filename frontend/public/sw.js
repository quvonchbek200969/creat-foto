// Tiniq service worker: ilova qobig'ini keshlaydi (oflayn ochilish) va yangi versiyani tez yetkazadi.
// Supabase/AI so'rovlari, POST va boshqa domenlarga tegmaydi. Versiyani oshirsangiz, eski keshlar o'chadi.
const VERSION = 'tiniq-v1'
const SHELL = ['/', '/favicon.svg', '/manifest.webmanifest', '/icons/icon-192.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // Supabase, shriftlar va h.k.
  if (url.pathname.endsWith('.apk') || url.pathname.startsWith('/.well-known/')) return

  // Sahifa: avval tarmoq (yangi versiya), oflayn bo'lsa keshdagi qobiq
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(VERSION).then((c) => c.put('/', copy))
          return res
        })
        .catch(() => caches.match('/')),
    )
    return
  }

  // /assets/* nomida hash bor — o'zgarmaydi: avval kesh
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok && !/text\/html/i.test(res.headers.get('content-type') || '')) {
              const copy = res.clone()
              caches.open(VERSION).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
    return
  }

  // Qolgan statik fayllar: kesh + fonda yangilash
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()))
          return res
        })
        .catch(() => hit)
      return hit || net
    }),
  )
})
