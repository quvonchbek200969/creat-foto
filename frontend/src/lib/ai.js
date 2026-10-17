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
    model: 'gemini-2.5-flash-image',
    maxSide: 2048,
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Rasm tahrirlash modeli. Bepul limit mavjud bo‘lishi mumkin.',
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
export async function enhanceOnServer({ base64, mime, mode, provider }) {
  const r = await callApi('enhance', { image: base64, mime, mode, provider: provider || 'auto' })
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
  'Keep the exact same composition, subject, faces, identity, text, colors and proportions. Do not add, remove or redraw objects. Output only the final image.'
const PROMPTS = {
  enhance: `Professionally enhance this photograph: make it noticeably sharper and clearer, recover fine detail and texture, remove noise and compression artifacts, and correct exposure, contrast and color balance naturally. ${RULES}`,
  upscale: `Upscale this image to a higher resolution with crisp, realistic detail. Reconstruct fine textures, sharpen edges and remove blur, noise and JPEG artifacts. ${RULES}`,
  restore: `Restore this old or damaged photograph: remove scratches, dust, stains and fading, repair damaged areas, reduce noise and recover natural contrast and detail. If it is black and white keep it black and white. ${RULES}`,
  denoise: `Remove all noise and grain from this photo while preserving every fine detail and texture. ${RULES}`,
}

export async function enhanceWithOwnKey({ base64, mime, mode }) {
  const key = getLocalKey()
  if (!key) throw new Error('Avval Gemini API kalitingizni kiriting.')
  let res
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${PROVIDER_INFO.gemini.model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: PROMPTS[mode] || PROMPTS.enhance }, { inline_data: { mime_type: mime, data: base64 } }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    })
  } catch {
    throw new Error('Google Gemini’ga ulanib bo‘lmadi. Internetni tekshiring.')
  }
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`
    if (res.status === 400 && /API key/i.test(msg)) throw new Error('Gemini kaliti noto‘g‘ri.')
    if (res.status === 403) throw new Error('Gemini kaliti bu amalga ruxsat bermadi. Kalit to‘g‘riligini tekshiring.')
    if (res.status === 429) throw new Error('Gemini limiti tugadi. Birozdan keyin urinib ko‘ring.')
    throw new Error(`Gemini xatosi: ${msg.slice(0, 200)}`)
  }
  const parts = json?.candidates?.[0]?.content?.parts || []
  for (const p of parts) {
    const d = p.inlineData || p.inline_data
    if (d?.data) return { blob: base64ToBlob(d.data, d.mimeType || d.mime_type || 'image/png'), provider: 'gemini' }
  }
  const reason = json?.candidates?.[0]?.finishReason || json?.promptFeedback?.blockReason
  throw new Error(reason ? `Gemini rasm qaytarmadi (${reason}). Boshqa rasm yoki rejimni sinang.` : 'Gemini rasm qaytarmadi. Qayta urinib ko‘ring.')
}
