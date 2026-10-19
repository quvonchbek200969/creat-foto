// Tiniq: piksel algoritmlarini Node'da tekshirish.  Ishga tushirish:  node scripts/test-pixels.mjs
import {
  DEFAULTS, denoise, estimateNoise, autoLevels, sharpen, clarity, adjust, resize, processImage, effectiveScale, MAX_OUT_PIXELS,
  sharpenBoost, nearestAspect,
} from '../frontend/src/lib/pixels.js'
import { PRESETS, aiAfterParams, presetParams } from '../frontend/src/lib/presets.js'

let failed = 0
const ok = (cond, name, info = '') => {
  console.log(`${cond ? 'OK  ' : 'XATO'}  ${name}${info ? '  — ' + info : ''}`)
  if (!cond) failed++
}

// Deterministik tasodifiy son (har safar bir xil natija)
let seed = 12345
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd())

// Sintetik rasm: chap yarmi qora-kulrang, o'ng yarmi och; chegarasi xira (blur), ustiga shovqin
function makeImage(w, h, { noise = 0, soft = 6, dark = 90, light = 170 } = {}) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = 1 / (1 + Math.exp(-(x - w / 2) / soft)) // silliq o'tish
      const v = dark + (light - dark) * t
      const i = (y * w + x) * 4
      data[i] = v + gauss() * noise
      data[i + 1] = v * 0.95 + gauss() * noise
      data[i + 2] = v * 0.9 + gauss() * noise
      data[i + 3] = 255
    }
  return { data, width: w, height: h }
}
const lumAt = (d, w, x, y) => { const i = (y * w + x) * 4; return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] }
const edgeStrength = (d, w, h) => { // chegara yaqinidagi eng katta gradient
  let m = 0
  for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) m = Math.max(m, Math.abs(lumAt(d, w, x, y) - lumAt(d, w, x - 1, y)))
  return m
}
const variance = (d, w, x0, x1, y0, y1) => { // tekis maydondagi yorug'lik dispersiyasi
  let s = 0, s2 = 0, n = 0
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const l = lumAt(d, w, x, y); s += l; s2 += l * l; n++ }
  const m = s / n
  return s2 / n - m * m
}
const mean = (d, n) => { let s = 0; for (let i = 0; i < n * 4; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; return s / n }

const W = 160, H = 120

// Ustunlar bo'yicha o'rtalashtirilgan profil: shovqin o'zini yo'qotadi, faqat chegara qoladi
const columnProfile = (d, w, h) => {
  const p = new Float32Array(w)
  for (let x = 0; x < w; x++) { let s = 0; for (let y = 0; y < h; y++) s += lumAt(d, w, x, y); p[x] = s / h }
  return p
}
const maxStep = (p) => { let m = 0; for (let x = 1; x < p.length; x++) m = Math.max(m, Math.abs(p[x] - p[x - 1])); return m }

// 1) Aniqlik. Unsharp mask nazariyasi: chegara qiyaligi 1 + a·(1 − σe/√(σe²+σr²)) marta oshadi
//    (a = amount/100·2.4; logistik chegara: σe ≈ 1.81·soft). Kuchaytirish amount bilan monoton o'sishi kerak.
{
  const gain = (soft, amount, radius) => {
    const img = makeImage(W, H, { soft })
    const before = maxStep(columnProfile(img.data, W, H))
    sharpen(img.data, W, H, amount, radius)
    return maxStep(columnProfile(img.data, W, H)) / before
  }
  const g30 = gain(1.5, 30, 1.5), g60 = gain(1.5, 60, 1.5), g90 = gain(1.5, 90, 1.5)
  ok(g30 > 1.05 && g60 > g30 && g90 > g60, 'sharpen kuchi amount bilan monoton oshadi', `${g30.toFixed(2)} < ${g60.toFixed(2)} < ${g90.toFixed(2)}`)
  const se = 1.81 * 0.8, a = 0.9 * 2.4
  const theory = 1 + a * (1 - se / Math.sqrt(se * se + 1.5 * 1.5))
  const g = gain(0.8, 90, 1.5)
  ok(g > theory * 0.85, 'sharpen radiusga mos chegarada nazariy kuchaytirishga yaqin', `o'lchandi ${g.toFixed(2)}×, nazariy ${theory.toFixed(2)}×`)
}

// 2) Shovqinni kamaytirish: tekis maydonda dispersiya kamayishi, chegara esa saqlanishi kerak
{
  const img = makeImage(W, H, { noise: 14, soft: 1.5 })
  const v0 = variance(img.data, W, 5, 50, 5, 100)
  const p0 = columnProfile(img.data, W, H)
  denoise(img.data, W, H, 70)
  const v1 = variance(img.data, W, 5, 50, 5, 100)
  const p1 = columnProfile(img.data, W, H)
  const contrast = (p) => p.slice(100, 150).reduce((a, b) => a + b, 0) / 50 - p.slice(10, 60).reduce((a, b) => a + b, 0) / 50
  ok(v1 < v0 * 0.35, 'denoise shovqinni kamaytiradi', `dispersiya ${v0.toFixed(1)} → ${v1.toFixed(1)}`)
  ok(Math.abs(contrast(p1) - contrast(p0)) < 4, 'denoise chegara kontrastini saqlaydi', `${contrast(p0).toFixed(1)} → ${contrast(p1).toFixed(1)}`)
  ok(maxStep(p1) > maxStep(p0) * 0.8, 'denoise chegarani xiralashtirmaydi', `qadam ${maxStep(p0).toFixed(1)} → ${maxStep(p1).toFixed(1)}`)
}

// 2b) Shovqin darajasini baholash: berilgan σ ga yaqin chiqishi kerak (chegarali rasmda ham)
{
  const res = [0, 4, 10, 17, 30].map((sigma) => {
    const img = makeImage(W, H, { noise: sigma, soft: 1.5 })
    return [sigma, estimateNoise(img.data, W, H)]
  })
  // yorug'lik shovqini = kanal shovqinining ~0.7 qismi (3 kanal o'rtalashgani uchun)
  ok(res.every(([s, e]) => Math.abs(e - s * 0.65) < Math.max(1.2, s * 0.25)), 'estimateNoise haqiqiy shovqinga mos keladi',
    res.map(([s, e]) => `σ${s}→${e.toFixed(1)}`).join('  '))
}

// 2c) Kuchli shovqinli rasmda ham past sozlama (25%) sezilarli tozalashi kerak (namuna rasmdagi holat)
{
  const img = makeImage(W, H, { noise: 24, soft: 1.5 })
  const v0 = variance(img.data, W, 5, 50, 5, 100)
  const p0 = columnProfile(img.data, W, H)
  denoise(img.data, W, H, 25)
  const v1 = variance(img.data, W, 5, 50, 5, 100)
  const p1 = columnProfile(img.data, W, H)
  ok(v1 < v0 * 0.5, 'kuchli shovqinda denoise=25 dispersiyani kamida 2 barobar kamaytiradi', `${v0.toFixed(0)} → ${v1.toFixed(0)}`)
  ok(maxStep(p1) > maxStep(p0) * 0.8, 'va chegarani xiralashtirmaydi', `qadam ${maxStep(p0).toFixed(1)} → ${maxStep(p1).toFixed(1)}`)
  const clean = makeImage(W, H, { noise: 0, soft: 1.5 })
  const c0 = new Uint8ClampedArray(clean.data)
  denoise(clean.data, W, H, 100)
  let maxd = 0
  for (let i = 0; i < c0.length; i++) maxd = Math.max(maxd, Math.abs(c0[i] - clean.data[i]))
  ok(maxd < 6, 'toza rasmni denoise=100 deyarli o\'zgartirmaydi', `eng katta o'zgarish ${maxd}`)
}

// 3) Avto-tuzatish: qorong'i rasm yorishishi, kontrast oshishi kerak
{
  const img = makeImage(W, H, { dark: 20, light: 70 })
  const m0 = mean(img.data, W * H)
  autoLevels(img.data, W, H, 100)
  const m1 = mean(img.data, W * H)
  ok(m1 > m0 * 1.5, 'autoLevels qorong\'i rasmni yoritadi', `o'rtacha ${m0.toFixed(0)} → ${m1.toFixed(0)}`)
}

// 4) Tiniqlik: o'rta tonlarda lokal kontrast oshishi kerak
{
  const img = makeImage(W, H)
  const before = edgeStrength(img.data, W, H)
  clarity(img.data, W, H, 100)
  const after = edgeStrength(img.data, W, H)
  ok(after > before, 'clarity lokal kontrastni oshiradi', `${before.toFixed(1)} → ${after.toFixed(1)}`)
}

// 5) Rang: to'yinganlik kulrang pikselga ta'sir qilmasligi, rangliga ta'sir qilishi kerak
{
  const d = new Uint8ClampedArray([128, 128, 128, 255, 200, 100, 50, 255])
  adjust(d, 2, { ...DEFAULTS, saturation: 50 })
  ok(d[0] === 128 && d[1] === 128 && d[2] === 128, 'saturation kulrangni o\'zgartirmaydi')
  ok(d[4] - d[6] > 150, 'saturation rangni kuchaytiradi', `R-B farqi 150 → ${d[4] - d[6]}`)
}

// 6) Kattalashtirish: o'lcham, o'rtacha yorug'lik, tekis rang saqlanishi
{
  const flat = new Uint8ClampedArray(20 * 10 * 4).fill(100)
  const big = resize(flat, 20, 10, 80, 40)
  ok(big.length === 80 * 40 * 4, 'resize 4x o\'lchami to\'g\'ri')
  ok(Math.max(...big) === 100 && Math.min(...big.filter((_, i) => i % 4 !== 3)) === 100, 'resize tekis rangni buzmaydi')
  const img = makeImage(W, H)
  const up = resize(img.data, W, H, W * 2, H * 2)
  ok(Math.abs(mean(up, W * H * 4) - mean(img.data, W * H)) < 1.5, 'resize o\'rtacha yorug\'likni saqlaydi')
  const down = resize(img.data, W, H, W / 2, H / 2)
  ok(down.length === (W / 2) * (H / 2) * 4, 'resize kichraytirish ham ishlaydi')
}

// 7) To'liq konveyer
{
  const img = makeImage(W, H, { noise: 10, soft: 5 })
  const e0 = edgeStrength(img.data, W, H)
  const out = processImage(
    { data: new Uint8ClampedArray(img.data), width: W, height: H },
    { scale: 2, denoise: 40, auto: 50, sharpen: 70, radius: 1.5, clarity: 30, vibrance: 20 },
  )
  ok(out.width === W * 2 && out.height === H * 2 && out.data.length === W * 2 * H * 2 * 4, 'processImage 2x o\'lcham', `${out.width}x${out.height}`)
  ok(!out.data.some(Number.isNaN), 'processImage NaN chiqarmaydi')
  ok(edgeStrength(out.data, out.width, out.height) > e0 * 0.5, 'processImage chegarani yo\'qotmaydi')
  const noop = processImage({ data: new Uint8ClampedArray(img.data), width: W, height: H }, {})
  ok(noop.data.every((v, i) => v === img.data[i]), 'bo\'sh sozlamada rasm o\'zgarmaydi')
}

// 8) Xotira himoyasi
{
  ok(effectiveScale(100, 100, 4) === 4, 'kichik rasm to\'liq 4x')
  const s = effectiveScale(6000, 4000, 4)
  ok(s < 2 && 6000 * 4000 * s * s <= MAX_OUT_PIXELS * 1.001, 'katta rasmda kattalashtirish cheklanadi', `4x → ${s}x`)
  ok(effectiveScale(8000, 8000, 2) === 1, 'juda katta rasm kattalashtirilmaydi')
}

// 9) Tezlik (taxminiy): 2 MP rasmda to'liq konveyer
{
  const w = 1600, h = 1200
  const img = makeImage(w, h, { noise: 8 })
  const t0 = performance.now()
  processImage(img, { denoise: 40, auto: 50, sharpen: 60, clarity: 25, vibrance: 10 })
  const ms = performance.now() - t0
  ok(ms < 15000, '2 MP rasm oqilona vaqtda ishlanadi', `${(ms / 1000).toFixed(1)} s`)
}

// 10) Aniqlik radiusi rasm o'lchamiga moslanadi (katta suratda eski qat'iy 1.4 px deyarli sezilmasdi)
{
  ok(sharpenBoost(800) === 1 && sharpenBoost(1600) === 1 && sharpenBoost(3200) === 2 && sharpenBoost(9000) === 3, 'sharpenBoost: 1600 px gacha 1×, keyin o\'sadi, eng ko\'pi 3×')
  const Wb = 3200, Hb = 24
  const mk = (w = Wb, soft = 1.4) => makeImage(w, Hb, { soft })
  const step0 = maxStep(columnProfile(mk().data, Wb, Hb))
  const oldWay = mk()
  sharpen(oldWay.data, Wb, Hb, 85, 1.4) // eski usul: qat'iy radius
  const gOld = maxStep(columnProfile(oldWay.data, Wb, Hb)) / step0
  const full = processImage(mk(), { sharpen: 85, radius: 1.4 })
  const gFull = maxStep(columnProfile(full.data, Wb, Hb)) / step0
  ok(gFull > gOld * 1.15, '3200 px xira rasmda yangi aniqlik eskisidan sezilarli kuchli', `${gOld.toFixed(2)}× → ${gFull.toFixed(2)}×`)

  // Ko'rib chiqish (kichraytirilgan, k=0.5) to'liq o'lcham bilan bir xil kuchda bo'lishi kerak
  const half = { data: resize(mk().data, Wb, Hb, Wb / 2, Hb), width: Wb / 2, height: Hb }
  const stepHalf = maxStep(columnProfile(half.data, half.width, Hb))
  const prev = processImage(half, { sharpen: 85, radius: 1.4 }, 0.5)
  const gPrev = maxStep(columnProfile(prev.data, prev.width, Hb)) / stepHalf
  ok(Math.abs(gPrev - gFull) / gFull < 0.2, 'ko\'rib chiqish va to\'liq o\'lcham aniqligi mos', `${gPrev.toFixed(2)}× va ${gFull.toFixed(2)}×`)
}

// 10b) Shovqinli rasmda kuchli aniqlik donadorlikni portlatmasligi kerak, chegara esa baribir keskinlashishi kerak
{
  const noisy = () => makeImage(W, H, { noise: 14, soft: 1.5 })
  const base = noisy()
  const v0 = variance(base.data, W, 5, 50, 5, 100)
  const step0 = maxStep(columnProfile(base.data, W, H))
  const plain = noisy()
  sharpen(plain.data, W, H, 85, 1.4) // eshik yo'q (ikki o'tish): shovqin ham to'liq kuchayadi
  sharpen(plain.data, W, H, 85 * 0.45, 4.2)
  const vPlain = variance(plain.data, W, 5, 50, 5, 100)
  const gated = processImage(noisy(), { sharpen: 85, radius: 1.4 })
  const vGated = variance(gated.data, W, 5, 50, 5, 100)
  ok(vGated < vPlain * 0.5, 'shovqinli rasmda aniqlik shovqinni eshiksiz usuldan ancha kam kuchaytiradi', `dispersiya: asl ${v0.toFixed(0)}, eshiksiz ${vPlain.toFixed(0)}, eshikli ${vGated.toFixed(0)}`)
  ok(maxStep(columnProfile(gated.data, W, H)) > step0 * 1.3, 'va chegara baribir keskinlashadi', `${(maxStep(columnProfile(gated.data, W, H)) / step0).toFixed(2)}×`)
}

// 11) Kadr nisbati (Gemini'ga yuboriladi) va tayyor sozlamalar
{
  const cases = [[4000, 3000, '4:3'], [1000, 1000, '1:1'], [1080, 1920, '9:16'], [3000, 2000, '3:2'], [1234, 1000, '5:4'], [800, 1200, '2:3']]
  ok(cases.every(([w, h, a]) => nearestAspect(w, h) === a), 'nearestAspect eng yaqin kadr nisbatini tanlaydi', cases.map(([w, h]) => nearestAspect(w, h)).join(' '))
  ok(PRESETS.every((p) => p.params.sharpen >= 45), 'hamma tayyor sozlamada aniqlik sezilarli (>= 45)')
  ok(presetParams('auto').sharpen >= 80, '"Avto yaxshilash" kuchli aniqlik beradi')
  const a = aiAfterParams(2)
  ok(a.scale === 2 && a.denoise === 0 && a.auto === 0 && a.sharpen > 0, 'AI dan keyingi sozlama: faqat yengil aniqlik, shovqin/avto-tuzatish yo\'q')
}

console.log(failed ? `\n${failed} ta tekshiruv muvaffaqiyatsiz` : '\nHamma tekshiruvlar o\'tdi')
process.exit(failed ? 1 : 0)
