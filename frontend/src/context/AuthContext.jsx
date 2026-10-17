import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase, hasBackend } from '../lib/supabase.js'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

function authMessage(err) {
  const m = (err?.message || '').toLowerCase()
  if (m.includes('invalid login')) return 'Email yoki parol noto‘g‘ri.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'Bu email bilan hisob allaqachon ochilgan. Kirishni sinang.'
  if (m.includes('password should be')) return 'Parol kamida 6 belgidan iborat bo‘lsin.'
  if (m.includes('email not confirmed')) return 'Email tasdiqlanmagan. Pochtangizdagi xatni oching.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring.'
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) return 'Ro‘yxatdan o‘tish hozircha yopiq.'
  if (m.includes('failed to fetch') || m.includes('network')) return 'Internet yoki server bilan aloqa yo‘q.'
  return err?.message || 'Noma’lum xato'
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(hasBackend)

  const loadProfile = useCallback(async (uid) => {
    if (!uid) return setProfile(null)
    const { data } = await supabase.from('profiles').select('id,email,display_name,role,is_blocked').eq('id', uid).maybeSingle()
    setProfile(data || null)
  }, [])

  useEffect(() => {
    if (!hasBackend) return
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      setSession(data.session)
      await loadProfile(data.session?.user?.id)
      if (alive) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      // onAuthStateChange ichida to'g'ridan-to'g'ri so'rov yubormaslik uchun keyinga qoldiriladi
      setTimeout(() => loadProfile(s?.user?.id), 0)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [loadProfile])

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw new Error(authMessage(error))
  }, [])

  // true qaytsa — hisob darhol ochildi; false — emailni tasdiqlash kerak
  const signUp = useCallback(async (email, password, name) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: (name || '').trim() } },
    })
    if (error) throw new Error(authMessage(error))
    return Boolean(data.session)
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const value = useMemo(() => {
    const role = profile?.role || 'user'
    return {
      hasBackend,
      loading,
      session,
      user: session?.user || null,
      profile,
      role,
      isStaff: role === 'admin' || role === 'superadmin',
      isSuper: role === 'superadmin',
      signIn,
      signUp,
      signOut,
      refreshProfile: () => loadProfile(session?.user?.id),
    }
  }, [loading, session, profile, signIn, signUp, signOut, loadProfile])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
