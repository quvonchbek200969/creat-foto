// Edge Function mantiqini soxta Supabase va soxta AI servislari bilan sinash.
// Ishga tushirish:  deno run -A --import-map scripts/fn-test/import_map.json scripts/fn-test/run.js
import { DB } from './fake-supabase.js'

let handler
Deno.serve = (h) => { handler = h }
Deno.env.set('SUPABASE_URL', 'http://fake.local')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-secret')

let failed = 0
const ok = (cond, name, info = '') => {
  console.log(`${cond ? 'OK  ' : 'XATO'}  ${name}${info ? '  — ' + info : ''}`)
  if (!cond) failed++
}

/* ───────── Soxta tashqi servislar ───────── */
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 250, 251, 252])
const PNG_B64 = btoa(String.fromCharCode(...PNG))
const KEYS = {
  bad: 'AIza-bad-key-0001-SECRETBAD',
  good: 'AIza-good-key-0003-SECRETGOOD',
  oai: 'sk-test-openai-SECRETOAI',
  rep: 'r8_test_replicate_SECRETREP',
  stab: 'sk-stab-test-SECRETSTAB',
}
const calls = []
const j = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
let repPolls = 0

globalThis.fetch = async (url, init = {}) => {
  url = String(url)
  calls.push(url)
  const h = new Headers(init.headers || {})
  if (url.includes('generativelanguage.googleapis.com')) {
    const key = h.get('x-goog-api-key')
    if (url.includes(':generateContent')) {
      if (key === KEYS.bad) return j({ error: { message: `API key not valid: ${KEYS.bad}` } }, 403)
      const body = JSON.parse(init.body)
      const parts = body.contents[0].parts
      if (!parts[0].text.includes('Keep the exact same composition') || !parts[1].inline_data?.data) return j({ error: { message: 'bad request shape' } }, 400)
      return j({ candidates: [{ content: { parts: [{ text: 'done' }, { inlineData: { mimeType: 'image/png', data: PNG_B64 } }] } }] })
    }
    return key === KEYS.good ? j({ models: [] }) : j({ error: { message: 'API key not valid' } }, 400)
  }
  if (url.includes('api.openai.com/v1/images/edits')) {
    if (h.get('authorization') !== `Bearer ${KEYS.oai}`) return j({ error: { message: 'bad key' } }, 401)
    const fd = init.body
    if (!(fd instanceof FormData) || !(fd.get('image') instanceof Blob) || !fd.get('prompt')) return j({ error: { message: 'bad form' } }, 400)
    return j({ data: [{ b64_json: PNG_B64 }] })
  }
  if (url === 'https://api.replicate.com/v1/models/nightmareai/real-esrgan') return j({ latest_version: { id: 'ver123' } })
  if (url === 'https://api.replicate.com/v1/predictions') {
    const b = JSON.parse(init.body)
    if (b.version !== 'ver123' || !b.input.image.startsWith('data:image/jpeg;base64,') || b.input.scale !== 4) return j({ detail: 'bad input ' + JSON.stringify(b.input).slice(0, 80) }, 422)
    return j({ status: 'processing', urls: { get: 'https://api.replicate.com/v1/predictions/p1' } }, 201)
  }
  if (url === 'https://api.replicate.com/v1/predictions/p1') {
    repPolls++
    return j({ status: 'succeeded', output: 'https://replicate.delivery/out.png', urls: { get: url } })
  }
  if (url === 'https://replicate.delivery/out.png') return new Response(PNG, { headers: { 'content-type': 'image/png' } })
  if (url.includes('api.stability.ai/v2beta/stable-image/upscale/fast')) {
    if (h.get('authorization') !== `Bearer ${KEYS.stab}`) return j({ errors: ['bad key'] }, 401)
    return new Response(PNG, { headers: { 'content-type': 'image/png' } })
  }
  throw new Error('kutilmagan fetch: ' + url)
}

/* ───────── Funksiyani yuklash va foydalanuvchilar ───────── */
await import('../../supabase/functions/api/index.ts')

const mk = (id, role, extra = {}) => {
  DB.profiles.push({ id, email: `${id}@t.uz`, display_name: id, role, is_blocked: false, created_at: new Date().toISOString(), ...extra })
  DB.tokens['t-' + id] = { id, email: `${id}@t.uz` }
}
mk('SUPER000000', 'superadmin'); mk('ADMIN000000', 'admin'); mk('ADMIN200000', 'admin'); mk('USER0000000', 'user'); mk('USER2000000', 'user'); mk('BLOCKED0000', 'user', { is_blocked: true })

