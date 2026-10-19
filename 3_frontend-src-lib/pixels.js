// Tiniq — piksellar ustida ishlov berish.
// Sof JavaScript: brauzer Worker'ida ham, Node'da ham (test) bir xil ishlaydi.
// Barcha funksiyalar RGBA Uint8ClampedArray bilan ishlaydi va uni joyida o'zgartiradi
// (resize bundan mustasno — u yangi massiv qaytaradi).

export const DEFAULTS = {
  scale: 1, // kattalashtirish: 1, 2, 3, 4
  denoise: 0, // shovqinni kamaytirish 0..100
  auto: 0, // avto-tuzatish (yorug'lik va kontrast) 0..100
  deblur: 0, // xiralikni tiklash (dekonvolyutsiya) 0..100 — xira/fokussiz rasm uchun eng kuchli mahalliy usul
  sharpen: 0, // aniqlik 0..100
  radius: 1.2, // aniqlik radiusi (piksel)
  clarity: 0, // tiniqlik (lokal kontrast) 0..100
  brightness: 0, // -100..100
  contrast: 0, // -100..100
  saturation: 0, // -100..100
  vibrance: 0, // 0..100
  warmth: 0, // -100..100
}

// Chiqish rasmi shu pikselga yetganda kattalashtirish avtomatik kamaytiriladi (xotira himoyasi)
export const MAX_OUT_PIXELS = 36_000_000

// scale kasr bo'lishi mumkin (masalan, 4K maqsadi uchun 3.41×); 1 dan kichik qiymat — kattalashtirmaslik
export function effectiveScale(w, h, scale, maxOut = MAX_OUT_PIXELS) {
  const s = Math.max(1, Math.floor((Number(scale) || 1) * 1000) / 1000)
  if (s === 1) return 1
  const cap = Math.sqrt(maxOut / (w * h))
  return Math.max(1, Math.min(s, Math.floor(cap * 1000) / 1000))
}

/* ───────── Yordamchi: yorug'lik va Gauss xiralashtirish ───────── */

function lumaOf(d, n) {
  const L = new Float32Array(n)
  for (let i = 0, j = 0; i < n; i++, j += 4) L[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]
  return L
}

function boxH(src, dst, w, h, r) {
  const k = 1 / (2 * r + 1)
  for (let y = 0; y < h; y++) {
    const o = y * w
    let sum = 0
    for (let i = -r; i <= r; i++) sum += src[o + Math.min(w - 1, Math.max(0, i))]
    dst[o] = sum * k
    for (let x = 1; x < w; x++) {
      sum += src[o + Math.min(w - 1, x + r)] - src[o + Math.max(0, x - r - 1)]
      dst[o + x] = sum * k
    }
  }
}

function boxV(src, dst, w, h, r) {
  const k = 1 / (2 * r + 1)
  for (let x = 0; x < w; x++) {
    let sum = 0
    for (let i = -r; i <= r; i++) sum += src[Math.min(h - 1, Math.max(0, i)) * w + x]
    dst[x] = sum * k
    for (let y = 1; y < h; y++) {
      sum += src[Math.min(h - 1, y + r) * w + x] - src[Math.max(0, y - r - 1) * w + x]
      dst[y * w + x] = sum * k
    }
  }
}

function boxSizes(sigma, n = 3) {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1)
  let wl = Math.floor(wIdeal)
  if (wl % 2 === 0) wl--
  const wu = wl + 2
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4))
  const sizes = []
  for (let i = 0; i < n; i++) sizes.push(i < m ? wl : wu)
  return sizes
}

// Gauss xiralashtirish (3 ta quti filtri bilan yaqinlashtirilgan). Yangi Float32Array qaytaradi.
export function gaussBlur(src, w, h, sigma) {
  let a = new Float32Array(src)
  if (sigma < 0.35) return a
  let b = new Float32Array(src.length)
  for (const size of boxSizes(sigma)) {
    const r = Math.max(1, (size - 1) >> 1)
    boxH(a, b, w, h, r)
    boxV(b, a, w, h, r)
  }
  return a
}

/* ───────── Shovqinni kamaytirish (bilateral filtr) ───────── */

