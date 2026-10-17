// sw.js mantig'ini Node'da soxta muhit bilan sinash. Ishga tushirish:  node scripts/test-sw.mjs
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'public', 'sw.js'), 'utf8')
let failed = 0
const ok = (c, n, i = '') => { console.log(`${c ? 'OK  ' : 'XATO'}  ${n}${i ? '  — ' + i : ''}`); if (!c) failed++ }

function makeEnv() {
  const store = new Map() // keshlar: nom -> Map(url -> Response)
  const listeners = {}
  const net = { online: true, calls: [], routes: {} } // routes: pathname -> () => Response
  const claimed = { n: 0 }
  const fetchFn = async (req) => {
    const url = typeof req === 'string' ? new URL(req, 'https://app.test').href : req.url
    net.calls.push(url)
    if (!net.online) throw new TypeError('Failed to fetch')
    const path = new URL(url).pathname
    const r = net.routes[path]
    return r ? r() : new Response('not found', { status: 404 })
  }
  const keyOf = (req) => (typeof req === 'string' ? new URL(req, 'https://app.test').href : req.url)
  const mkCache = (name) => ({
    async addAll(list) { for (const u of list) { const res = await fetchFn(u); if (!res.ok) throw new Error('addAll ' + u); store.get(name).set(keyOf(u), res) } },
    async put(req, res) { store.get(name).set(keyOf(req), res) },
    async keys() { return [...store.get(name).keys()].map((url) => ({ url })) },
  })
  const caches = {
    async open(name) { if (!store.has(name)) store.set(name, new Map()); return mkCache(name) },
    async keys() { return [...store.keys()] },
    async delete(name) { return store.delete(name) },
    async match(req) { for (const m of store.values()) { const hit = m.get(keyOf(req)); if (hit) return hit.clone() } return undefined },
  }
  const self = {
    location: { origin: 'https://app.test' },
    skipWaiting: async () => {},
    clients: { claim: async () => { claimed.n++ } },
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn) },
  }
  vm.runInNewContext(src, { self, caches, fetch: fetchFn, URL, Response, Promise, console })
  const fire = async (type, extra = {}) => {
    const waits = []
    const ev = { waitUntil: (p) => waits.push(p), ...extra }
    for (const fn of listeners[type] || []) fn(ev)
    await Promise.all(waits)
    return ev
  }
  const doFetch = async (req) => {
    const ev = { request: req, responded: false, respondWith(p) { this.responded = true; this.p = p } }
    for (const fn of listeners.fetch || []) fn(ev)
    return { responded: ev.responded, res: ev.responded ? await ev.p : null }
  }
  return { store, net, caches, claimed, fire, doFetch }
}

const html = (t = '<html>shell</html>') => () => new Response(t, { status: 200, headers: { 'content-type': 'text/html' } })
const js = (t = 'console.log(1)') => () => new Response(t, { status: 200, headers: { 'content-type': 'text/javascript' } })
const R = (method, path, mode = 'cors', origin = 'https://app.test') => ({ method, url: origin + path, mode })

// 1) install: qobiq keshlanadi
{
  const e = makeEnv()
  for (const p of ['/', '/favicon.svg', '/manifest.webmanifest', '/icons/icon-192.png']) e.net.routes[p] = html(p)
  await e.fire('install')
  const keys = [...(e.store.get('tiniq-v1')?.keys() || [])].map((u) => new URL(u).pathname)
  ok(keys.length === 4 && keys.includes('/') && keys.includes('/icons/icon-192.png'), 'install: qobiq fayllari keshlandi', keys.join(' '))
}

// 2) activate: eski keshlar o'chadi, yangisi qoladi
{
  const e = makeEnv()
  await e.caches.open('tiniq-v0'); await e.caches.open('boshqa'); await e.caches.open('tiniq-v1')
  await e.fire('activate')
  ok(JSON.stringify([...e.store.keys()]) === '["tiniq-v1"]' && e.claimed.n === 1, 'activate: eski keshlar o\'chdi, clients.claim chaqirildi', [...e.store.keys()].join())
}