const allText = []
async function call(who, body) {
  const headers = { 'content-type': 'application/json' }
  if (who) headers.authorization = 'Bearer ' + (who.startsWith('t-') ? who : 't-' + who)
  const res = await handler(new Request('http://x/', { method: 'POST', headers, body: JSON.stringify(body) }))
  const text = await res.text()
  allText.push(text)
  return { status: res.status, json: text ? JSON.parse(text) : null }
}
const img = btoa('x'.repeat(2000))

/* 1) Autentifikatsiya */
{
  ok((await call(null, { action: 'status' })).status === 401, 'tokensiz so\'rov 401')
  ok((await call('t-xxx', { action: 'status' })).status === 401, 'noto\'g\'ri token 401')
  ok((await call('BLOCKED0000', { action: 'status' })).status === 403, 'bloklangan foydalanuvchi 403')
  const opt = await handler(new Request('http://x/', { method: 'OPTIONS' }))
  ok(opt.status === 200 && opt.headers.get('access-control-allow-origin') === '*', 'OPTIONS (CORS) javob beradi')
  ok((await call('USER0000000', { foo: 1 })).status === 400, 'action yo\'q — 400')
  ok((await call('USER0000000', { action: 'nima' })).status === 400, 'noma\'lum action — 400')
}

/* 2) Kalitsiz holat */
{
  const s = await call('USER0000000', { action: 'status' })
  ok(s.status === 200 && s.json.enabled && s.json.providers.length === 0 && s.json.limit === 10, 'status: kalit yo\'q, limit 10')
  const e = await call('USER0000000', { action: 'enhance', image: img, mime: 'image/jpeg' })
  ok(e.status === 503 && /sozlanmagan/.test(e.json.error), 'kalit yo\'q — enhance 503', e.json.error)
}

/* 3) Kalit qo'shish: ruxsat va tekshiruvlar */
{
  const add = (who, o) => call(who, { action: 'key-add', ...o })
  ok((await add('USER0000000', { provider: 'gemini', key: KEYS.good })).status === 403, 'oddiy foydalanuvchi kalit qo\'sha olmaydi')
  ok((await add('ADMIN000000', { provider: 'gemini', key: KEYS.good })).status === 403, 'admin kalit qo\'sha olmaydi')
  ok((await add('SUPER000000', { provider: 'nima', key: KEYS.good })).status === 400, 'noto\'g\'ri xizmat 400')
  ok((await add('SUPER000000', { provider: 'gemini', key: 'a b c d e f g h' })).status === 400, 'bo\'sh joyli kalit 400')
  ok((await add('SUPER000000', { provider: 'gemini', key: 'short' })).status === 400, 'juda qisqa kalit 400')
  ok((await add('SUPER000000', { provider: 'gemini', key: KEYS.good, model: 'x; drop table' })).status === 400, 'xavfli model nomi 400')
  ok((await add('SUPER000000', { provider: 'gemini', key: KEYS.good, priority: 0 })).status === 400, 'navbat 0 — 400')
  ok((await add('SUPER000000', { provider: 'gemini', key: KEYS.bad, label: 'yomon', priority: 1 })).status === 200, 'yomon kalit (navbat 1) qo\'shildi')
  ok((await add('SUPER000000', { provider: 'gemini', key: KEYS.good, label: 'yaxshi', priority: 2 })).status === 200, 'yaxshi kalit (navbat 2) qo\'shildi')
  ok((await call('USER0000000', { action: 'key-list' })).status === 403, 'foydalanuvchi key-list 403')
  ok((await call('ADMIN000000', { action: 'key-list' })).status === 403, 'admin key-list 403')
  const list = await call('SUPER000000', { action: 'key-list' })
  const raw = JSON.stringify(list.json)
  ok(list.json.keys.length === 2 && !raw.includes('key_value') && !raw.includes('SECRETGOOD') && !raw.includes('SECRETBAD'), 'key-list kalitni maskalaydi, to\'liq qiymatni bermaydi')
  ok(list.json.keys[0].masked.includes('...'), 'maska ko\'rinishi', list.json.keys[0].masked)
}