// Shovqin darajasini (yorug'lik bo'yicha standart og'ish, 0..255) baholaydi — Immerkaer usuli.
// Laplas-turi yadro tekis joyda faqat shovqinni "ushlaydi" (javob std = 6σ). Medianadan foydalanilgani uchun
// chegaralar va tekstura bahoni buzmaydi.
export function estimateNoise(d, w, h) {
  if (w < 8 || h < 8) return 0
  const stride = Math.max(2, Math.ceil(Math.sqrt((w * h) / 200000)))
  const vals = []
  const lum = (x, y) => { const i = (y * w + x) * 4; return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] }
  for (let y = 1; y < h - 1; y += stride) {
    for (let x = 1; x < w - 1; x += stride) {
      const v = 4 * lum(x, y)
        - 2 * (lum(x - 1, y) + lum(x + 1, y) + lum(x, y - 1) + lum(x, y + 1))
        + lum(x - 1, y - 1) + lum(x + 1, y - 1) + lum(x - 1, y + 1) + lum(x + 1, y + 1)
      vals.push(Math.abs(v))
    }
  }
  vals.sort((a, b) => a - b)
  return vals[vals.length >> 1] / (0.6745 * 6)
}

export function denoise(d, w, h, strength) {
  if (strength <= 0) return
  const s = strength / 100
  const passes = strength > 60 ? 2 : 1
  const R = 2
  // Filtr sezgirligi rasmdagi haqiqiy shovqin darajasiga moslanadi (3 kanal farqlari yig'indisi birligida):
  // slayder "shovqinning qancha qismini olib tashlash"ni bildiradi. Toza rasmda ham kichik asosiy qiymat qoladi.
  const noise = estimateNoise(d, w, h)
  const sigmaR = Math.max(8 + s * 20, noise * 3 * (0.7 + s * 2))
  const sigmaS = 1.2 + s * 0.9
  const range = new Float32Array(766)
  for (let i = 0; i < 766; i++) range[i] = Math.exp(-(i * i) / (2 * sigmaR * sigmaR))
  const side = 2 * R + 1
  const spatial = new Float32Array(side * side)
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) spatial[(dy + R) * side + dx + R] = Math.exp(-(dx * dx + dy * dy) / (2 * sigmaS * sigmaS))

  for (let p = 0; p < passes; p++) {
    const src = new Uint8ClampedArray(d)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = (y * w + x) * 4
        const r0 = src[c], g0 = src[c + 1], b0 = src[c + 2]
        let sr = 0, sg = 0, sb = 0, sw = 0
        for (let dy = -R; dy <= R; dy++) {
          const yy = y + dy < 0 ? 0 : y + dy >= h ? h - 1 : y + dy
          for (let dx = -R; dx <= R; dx++) {
            const xx = x + dx < 0 ? 0 : x + dx >= w ? w - 1 : x + dx
            const q = (yy * w + xx) * 4
            const r = src[q], g = src[q + 1], b = src[q + 2]
            const diff = Math.abs(r - r0) + Math.abs(g - g0) + Math.abs(b - b0)
            const wt = spatial[(dy + R) * side + dx + R] * range[diff]
            sr += r * wt; sg += g * wt; sb += b * wt; sw += wt
          }
        }
        d[c] = sr / sw; d[c + 1] = sg / sw; d[c + 2] = sb / sw
      }
    }
  }
}

/* ───────── Avto-tuzatish: yorug'lik darajalari va gamma ───────── */

export function autoLevels(d, w, h, amount) {
  if (amount <= 0) return
  const n = w * h
  const hist = new Uint32Array(256)
  let sum = 0
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const l = (0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]) | 0
    hist[l]++
    sum += l
  }
  const clip = n * 0.004
  let acc = 0, lo = 0
  for (; lo < 255; lo++) { acc += hist[lo]; if (acc > clip) break }
  acc = 0
  let hi = 255
  for (; hi > 0; hi--) { acc += hist[hi]; if (acc > clip) break }
  if (hi - lo < 40) { lo = 0; hi = 255 }

  const a = amount / 100
  const lo2 = lo * a
  const hi2 = 255 - (255 - hi) * a
  const meanN = Math.min(0.95, Math.max(0.05, (sum / n - lo2) / (hi2 - lo2)))
  const gammaFull = Math.min(1.6, Math.max(0.6, Math.log(0.47) / Math.log(meanN)))
  const gamma = 1 + (gammaFull - 1) * a * 0.8

  const lut = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) {
    const x = Math.min(1, Math.max(0, (v - lo2) / (hi2 - lo2)))
    lut[v] = Math.pow(x, gamma) * 255
  }
  for (let i = 0; i < n * 4; i += 4) {
    d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]
  }
}

/* ───────── Tiniqlik (lokal kontrast) va aniqlik (unsharp mask) ───────── */