// 3) Tegmasligi kerak bo'lgan so'rovlar
{
  const e = makeEnv()
  ok(!(await e.doFetch(R('POST', '/api'))).responded, 'POST so\'rovga tegmaydi')
  ok(!(await e.doFetch(R('GET', '/rest/v1/profiles', 'cors', 'https://xyz.supabase.co'))).responded, 'boshqa domen (Supabase) so\'roviga tegmaydi')
  ok(!(await e.doFetch(R('GET', '/functions/v1/api', 'cors', 'https://xyz.supabase.co'))).responded, 'Edge Function so\'roviga tegmaydi')
  ok(!(await e.doFetch(R('GET', '/tiniq.apk'))).responded, 'APK fayl keshlanmaydi')
  ok(!(await e.doFetch(R('GET', '/.well-known/assetlinks.json'))).responded, 'assetlinks.json keshlanmaydi')
}

// 4) Sahifa: tarmoq birinchi, oflayn bo'lsa keshdagi qobiq
{
  const e = makeEnv()
  e.net.routes['/'] = html('<html>v1</html>')
  const on = await e.doFetch(R('GET', '/', 'navigate'))
  ok(on.responded && (await on.res.text()) === '<html>v1</html>', 'onlayn: sahifa tarmoqdan keladi')
  await new Promise((r) => setTimeout(r, 10))
  e.net.routes['/'] = html('<html>v2</html>')
  const on2 = await e.doFetch(R('GET', '/', 'navigate'))
  ok((await on2.res.text()) === '<html>v2</html>', 'onlayn: yangi versiya darhol ko\'rinadi (eskisi emas)')
  await new Promise((r) => setTimeout(r, 10))
  e.net.online = false
  const off = await e.doFetch(R('GET', '/lang/en', 'navigate'))
  ok(off.responded && (await off.res.text()) === '<html>v2</html>', 'oflayn: oxirgi keshdagi qobiq ochiladi')
}

// 5) /assets/*: kesh birinchi, HTML javob keshlanmaydi
{
  const e = makeEnv()
  e.net.routes['/assets/app-abc.js'] = js('A')
  const before = e.net.calls.length
  const a = await e.doFetch(R('GET', '/assets/app-abc.js'))
  await a.res.text(); await new Promise((r) => setTimeout(r, 10))
  const b = await e.doFetch(R('GET', '/assets/app-abc.js'))
  ok((await b.res.text()) === 'A' && e.net.calls.length - before === 1, '/assets/: ikkinchi so\'rov keshdan, tarmoqqa chiqmaydi', `tarmoq so'rovlari: ${e.net.calls.length - before}`)
  e.net.routes['/assets/missing.js'] = html('SPA fallback')
  const m = await e.doFetch(R('GET', '/assets/missing.js'))
  await m.res.text(); await new Promise((r) => setTimeout(r, 10))
  const cached = [...(e.store.get('tiniq-v1')?.keys() || [])].some((u) => u.endsWith('missing.js'))
  ok(!cached, '/assets/ ostida HTML javob (yo\'q fayl) keshlanmaydi')
  e.net.online = false
  ok((await (await e.doFetch(R('GET', '/assets/app-abc.js'))).res.text()) === 'A', 'oflayn: /assets/ keshdan ishlaydi')
}

// 6) Boshqa statik fayllar: keshdagini darhol beradi, fonda yangilaydi; oflayn ishlaydi
{
  const e = makeEnv()
  e.net.routes['/favicon.svg'] = () => new Response('<svg>1</svg>', { status: 200 })
  const first = await e.doFetch(R('GET', '/favicon.svg'))
  await first.res.text(); await new Promise((r) => setTimeout(r, 10))
  e.net.routes['/favicon.svg'] = () => new Response('<svg>2</svg>', { status: 200 })
  const second = await e.doFetch(R('GET', '/favicon.svg'))
  ok((await second.res.text()) === '<svg>1</svg>', 'statik fayl: keshdagi nusxa darhol beriladi')
  await new Promise((r) => setTimeout(r, 10))
  e.net.online = false
  const third = await e.doFetch(R('GET', '/favicon.svg'))
  ok((await third.res.text()) === '<svg>2</svg>', 'statik fayl: fonda yangilangan nusxa keyingi safar chiqadi, oflayn ham ishlaydi')
}

console.log(failed ? `\n${failed} ta tekshiruv muvaffaqiyatsiz` : '\nHamma tekshiruvlar o\'tdi')
process.exit(failed ? 1 : 0)
