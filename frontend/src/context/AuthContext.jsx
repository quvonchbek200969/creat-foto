import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase, hasBackend } from '../lib/supabase.js'
import { loginToEmail } from '../lib/login.js'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

function authMessage(err) {
  const m = (err?.message || '').toLowerCase()
  if (m.includes('invalid login')) return 'Login (email) yoki parol noto‘g‘ri.'
  if (m.includes('different from the old') || m.includes('same as the old')) return 'Yangi parol eskisidan farq qilishi kerak.'
  if (m.includes('reauthentication') || m.includes('session') && m.includes('required')) return 'Xavfsizlik uchun chiqib, qayta kiring va parolni almashtiring.'
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
    }).catch(() => { /* sessiya o'qilmadi — mehmon sifatida davom etamiz */ }).finally(() => { if (alive) setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      // onAuthStateChange ichida to'g'ridan-to'g'ri so'rov yubormaslik uchun keyinga qoldiriladi
      setTimeout(() => loadProfile(s?.user?.id), 0)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [loadProfile])

  // login — email yoki oddiy login (masalan, Quvonchbek); login ichki emailga o'giriladi (lib/login.js)
  const signIn = useCallback(async (login, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: loginToEmail(login), password })
    if (error) throw new Error(authMessage(error))
  }, [])

  const changePassword = useCallback(async (password) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error(authMessage(error))
  }, [])

  // true qaytsa — hisob darhol ochildi; false — emailni tasdiqlash kerak
  const signUp = useCallback(async (email, password, name) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      // Tasdiqlash xatidagi havola sayt manziliga olib borsin (boshqa qurilmada ochilganda "localhost"ga emas).
      // Manzil Supabase'da Authentication → URL Configuration → Redirect URLs ro'yxatida bo'lmasa, Site URL ishlatiladi.
      options: { data: { display_name: (name || '').trim() }, emailRedirectTo: window.location.origin },
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
      changePassword,
      refreshProfile: () => loadProfile(session?.user?.id),
    }
  }, [loading, session, profile, signIn, signUp, signOut, changePassword, loadProfile])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