export function clarity(d, w, h, amount) {
  if (amount <= 0) return
  const n = w * h
  const L = lumaOf(d, n)
  const sigma = Math.min(60, Math.max(3, Math.max(w, h) / 70))
  const B = gaussBlur(L, w, h, sigma)
  const a = (amount / 100) * 1.2
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const t = L[i] / 127.5 - 1
    const mid = 1 - t * t // faqat o'rta tonlarda kuchli, soya va yorug'likni buzmaydi
    const add = (L[i] - B[i]) * a * mid
    d[j] += add; d[j + 1] += add; d[j + 2] += add
  }
}

export function sharpen(d, w, h, amount, radius, threshold = 0) {
  if (amount <= 0) return
  const n = w * h
  const L = lumaOf(d, n)
  const B = gaussBlur(L, w, h, Math.max(0.4, radius))
  const a = (amount / 100) * 2.4
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const diff = L[i] - B[i]
    let add = diff * a
    if (threshold > 0) { // yumshoq to'siq: shovqin darajasidan kuchsiz farqlar kuchaytirilmaydi, aniq chegaralar to'liq
      const t = Math.abs(diff) / threshold
      if (t < 1) add *= t * t
    }
    if (add > 70) add = 70
    else if (add < -70) add = -70 // halo (yorug' hoshiya)ni cheklash
    d[j] += add; d[j + 1] += add; d[j + 2] += add
  }
}

/* ───────── Xiralikni tiklash: Richardson–Lucy dekonvolyutsiyasi ─────────
   Unsharp mask faqat chegara kontrastini oshiradi; dekonvolyutsiya esa xiralashtirish jarayonini (Gauss yadrosi)
   teskari yo'nalishda taxmin qilib, yo'qolgan detalni haqiqatan qaytaradi. Faqat yorug'likda ishlaydi;
   shovqin kuchayib ketmasligi uchun yumshoq eshik (gate) va cheklov ishlatiladi. */

function gaussKernel(sigma) {
  const r = Math.max(1, Math.ceil(sigma * 2.5))
  const k = new Float32Array(2 * r + 1)
  let sum = 0
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + r] = v; sum += v }
  for (let i = 0; i < k.length; i++) k[i] /= sum
  return { k, r }
}

// Yadro simmetrik: har bir juft (chap/o'ng) bitta ko'paytirish bilan hisoblanadi — ~1.5× tezroq
function convH(src, dst, w, h, { k, r }) {
  const c = k[r]
  const lo = Math.min(r, w), hi = Math.max(r, w - r)
  for (let y = 0; y < h; y++) {
    const o = y * w
    for (let x = lo; x < hi; x++) {
      const p = o + x
      let s = src[p] * c
      for (let i = 1; i <= r; i++) s += k[r + i] * (src[p - i] + src[p + i])
      dst[p] = s
    }
    for (let x = 0; x < w; x++) {
      if (x >= lo && x < hi) continue // chekka piksellar: koordinata rasm ichiga qisiladi
      let s = src[o + x] * c
      for (let i = 1; i <= r; i++) s += k[r + i] * (src[o + Math.max(0, x - i)] + src[o + Math.min(w - 1, x + i)])
      dst[o + x] = s
    }
  }
}

// Vertikal: qator bo'yicha jamlanadi (xotiradan ketma-ket o'qish — keshga qulay)
function convV(src, dst, w, h, { k, r }) {
  const c = k[r]
  for (let y = 0; y < h; y++) {
    const o = y * w
    for (let x = 0; x < w; x++) dst[o + x] = src[o + x] * c
    for (let i = 1; i <= r; i++) {
      const a = Math.max(0, y - i) * w, b = Math.min(h - 1, y + i) * w, ki = k[r + i]
      for (let x = 0; x < w; x++) dst[o + x] += ki * (src[a + x] + src[b + x])
    }
  }
}

// Gauss yadrosi bilan joyida xiralashtirish (aniq yadro: kichik sigma'da quti filtridan aniqroq). tmp — ishchi massiv.
function blurInPlace(a, tmp, w, h, kern) {
  convH(a, tmp, w, h, kern)
  convV(tmp, a, w, h, kern)
}

