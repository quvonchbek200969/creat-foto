// AI bilan ishlash: (1) server orqali (Supabase Edge Function, kalitlar serverda), (2) oddiy rejim —
// foydalanuvchining o'z Gemini kaliti brauzerda saqlanadi va Google'ga to'g'ridan-to'g'ri murojaat qilinadi.
import { supabase, hasBackend, SUPABASE_URL, SUPABASE_ANON } from './supabase.js'
import { base64ToBlob } from './engine.js'

export const AI_MODES = [
  { id: 'enhance', icon: '✨', name: 'Yaxshilash', hint: 'Tiniqlik, shovqin va ranglarni tuzatadi' },
  { id: 'upscale', icon: '🔭', name: 'Kattalashtirish', hint: 'Yuqori sifatli detal bilan kattalashtiradi' },
  { id: 'restore', icon: '📜', name: 'Tiklash', hint: 'Eski va shikastlangan rasm uchun' },
  { id: 'denoise', icon: '🧹', name: 'Shovqinsiz', hint: 'Donadorlikni tozalaydi' },
]

export const PROVIDER_INFO = {
  gemini: {
    label: 'Google Gemini',
    model: 'gemini-nano-banana-2.1',
    maxSide: 2048,
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Rasm tahrirlash modeli (2K natija). Rasm modellari bepul tarifda yo‘q — Google hisobida to‘lov yoqilgan bo‘lishi kerak.',
  },
  openai: {
    label: 'OpenAI',
    model: 'gpt-image-1',
    maxSide: 2048,
    keyUrl: 'https://platform.openai.com/api-keys',
    note: 'gpt-image-1 rasm tahrirlash. Pullik; tashkilot tasdiqlanishi talab qilinishi mumkin.',
  },
  replicate: {
    label: 'Replicate (Real-ESRGAN)',
    model: 'nightmareai/real-esrgan',
    maxSide: 1200,
    keyUrl: 'https://replicate.com/account/api-tokens',
    note: 'Aniq kattalashtirish va yuz tiklash. Model maydoniga boshqa model (egasi/nomi) yozish mumkin.',
  },
  stability: {
    label: 'Stability AI',
    model: 'fast',
    maxSide: 1000,
    keyUrl: 'https://platform.stability.ai/account/keys',
    note: 'Tez 4× kattalashtirish (kirish rasmi ~1 MP gacha). Model maydoni ishlatilmaydi.',
  },
}

export const PROVIDER_IDS = Object.keys(PROVIDER_INFO)

/* ───────── Server (Edge Function) ───────── */

export async function callApi(action, payload = {}) {
  if (!hasBackend) throw new Error('Server ulanmagan')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  let res
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ action, ...payload }),
    })
  } catch {
    throw new Error('Serverga ulanib bo‘lmadi. Internetni tekshiring yoki funksiya joylanganini tasdiqlang.')
  }
  const json = await res.json().catch(() => null)
  if (!res.ok || !json || json.error) {
    const err = new Error((json && json.error) || `Server xatosi (${res.status})`)
    err.status = res.status
    throw err
  }
  return json
}

// Natija: { blob, provider }
export async function enhanceOnServer({ base64, mime, mode, provider, aspect }) {
  const r = await callApi('enhance', { image: base64, mime, mode, provider: provider || 'auto', aspect })
  return { blob: base64ToBlob(r.image, r.mime), provider: r.provider, used: r.used, limit: r.limit }
}

/* ───────── Oddiy rejim: brauzerdan Gemini'ga ───────── */

const KEY_STORE = 'tiniq.gemini.key'

export function getLocalKey() {
  try { return localStorage.getItem(KEY_STORE) || '' } catch { return '' }
}
export function setLocalKey(k) {
  try { k ? localStorage.setItem(KEY_STORE, k.trim()) : localStorage.removeItem(KEY_STORE) } catch { /* private rejim */ }
}

const RULES =
  'Keep the exact same composition, framing, subject, faces, identity, text, colors and proportions. Do not crop, add, remove or redraw objects. Output only the final image.'