/* 4) Enhance: tekshiruvlar, kalit almashinuvi, xatolarni hisoblash */
{
  const big = await call('USER0000000', { action: 'enhance', image: 'A'.repeat(9_000_001), mime: 'image/jpeg' })
  ok(big.status === 413, 'juda katta rasm 413')
  ok((await call('USER0000000', { action: 'enhance', image: img, mime: 'image/gif' })).status === 400, 'qo\'llab-quvvatlanmaydigan format 400')
  ok((await call('USER0000000', { action: 'enhance', mime: 'image/jpeg' })).status === 400, 'rasmsiz so\'rov 400')
  ok((await call('USER0000000', { action: 'enhance', image: img, mime: 'image/jpeg', provider: 'zzz' })).status === 400, 'noma\'lum provayder 400')

  const r1 = await call('USER0000000', { action: 'enhance', image: img, mime: 'image/jpeg', mode: 'enhance' })
  ok(r1.status === 200 && r1.json.provider === 'gemini' && r1.json.image === PNG_B64 && r1.json.mime === 'image/png', 'enhance: yomon kalit o\'tkazib yuborilib, yaxshisi ishladi')
  const bad = DB.api_keys.find((k) => k.label === 'yomon'), good = DB.api_keys.find((k) => k.label === 'yaxshi')
  ok(bad.failure_count === 1 && bad.consecutive_failures === 1 && bad.is_active, 'yomon kalit xatosi hisoblandi')
  ok(!bad.last_error.includes('SECRETBAD') && bad.last_error.includes('***'), 'xato matnidagi kalit yashirildi', bad.last_error)
  ok(good.success_count === 1 && good.consecutive_failures === 0, 'yaxshi kalit muvaffaqiyati hisoblandi')
  ok(r1.json.used === 1 && r1.json.limit === 10, 'foydalanish hisobi 1/10', `${r1.json.used}/${r1.json.limit}`)

  await call('USER0000000', { action: 'enhance', image: img, mime: 'image/jpeg' })
  await call('USER0000000', { action: 'enhance', image: img, mime: 'image/jpeg' })
  ok(!bad.is_active && bad.consecutive_failures === 3, 'yaroqsiz (403) kalit 3 marta xatodan keyin o\'chirildi')
  const calls0 = calls.length
  await call('USER0000000', { action: 'enhance', image: img, mime: 'image/jpeg' })
  ok(calls.slice(calls0).length === 1, 'o\'chirilgan kalitga endi murojaat qilinmaydi')
  ok(DB.ai_log.filter((l) => !l.ok).length === 3 && DB.ai_log.filter((l) => l.ok).length === 4, 'jurnal: 3 xato, 4 muvaffaqiyat')
}

/* 5) Kunlik limit va sozlamalar */
{
  ok((await call('USER0000000', { action: 'settings-get' })).status === 403, 'foydalanuvchi sozlamani ko\'ra olmaydi')
  ok((await call('ADMIN000000', { action: 'settings-save', ai_enabled: 'on', ai_daily_limit: 5, ai_provider: 'auto' })).status === 403, 'admin sozlamani o\'zgartira olmaydi')
  const sv = (o) => call('SUPER000000', { action: 'settings-save', ai_enabled: 'on', ai_daily_limit: 5, ai_provider: 'auto', ...o })
  ok((await sv({ ai_daily_limit: -1 })).status === 400, 'manfiy limit 400')
  ok((await sv({ ai_provider: 'zzz' })).status === 400, 'noto\'g\'ri rejim 400')
  ok((await sv({ ai_daily_limit: 4 })).status === 200, 'limit 4 saqlandi')
  const lim = await call('USER0000000', { action: 'enhance', image: img, mime: 'image/jpeg' })
  ok(lim.status === 429 && /limit/i.test(lim.json.error), 'USER bugun 4 ta ishlatgan — 5-si 429', lim.json.error)
  const st = await call('USER0000000', { action: 'status' })
  ok(st.json.used === 4 && st.json.limit === 4 && !st.json.unlimited, 'status 4/4')
  ok((await call('ADMIN000000', { action: 'enhance', image: img, mime: 'image/jpeg' })).status === 200, 'admin uchun limit yo\'q')
  ok((await call('USER2000000', { action: 'enhance', image: img, mime: 'image/jpeg' })).status === 200, 'boshqa foydalanuvchining limiti alohida')
  await sv({ ai_daily_limit: 0 })
  ok((await call('USER0000000', { action: 'enhance', image: img, mime: 'image/jpeg' })).status === 200, 'limit 0 — cheklovsiz')
  await sv({ ai_enabled: 'off' })
  const off = await call('USER0000000', { action: 'enhance', image: img, mime: 'image/jpeg' })
  ok(off.status === 503 && /o'chirilgan/.test(off.json.error), 'AI o\'chirilsa 503')
  await sv({ ai_enabled: 'on' })
}