export function deblur(d, w, h, amount, sigma, gate = 0) {
  if (amount <= 0) return
  const n = w * h
  const L = lumaOf(d, n)
  const kern = gaussKernel(Math.max(0.5, sigma))
  let iters = Math.round(4 + (amount / 100) * 12) // 4..16 (RL sekin yaqinlashadi; kvadrat tuzatish bilan ~2× tez)
  if (n > 6_000_000) iters = Math.max(5, Math.round(iters * Math.sqrt(6_000_000 / n))) // juda katta rasmda vaqt chegaralanadi
  const est = new Float32Array(L)
  const a = new Float32Array(n)
  const tmp = new Float32Array(n)
  for (let it = 0; it < iters; it++) {
    a.set(est)
    blurInPlace(a, tmp, w, h, kern) // a = baho ⊗ yadro
    for (let i = 0; i < n; i++) a[i] = (L[i] + 1) / (a[i] + 1) // kuzatilgan / modellashtirilgan
    blurInPlace(a, tmp, w, h, kern)
    // tuzatish nisbatining kvadrati (over-relaxation): bir xil iteratsiyada aniqroq natija, o'lchovlarda oddiy RL'ning 2× iteratsiyasidan yaxshi
    for (let i = 0; i < n; i++) { const v = est[i] * a[i] * a[i]; est[i] = v > 255 ? 255 : v }
  }
  const mix = Math.min(1, amount / 100)
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    let delta = (est[i] - L[i]) * mix
    if (gate > 0) { const t = Math.abs(delta) / gate; if (t < 1) delta *= t * t }
    if (delta > 60) delta = 60
    else if (delta < -60) delta = -60 // halo (yorug' hoshiya)ni cheklash
    d[j] += delta; d[j + 1] += delta; d[j + 2] += delta
  }
}

// Xiralik yadrosi kengligi rasm o'lchamiga qarab taxmin qilinadi (to'liq o'lchamdagi piksel hisobida)
export function deblurSigma(longSide) {
  return Math.min(3, Math.max(0.8, 0.7 + 0.5 * (longSide / 1600)))
}

/* ───────── Rang sozlamalari ───────── */

export function adjust(d, n, p) {
  const { brightness, contrast, saturation, vibrance, warmth } = p
  if (!brightness && !contrast && !saturation && !vibrance && !warmth) return
  const B = brightness * 0.8
  const C = 1 + contrast / 100
  const S = 1 + saturation / 100
  const V = vibrance / 100
  const wr = 1 + warmth / 500
  const wb = 1 - warmth / 500
  for (let i = 0; i < n * 4; i += 4) {
    let r = d[i] + B, g = d[i + 1] + B, b = d[i + 2] + B
    if (contrast) { r = (r - 128) * C + 128; g = (g - 128) * C + 128; b = (b - 128) * C + 128 }
    if (saturation || vibrance) {
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
      const sat = mx > 0 ? (mx - mn) / (mx + 1) : 0
      const f = S * (1 + V * (1 - Math.min(1, sat * 1.4)))
      const l = 0.299 * r + 0.587 * g + 0.114 * b
      r = l + (r - l) * f; g = l + (g - l) * f; b = l + (b - l) * f
    }
    if (warmth) { r *= wr; b *= wb }
    d[i] = r; d[i + 1] = g; d[i + 2] = b
  }
}

/* ───────── Kattalashtirish (Lanczos-3) ───────── */

function lanczos(x) {
  if (x === 0) return 1
  if (x <= -3 || x >= 3) return 0
  const px = Math.PI * x
  return (3 * Math.sin(px) * Math.sin(px / 3)) / (px * px)
}

function makeWeights(srcLen, dstLen) {
  const scale = dstLen / srcLen
  const fs = Math.max(1, 1 / scale)
  const support = 3 * fs
  const taps = Math.ceil(support) * 2 + 1
  const starts = new Int32Array(dstLen)
  const weights = new Float32Array(dstLen * taps)
  for (let i = 0; i < dstLen; i++) {
    const center = (i + 0.5) / scale - 0.5
    const start = Math.floor(center - support) + 1
    starts[i] = start
    let total = 0
    for (let t = 0; t < taps; t++) {
      const wgt = lanczos((start + t - center) / fs)
      weights[i * taps + t] = wgt
      total += wgt
    }
    for (let t = 0; t < taps; t++) weights[i * taps + t] /= total
  }
  return { starts, weights, taps }
}

export function resize(src, sw, sh, dw, dh) {
  const hx = makeWeights(sw, dw)
  const vy = makeWeights(sh, dh)
  const tmp = new Uint8ClampedArray(dw * sh * 4)
  for (let y = 0; y < sh; y++) {
    const row = y * sw * 4
    for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0, a = 0
      const s0 = hx.starts[x], wo = x * hx.taps
      for (let t = 0; t < hx.taps; t++) {
        let sx = s0 + t
        sx = sx < 0 ? 0 : sx >= sw ? sw - 1 : sx
        const wgt = hx.weights[wo + t], q = row + sx * 4
        r += src[q] * wgt; g += src[q + 1] * wgt; b += src[q + 2] * wgt; a += src[q + 3] * wgt
      }
      const o = (y * dw + x) * 4
      tmp[o] = r; tmp[o + 1] = g; tmp[o + 2] = b; tmp[o + 3] = a
    }
  }
  const out = new Uint8ClampedArray(dw * dh * 4)
  for (let y = 0; y < dh; y++) {
    const s0 = vy.starts[y], wo = y * vy.taps
    for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let t = 0; t < vy.taps; t++) {
        let sy = s0 + t
        sy = sy < 0 ? 0 : sy >= sh ? sh - 1 : sy
        const wgt = vy.weights[wo + t], q = (sy * dw + x) * 4
        r += tmp[q] * wgt; g += tmp[q + 1] * wgt; b += tmp[q + 2] * wgt; a += tmp[q + 3] * wgt
      }
      const o = (y * dw + x) * 4
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a
    }
  }
  return out
}