const PROMPTS = {
  enhance: `This photo is soft, blurry or low in detail. Restore it as a crisp, sharp, high-resolution photograph: remove blur, sharpen every edge, recover fine textures (hair, skin, fabric, foliage, small text) realistically, remove noise and compression artifacts, and balance exposure, contrast and color naturally. The result must look clearly sharper than the input, but still like a real photo - not plastic or over-smoothed. ${RULES}`,
  upscale: `Upscale this image to a higher resolution with crisp, realistic detail. Reconstruct fine textures, sharpen edges and remove blur, noise and JPEG artifacts. ${RULES}`,
  restore: `Restore this old or damaged photograph: remove scratches, dust, stains and fading, repair damaged areas, reduce noise and recover natural contrast and sharp detail. If it is black and white keep it black and white. ${RULES}`,
  denoise: `Remove all noise and grain from this photo while preserving every fine detail and texture. ${RULES}`,
}

// Asosiy model, undan keyin zaxira. Google modellarni almashtirib turadi: biri topilmasa keyingisi sinaladi.
export const GEMINI_MODELS = [PROVIDER_INFO.gemini.model, 'gemini-2.5-flash-image']

class GeminiError extends Error {
  constructor(message, retryModel = false) {
    super(message)
    this.retryModel = retryModel // true: bu model yo'q/o'chirilgan — keyingisini sinash mumkin
  }
}

// 2.5 avlodi imageSize'ni bilmaydi; 3+ avlodda 2K so'raladi (aks holda 1K qaytadi)
const supportsSize = (model) => !/^gemini-2\.5/.test(model)

async function geminiOnce(key, model, { base64, mime, mode, aspect }, withImageConfig) {
  const generationConfig = { responseModalities: ['TEXT', 'IMAGE'] }
  if (withImageConfig && aspect) {
    generationConfig.imageConfig = { aspectRatio: aspect, ...(supportsSize(model) ? { imageSize: '2K' } : {}) }
  }
  let res
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: PROMPTS[mode] || PROMPTS.enhance }, { inline_data: { mime_type: mime, data: base64 } }] }],
        generationConfig,
      }),
    })
  } catch {
    throw new GeminiError('Google Gemini’ga ulanib bo‘lmadi. Internetni tekshiring.')
  }
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`
    if (res.status === 400 && /API key/i.test(msg)) throw new GeminiError('Gemini kaliti noto‘g‘ri.')
    if (res.status === 400 && withImageConfig && /image_?config|image_?size|aspect/i.test(msg)) return geminiOnce(key, model, { base64, mime, mode, aspect }, false)
    if (res.status === 403) throw new GeminiError('Gemini kaliti bu amalga ruxsat bermadi. Kalit to‘g‘riligini tekshiring va Google hisobida to‘lov yoqilganini tasdiqlang.')
    if (res.status === 429 && /limit:\s*0|free.?tier|billing/i.test(msg)) {
      throw new GeminiError('Bu kalit bepul tarifda — Gemini rasm modellari uchun Google AI Studio’da to‘lov (billing) yoqilishi kerak.')
    }
    if (res.status === 429) throw new GeminiError('Gemini limiti tugadi. Birozdan keyin urinib ko‘ring.')
    if (res.status === 404 || /not found|no longer available|shut ?down|deprecated/i.test(msg)) throw new GeminiError(`Gemini modeli (${model}) topilmadi.`, true)
    throw new GeminiError(`Gemini xatosi: ${msg.slice(0, 200)}`)
  }
  const parts = json?.candidates?.[0]?.content?.parts || []
  for (const p of parts) {
    const d = p.inlineData || p.inline_data
    if (d?.data) return { blob: base64ToBlob(d.data, d.mimeType || d.mime_type || 'image/png'), provider: 'gemini', model }
  }
  const reason = json?.candidates?.[0]?.finishReason || json?.promptFeedback?.blockReason
  throw new GeminiError(reason ? `Gemini rasm qaytarmadi (${reason}). Boshqa rasm yoki rejimni sinang.` : 'Gemini rasm qaytarmadi. Qayta urinib ko‘ring.')
}

export async function enhanceWithOwnKey({ base64, mime, mode, aspect }) {
  const key = getLocalKey()
  if (!key) throw new Error('Avval Gemini API kalitingizni kiriting.')
  let last
  for (const model of GEMINI_MODELS) {
    try {
      return await geminiOnce(key, model, { base64, mime, mode, aspect }, true)
    } catch (e) {
      if (!(e instanceof GeminiError) || !e.retryModel) throw e
      last = e
    }
  }
  throw last
}
