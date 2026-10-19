import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '')
export const SUPABASE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

// createClient noto'g'ri URL'da (masalan, "https://" siz yoki bo'sh joyli) xato otadi. Ilgari bu xato modul yuklanishida
// chiqib, butun sayt bo'sh qora ekran bo'lib qolardi. Endi sayt "oddiy rejim"da ochiladi, sabab esa backendError'da.
function connect() {
  if (!SUPABASE_URL && !SUPABASE_ANON) return { client: null, error: '' } // atayin ulanmagan
  if (!SUPABASE_URL || !SUPABASE_ANON) return { client: null, error: 'VITE_SUPABASE_URL yoki VITE_SUPABASE_ANON_KEY kiritilmagan' }
  try {
    const u = new URL(SUPABASE_URL)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('manzil https:// bilan boshlanishi kerak')
    return { client: createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }), error: '' }
  } catch (e) {
    return { client: null, error: `VITE_SUPABASE_URL noto'g'ri: ${e.message}` }
  }
}

const conn = connect()
// Sayt "oddiy rejim"da ishlaydi, agar server ulanmagan bo'lsa (kirish yo'q, lokal ishlov + o'z Gemini kaliti)
export const supabase = conn.client
export const hasBackend = Boolean(conn.client)
export const backendError = conn.error