/* 6) Boshqa provayderlar */
{
  const add = (provider, key, extra = {}) => call('SUPER000000', { action: 'key-add', provider, key, ...extra })
  await add('openai', KEYS.oai); await add('replicate', KEYS.rep); await add('stability', KEYS.stab)
  const st = await call('USER0000000', { action: 'status' })
  ok(st.json.providers.map((p) => p.id).sort().join() === 'gemini,openai,replicate,stability', 'status 4 ta provayderni ko\'rsatadi')
  ok(st.json.providers.find((p) => p.id === 'stability').maxSide === 1000, 'Stability uchun maxSide 1000')

  const oai = await call('ADMIN000000', { action: 'enhance', image: img, mime: 'image/jpeg', provider: 'openai' })
  ok(oai.status === 200 && oai.json.provider === 'openai' && oai.json.image === PNG_B64, 'OpenAI: multipart so\'rov va b64 javob')
  repPolls = 0
  const rep = await call('ADMIN000000', { action: 'enhance', image: img, mime: 'image/jpeg', provider: 'replicate', mode: 'upscale' })
  ok(rep.status === 200 && rep.json.provider === 'replicate' && rep.json.image === PNG_B64 && repPolls === 1, 'Replicate: versiya topildi, kutildi, natija yuklandi (upscale → scale 4)', rep.json.error || '')
  const stab = await call('ADMIN000000', { action: 'enhance', image: img, mime: 'image/jpeg', provider: 'stability' })
  ok(stab.status === 200 && stab.json.provider === 'stability' && stab.json.image === PNG_B64, 'Stability: binar javob')
  await call('SUPER000000', { action: 'settings-save', ai_enabled: 'on', ai_daily_limit: 0, ai_provider: 'openai' })
  const forced = await call('ADMIN000000', { action: 'enhance', image: img, mime: 'image/jpeg', provider: 'stability' })
  ok(forced.json.provider === 'openai', 'ai_provider=openai bo\'lsa, foydalanuvchi tanlovi bekor bo\'ladi')
  await call('SUPER000000', { action: 'settings-save', ai_enabled: 'on', ai_daily_limit: 0, ai_provider: 'auto' })
}

/* 7) Kalit sinash, tahrirlash, o'chirish */
{
  const good = DB.api_keys.find((k) => k.label === 'yaxshi'), bad = DB.api_keys.find((k) => k.label === 'yomon')
  const t1 = await call('SUPER000000', { action: 'key-test', id: good.id })
  ok(t1.status === 200 && t1.json.ok, 'key-test: yaxshi kalit ishlaydi')
  const t2 = await call('SUPER000000', { action: 'key-test', id: bad.id })
  ok(t2.status === 400 && /yaroqsiz/.test(t2.json.error), 'key-test: yomon kalit "yaroqsiz"', t2.json.error)
  ok(!JSON.stringify(t2.json).includes('SECRETBAD'), 'key-test xatosida kalit yo\'q')
  ok((await call('USER0000000', { action: 'key-test', id: good.id })).status === 403, 'foydalanuvchi key-test 403')
  ok((await call('SUPER000000', { action: 'key-toggle', id: bad.id, active: true })).status === 200 && bad.is_active && bad.consecutive_failures === 0, 'o\'chirilgan kalit qayta yoqildi, hisoblagich tozalandi')
  const before = good.key_value
  await call('SUPER000000', { action: 'key-update', id: good.id, label: 'yangi nom', key: '' })
  ok(good.label === 'yangi nom' && good.key_value === before, 'key-update: bo\'sh kalit maydoni eskisini saqlaydi')
  await call('SUPER000000', { action: 'key-update', id: good.id, key: 'AIza-new-key-9999-SECRETNEW' })
  ok(good.key_value.endsWith('SECRETNEW'), 'key-update: yangi kalit yozildi')
  await call('SUPER000000', { action: 'key-delete', id: bad.id })
  ok(!DB.api_keys.includes(bad), 'key-delete ishladi')
}