/* ───────── To'liq konveyer ─────────
   img: { data: Uint8ClampedArray, width, height } (data shu funksiya ichida o'zgaradi)
   p:   DEFAULTS shaklidagi sozlamalar
   k:   ko'rib chiqish (preview) koeffitsiyenti — radiusni rasm o'lchamiga moslash uchun (to'liq o'lchamda 1) */
export function processImage(img, p, k = 1) {
  const q = { ...DEFAULTS, ...p }
  let { data, width: w, height: h } = img
  denoise(data, w, h, q.denoise)
  autoLevels(data, w, h, q.auto)
  const s = effectiveScale(w, h, q.scale, q.maxOut)
  // Xiralikni tiklash kattalashtirishdan OLDIN, asl o'lchamda: xiralik kamerada asl piksellarda yuz bergan (yadro ~1 px),
  // va ~s² marta kam piksel ishlanadi. Ko'rib chiqishda (scale=1) haqiqiy kattalashtirish fullScale orqali keladi.
  // kSrc — hozirgi rasm / asl rasm o'lchami nisbati.
  if (q.deblur > 0) {
    const kSrc = (k * (q.fullScale || s)) / s
    deblur(data, w, h, q.deblur, deblurSigma(Math.max(w, h) / kSrc) * kSrc, estimateNoise(data, w, h) * 2.5)
  }
  if (s > 1) {
    const nw = Math.round(w * s), nh = Math.round(h * s)
    data = resize(data, w, h, nw, nh)
    w = nw; h = nh
  }
  // Aniqlik radiusi va xiralik yadrosi rasm o'lchamiga moslanadi: 12 MP suratda 1.2 px deyarli sezilmaydi, chunki xiralik ham shuncha piksel keng.
  // Ko'rib chiqishda (k < 1) rasm kichraytirilgan, shuning uchun o'lcham to'liq nusxaga qayta hisoblanadi — natija bir xil bo'ladi.
  const fullSide = Math.max(w, h) / k
  // Kuchli aniqlik donadorlikni ham kuchaytirib yubormasligi uchun: rasmdagi shovqin darajasidan kuchsiz farqlar o'tkazilmaydi
  // (Katta radiusda shovqin deyarli to'liq "farq" bo'lib qoladi, shuning uchun u yerda eshik balandroq.)
  const noise = q.sharpen > 0 ? estimateNoise(data, w, h) : 0
  clarity(data, w, h, q.clarity)
  const r = Math.max(0.4, q.radius * k * sharpenBoost(fullSide))
  sharpen(data, w, h, q.sharpen, r, noise * 2.5)
  sharpen(data, w, h, q.sharpen * 0.45, r * 3, noise * 3) // o'rta masshtab: mayda chegaralar bilan birga teksturani ham jonlantiradi
  adjust(data, w * h, q)
  return { data, width: w, height: h }
}

// 1600 px gacha 1×, undan katta rasmda radius o'sib boradi (eng ko'pi bilan 3×)
export function sharpenBoost(longSide) {
  return Math.min(3, Math.max(1, longSide / 1600))
}

// Gemini qo'llab-quvvatlaydigan kadr nisbatlaridan rasmga eng yaqinini tanlaydi (AI kadrni o'zgartirib yubormasligi uchun)
const ASPECTS = [['1:1', 1], ['2:3', 2 / 3], ['3:2', 3 / 2], ['3:4', 3 / 4], ['4:3', 4 / 3], ['4:5', 4 / 5], ['5:4', 5 / 4], ['9:16', 9 / 16], ['16:9', 16 / 9], ['21:9', 21 / 9]]
export function nearestAspect(w, h) {
  const r = w / h
  let best = ASPECTS[0], bd = Infinity
  for (const a of ASPECTS) {
    const d = Math.abs(Math.log(r / a[1]))
    if (d < bd) { bd = d; best = a }
  }
  return best[0]
}
