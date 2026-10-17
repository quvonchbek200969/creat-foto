// Rasm ishlov dvigateli: Worker bilan aloqa, rasm yuklash va saqlash.
import { processImage } from './pixels.js'

let worker = null
let seq = 0
const pending = new Map()

function getWorker() {
  if (worker || typeof Worker === 'undefined') return worker
  try {
    worker = new Worker(new URL('./enhance.worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = (e) => {
      const { id, ok, buffer, width, height, error } = e.data
      const job = pending.get(id)
      if (!job) return
      pending.delete(id)
      if (ok) job.resolve({ data: new Uint8ClampedArray(buffer), width, height })
      else job.reject(new Error(error || 'Ishlov berishda xato'))
    }
    worker.onerror = (e) => {
      for (const job of pending.values()) job.reject(new Error(e.message || 'Worker xatosi'))
      pending.clear()
      worker = null
    }
  } catch {
    worker = null
  }
  return worker
}

// Telefonlarda xotira kam: kirish va chiqish rasmlari uchun kichikroq chegara
const weakDevice =
  typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches ||
  (typeof navigator !== 'undefined' && navigator.deviceMemory && navigator.deviceMemory <= 4)
export const LIMITS = weakDevice
  ? { maxIn: 12_000_000, maxOut: 16_000_000 }
  : { maxIn: 24_000_000, maxOut: 36_000_000 }

// imageData: { data, width, height } — nusxa olinadi, asl nusxa o'zgarmaydi
export function runProcess(imageData, rawParams, k = 1) {
  const params = { ...rawParams, maxOut: LIMITS.maxOut }
  const copy = new Uint8ClampedArray(imageData.data)
  const w = getWorker()
  if (!w) {
    // Worker yo'q muhit (juda eski brauzer): asosiy oqimda bajariladi
    return Promise.resolve(processImage({ data: copy, width: imageData.width, height: imageData.height }, params, k))
  }
  const id = ++seq
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage({ id, buffer: copy.buffer, width: imageData.width, height: imageData.height, params, k }, [copy.buffer])
  })
}

/* ───────── Rasm yuklash ───────── */

export const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif,image/gif,image/bmp'

export async function loadBitmap(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Bu rasm fayli emas. JPG, PNG yoki WebP tanlang.')
  let bitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error("Rasmni ochib bo'lmadi. Fayl buzilgan yoki format qo'llab-quvvatlanmaydi (HEIC bo'lsa, JPG qilib saqlang).")
  }
  // Juda katta rasmlar xotirani to'ldirmasligi uchun kichraytiriladi
  const px = bitmap.width * bitmap.height
  if (px > LIMITS.maxIn) {
    const f = Math.sqrt(LIMITS.maxIn / px)
    const small = await createImageBitmap(bitmap, {
      resizeWidth: Math.round(bitmap.width * f),
      resizeHeight: Math.round(bitmap.height * f),
      resizeQuality: 'high',
    })
    bitmap.close?.()
    return { bitmap: small, shrunk: true }
  }
  return { bitmap, shrunk: false }
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

// Bitmap'ni maxSide gacha kichraytirib ImageData qiladi (kichik bo'lsa o'zgartirmaydi)
export function bitmapToImageData(bitmap, maxSide = 0) {
  let w = bitmap.width, h = bitmap.height
  if (maxSide && Math.max(w, h) > maxSide) {
    const f = maxSide / Math.max(w, h)
    w = Math.max(1, Math.round(w * f))
    h = Math.max(1, Math.round(h * f))
  }
  const c = makeCanvas(w, h)
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

export function paintImageData(canvas, img) {
  canvas.width = img.width
  canvas.height = img.height
  canvas.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0)
}

export function paintBitmap(canvas, bitmap, w, h) {
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)
}

/* ───────── Saqlash ───────── */

export const FORMATS = {
  png: { mime: 'image/png', ext: 'png', label: 'PNG (sifat yo‘qolmaydi)' },
  jpeg: { mime: 'image/jpeg', ext: 'jpg', label: 'JPG (kichik hajm)' },
  webp: { mime: 'image/webp', ext: 'webp', label: 'WebP (eng kichik)' },
}

