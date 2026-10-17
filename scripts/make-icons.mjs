// Tiniq ikonkalarini (PNG) yaratadi — tashqi kutubxonasiz. Ishga tushirish:  node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'public', 'icons')
mkdirSync(OUT, { recursive: true })

/* ───── PNG kodlash ───── */
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

/* ───── Chizish (favicon.svg bilan bir xil shakl, 64×64 koordinatalar) ───── */
const STAR = [[47, 11], [49, 16], [54, 18], [49, 20], [47, 25], [45, 20], [40, 18], [45, 16]]
const inPoly = (x, y, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; return c }
const inRoundRect = (x, y, r) => { const cx = Math.min(Math.max(x, r), 64 - r), cy = Math.min(Math.max(y, r), 64 - r); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r }
const grad = (x, y) => { const t = Math.min(1, Math.max(0, (x + y) / 128)); return [34 + (124 - 34) * t, 211 + (92 - 211) * t, 238 + (255 - 238) * t] }

// shape: 'rounded' (oddiy ikonka), 'full' (maskable/Apple: butun kvadrat), content — ichki masshtab
function pixel(u, v, shape, content) {
  const x = u * 64, y = v * 64
  if (shape === 'rounded' && !inRoundRect(x, y, 14)) return [0, 0, 0, 0]
  const bg = [11, 13, 17, 255]
  const cx = 32 + (x - 32) / content, cy = 32 + (y - 32) / content // kontentni markazga nisbatan kichraytirish
  const d = Math.hypot(cx - 32, cy - 32)
  if (Math.abs(d - 17) <= 2.5 || d <= 6) return [...grad(cx, cy), 255]
  if (inPoly(cx, cy, STAR)) return [251, 191, 36, 255]
  return bg
}

function render(size, shape, content) {
  const S = 3 // supersampling: silliq chetlar
  const buf = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let r = 0, g = 0, b = 0, a = 0
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const c = pixel((px + (sx + 0.5) / S) / size, (py + (sy + 0.5) / S) / size, shape, content)
      r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3]
    }
    const o = (py * size + px) * 4
    if (a > 0) { buf[o] = r / a; buf[o + 1] = g / a; buf[o + 2] = b / a; buf[o + 3] = a / (S * S) }
  }
  return png(size, size, buf)
}

const files = {
  'icon-192.png': render(192, 'rounded', 1),
  'icon-512.png': render(512, 'rounded', 1),
  'maskable-512.png': render(512, 'full', 0.74), // Android turli shaklga kesadi — kontent xavfsiz zonada
  'apple-touch-icon.png': render(180, 'full', 0.88),
}
for (const [name, data] of Object.entries(files)) { writeFileSync(join(OUT, name), data); console.log(name, data.length, 'bayt') }
