// To'liq (E2E) sinov uchun lokal soxta Supabase: auth + profiles REST + HAQIQIY Edge Function kodi.
// Frontend'ni shunga ulab, ro'yxatdan o'tish, admin panel va AI oqimini brauzerda sinash mumkin.
// Ishga tushirish:  deno run -A --import-map scripts/fn-test/import_map.json scripts/fn-test/mock-server.js
import { DB } from './fake-supabase.js'

const PORT = 54321
let handler
const realServe = Deno.serve
Deno.serve = (h) => { handler = h }
Deno.env.set('SUPABASE_URL', `http://localhost:${PORT}`)
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-e2e')
await import('../../supabase/functions/api/index.ts')
Deno.serve = realServe

// Soxta Gemini: haqiqiy PNG (ikonka) qaytaradi, shunda brauzer natijani chizib ko'ra oladi
const ICON = await Deno.readFile(new URL('../../frontend/public/icons/icon-512.png', import.meta.url))
let b64 = ''
for (let i = 0; i < ICON.length; i += 0x8000) b64 += String.fromCharCode(...ICON.subarray(i, i + 0x8000))
b64 = btoa(b64)
const realFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
  const u = String(url)
  if (u.includes('generativelanguage.googleapis.com')) {
    const key = new Headers(init?.headers).get('x-goog-api-key')
    if (key !== 'AIza-e2e-good-key') return Response.json({ error: { message: 'API key not valid. Please pass a valid API key.' } }, { status: 400 })
    if (u.includes(':generateContent')) {
      await new Promise((r) => setTimeout(r, 800)) // AI "o'ylayotgan" vaqt
      return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: b64 } }] } }] })
    }
    return Response.json({ models: [] })
  }
  return realFetch(url, init)
}

let n = 0
const uid = () => `e2e00000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const users = [] // { id, email, password, name }

function session(u) {
  const tok = 'tok-' + u.id
  DB.tokens[tok] = { id: u.id, email: u.email }
  return {
    access_token: tok, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'r-' + u.id, user: { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: {}, user_metadata: { display_name: u.name }, created_at: new Date().toISOString() },
  }
}

Deno.serve({ port: PORT, onListen: () => console.log(`Soxta Supabase: http://localhost:${PORT}`) }, async (req) => {
  const url = new URL(req.url)
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': req.headers.get('access-control-request-headers') || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  }
  const out = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

  try {
    if (url.pathname === '/functions/v1/api') {
      const res = await handler(req)
      const h = new Headers(res.headers)
      for (const [k, v] of Object.entries(cors)) h.set(k, v)
      return new Response(await res.text(), { status: res.status, headers: h })
    }
    if (url.pathname === '/auth/v1/signup' && req.method === 'POST') {
      const b = await req.json()
      if (users.some((u) => u.email === b.email)) return out({ code: 422, msg: 'User already registered' }, 422)
      if ((b.password || '').length < 6) return out({ code: 422, msg: 'Password should be at least 6 characters.' }, 422)
      const u = { id: uid(), email: b.email, password: b.password, name: b.data?.display_name || '' }
      users.push(u)
      // setup.sql triggeri: birinchi foydalanuvchi — super admin
      const first = !DB.profiles.some((p) => p.role === 'superadmin')
      DB.profiles.push({ id: u.id, email: u.email, display_name: u.name || u.email.split('@')[0], role: first ? 'superadmin' : 'user', is_blocked: false, created_at: new Date().toISOString() })
      return out(session(u))
    }
    if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
      const b = await req.json()
      const u = users.find((x) => x.email === b.email && x.password === b.password)
      if (!u) return out({ error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' }, 400)
      return out(session(u))
    }
    if (url.pathname === '/auth/v1/user' && req.method === 'PUT') { // parolni almashtirish (updateUser)
      const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
      const u = users.find((x) => 'tok-' + x.id === tok)
      if (!u) return out({ code: 401, msg: 'invalid JWT' }, 401)
      const b = await req.json()
      if (b.password) {
        if (b.password.length < 6) return out({ code: 422, msg: 'Password should be at least 6 characters.' }, 422)
        if (b.password === u.password) return out({ code: 422, msg: 'New password should be different from the old password.' }, 422)
        u.password = b.password
      }
      return out({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, user_metadata: { display_name: u.name } })
    }
    if (url.pathname === '/auth/v1/logout') return new Response(null, { status: 204, headers: cors })
    if (url.pathname === '/rest/v1/profiles' && req.method === 'GET') {
      const id = (url.searchParams.get('id') || '').replace(/^eq\./, '')
      const rows = DB.profiles.filter((p) => !id || p.id === id)
      return out(req.headers.get('accept')?.includes('pgrst.object') ? rows[0] || null : rows)
    }
    return out({ error: 'mock: ' + url.pathname }, 404)
  } catch (e) {
    console.error(e)
    return out({ error: String(e) }, 500)
  }
})