export function imageToBlob(img, format = 'png', quality = 0.92) {
  const f = FORMATS[format] || FORMATS.png
  const c = makeCanvas(img.width, img.height)
  const ctx = c.getContext('2d')
  if (f.mime === 'image/jpeg') {
    ctx.fillStyle = '#ffffff' // JPG shaffoflikni qo'llamaydi — oq fon
    ctx.fillRect(0, 0, c.width, c.height)
    const tmp = makeCanvas(img.width, img.height)
    tmp.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0)
    ctx.drawImage(tmp, 0, 0)
  } else {
    ctx.putImageData(new ImageData(img.data, img.width, img.height), 0, 0)
  }
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Rasmni saqlab bo‘lmadi'))), f.mime, quality),
  )
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/* ───────── AI uchun uzatish ───────── */

// Bitmap'ni JPEG (base64) ga o'giradi — serverga yuborish uchun
export async function bitmapToJpegBase64(bitmap, maxSide, quality = 0.92) {
  const img = bitmapToImageData(bitmap, maxSide)
  const blob = await imageToBlob(img, 'jpeg', quality)
  return { base64: await blobToBase64(blob), mime: 'image/jpeg', width: img.width, height: img.height }
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] || '')
    r.onerror = () => reject(new Error('Faylni o‘qib bo‘lmadi'))
    r.readAsDataURL(blob)
  })
}

export function base64ToBlob(b64, mime) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime || 'image/png' })
}

// Sinab ko'rish uchun: xira va shovqinli namuna rasm yasaydi (hech qayerdan yuklamaydi)
export async function makeSampleFile() {
  const W = 1200, H = 800
  const c = makeCanvas(W, H)
  const g = c.getContext('2d')
  const sky = g.createLinearGradient(0, 0, 0, H * 0.62)
  sky.addColorStop(0, '#2b5fa8'); sky.addColorStop(1, '#f4b36b')
  g.fillStyle = sky; g.fillRect(0, 0, W, H)
  g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(870, 250, 70, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#34506b'; g.beginPath(); g.moveTo(0, 520); g.lineTo(220, 330); g.lineTo(420, 500); g.lineTo(640, 300); g.lineTo(900, 520); g.lineTo(1200, 360); g.lineTo(1200, 800); g.lineTo(0, 800); g.fill()
  g.fillStyle = '#1f3a2c'; g.fillRect(0, 560, W, 240)
  for (let i = 0; i < 90; i++) { // o'tloq: mayda chiziqlar — tiniqlik farqi ko'rinadi
    g.strokeStyle = i % 2 ? '#3f7a52' : '#2c5a3b'; g.lineWidth = 2
    const x = (i * 37) % W, y = 575 + ((i * 53) % 210)
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 6, y - 22); g.stroke()
  }
  g.fillStyle = '#f5efe3'; g.fillRect(500, 590, 200, 130)
  g.fillStyle = '#9b3d2e'; g.beginPath(); g.moveTo(480, 590); g.lineTo(600, 520); g.lineTo(720, 590); g.fill()
  g.fillStyle = '#2b2118'; g.fillRect(580, 640, 40, 80)
  g.fillStyle = '#10151c'; g.font = '700 54px Sora, Inter, sans-serif'; g.fillText('TINIQ', 60, 110)
  // Xiralik va shovqin
  const blurred = makeCanvas(W, H)
  const bg = blurred.getContext('2d', { willReadFrequently: true })
  bg.filter = 'blur(2.6px)'
  bg.drawImage(c, 0, 0)
  const img = bg.getImageData(0, 0, W, H)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() + Math.random() + Math.random() - 1.5) * 34
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n
  }
  bg.putImageData(img, 0, 0)
  const blob = await new Promise((res) => blurred.toBlob(res, 'image/jpeg', 0.7))
  return new File([blob], 'namuna-xira-rasm.jpg', { type: 'image/jpeg' })
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
