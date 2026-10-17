import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '')
export const SUPABASE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

// Backend ulanmagan bo'lsa sayt "oddiy rejim"da ishlaydi (kirish yo'q, lokal ishlov + o'z Gemini kaliti)
export const hasBackend = Boolean(SUPABASE_URL && SUPABASE_ANON)

export const supabase = hasBackend
  ? createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null