/* 8) Foydalanuvchilarni boshqarish */
{
  const lu = await call('ADMIN000000', { action: 'user-list' })
  ok(lu.json.users.every((u) => u.role === 'user'), 'admin faqat oddiy foydalanuvchilarni ko\'radi', `${lu.json.users.length} ta`)
  const ls = await call('SUPER000000', { action: 'user-list' })
  ok(ls.json.users.some((u) => u.role === 'superadmin') && ls.json.users.length === 6, 'super admin hammani ko\'radi')
  ok(ls.json.users.find((u) => u.id === 'USER0000000').today > 0, 'bugungi foydalanish hisobi ro\'yxatda')
  ok((await call('USER0000000', { action: 'user-list' })).status === 403, 'oddiy foydalanuvchi ro\'yxatni ko\'ra olmaydi')

  ok((await call('ADMIN000000', { action: 'user-block', id: 'USER2000000', blocked: true })).status === 200 && DB.profiles.find((p) => p.id === 'USER2000000').is_blocked, 'admin oddiy foydalanuvchini blokladi')
  ok(DB.authCalls.some((c) => c[0] === 'update' && c[1] === 'USER2000000' && c[2].ban_duration !== 'none'), 'auth darajasida ham ban qo\'yildi')
  ok((await call('USER2000000', { action: 'status' })).status === 403, 'bloklangan foydalanuvchi darhol kira olmaydi')
  await call('ADMIN000000', { action: 'user-block', id: 'USER2000000', blocked: false })
  ok((await call('USER2000000', { action: 'status' })).status === 200, 'blokdan chiqarilgach yana ishlaydi')
  ok((await call('ADMIN000000', { action: 'user-block', id: 'ADMIN200000', blocked: true })).status === 403, 'admin boshqa adminni bloklay olmaydi')
  ok((await call('ADMIN000000', { action: 'user-block', id: 'SUPER000000', blocked: true })).status === 403, 'admin super adminni bloklay olmaydi')
  ok((await call('SUPER000000', { action: 'user-block', id: 'SUPER000000', blocked: true })).status === 400, 'super admin o\'zini bloklay olmaydi')
  ok((await call('USER0000000', { action: 'user-block', id: 'USER2000000', blocked: true })).status === 403, 'oddiy foydalanuvchi bloklay olmaydi')

  ok((await call('ADMIN000000', { action: 'set-role', id: 'USER2000000', role: 'admin' })).status === 403, 'admin rol bera olmaydi')
  ok((await call('SUPER000000', { action: 'set-role', id: 'USER2000000', role: 'superadmin' })).status === 400, 'superadmin rolini berib bo\'lmaydi')
  ok((await call('SUPER000000', { action: 'set-role', id: 'USER2000000', role: 'admin' })).status === 200 && DB.profiles.find((p) => p.id === 'USER2000000').role === 'admin', 'super admin rol berdi')
  ok((await call('SUPER000000', { action: 'set-role', id: 'SUPER000000', role: 'user' })).status === 400, 'super admin o\'z rolini o\'zgartira olmaydi')
  ok((await call('ADMIN000000', { action: 'user-delete', id: 'USER0000000' })).status === 403, 'admin o\'chira olmaydi')
  ok((await call('SUPER000000', { action: 'user-delete', id: 'ADMIN200000' })).status === 200 && !DB.profiles.some((p) => p.id === 'ADMIN200000'), 'super admin foydalanuvchini o\'chirdi')
  ok((await call('SUPER000000', { action: 'user-delete', id: 'NOUSER-12345' })).status === 404, 'mavjud bo\'lmagan foydalanuvchi 404')
}

/* 9) Statistika */
{
  const s = await call('ADMIN000000', { action: 'stats' })
  ok(s.status === 200 && s.json.requestsToday > 0 && s.json.activeKeys === 4 && s.json.failures7d === 3, 'stats admin uchun ishlaydi', JSON.stringify(s.json))
  ok((await call('USER0000000', { action: 'stats' })).status === 403, 'stats oddiy foydalanuvchiga yopiq')
}

/* 10) Hech bir javobda xom kalit sizmaganini tekshirish */
{
  const leaked = Object.values(KEYS).concat(['SECRETNEW', 'service-role-secret']).filter((k) => allText.some((t) => t.includes(k)))
  ok(leaked.length === 0, `${allText.length} ta javobning birortasida kalit sizmagan`, leaked.join(', '))
}

console.log(failed ? `\n${failed} ta tekshiruv muvaffaqiyatsiz` : '\nHamma tekshiruvlar o\'tdi')
Deno.exit(failed ? 1 : 0)
