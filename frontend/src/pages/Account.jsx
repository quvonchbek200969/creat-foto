import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { emailToLogin } from '../lib/login.js'

const ROLES = { superadmin: 'Super admin', admin: 'Admin', user: 'Foydalanuvchi' }

// Hisobim: login/rol ma'lumoti va parolni almashtirish (hamma foydalanuvchi uchun, shu jumladan super admin)
export default function Account() {
  const { hasBackend, loading, user, profile, changePassword } = useAuth()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)

  if (!hasBackend) return <Navigate to="/" replace />
  if (loading) return <p className="muted p-8 text-center"><span className="spinner" /> Yuklanmoqda…</p>
  if (!user) return <Navigate to="/login" replace />

  async function submit(e) {
    e.preventDefault()
    setErr('')
    setOk(false)
    if (pw.length < 6) return setErr('Parol kamida 6 belgidan iborat bo‘lsin.')
    if (pw !== pw2) return setErr('Ikkala parol bir xil emas.')
    setBusy(true)
    try {
      await changePassword(pw)
      setPw('')
      setPw2('')
      setOk(true)
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <h1 className="font-display text-2xl font-bold">Hisobim</h1>
      <div className="card mt-4 space-y-1 p-4 text-sm">
        <p><span className="muted">Login:</span> <b>{emailToLogin(user.email)}</b></p>
        {profile?.display_name && <p><span className="muted">Ism:</span> {profile.display_name}</p>}
        <p><span className="muted">Rol:</span> {ROLES[profile?.role] || ROLES.user}</p>
      </div>

      <form onSubmit={submit} className="card mt-4 space-y-4 p-4">
        <h2 className="font-semibold">Parolni almashtirish</h2>
        <div>
          <label className="label" htmlFor="new-pw">Yangi parol (kamida 6 belgi)</label>
          <input id="new-pw" className="input" type="password" autoComplete="new-password" required minLength={6} value={pw} onChange={(e) => { setPw(e.target.value); setOk(false) }} />
        </div>
        <div>
          <label className="label" htmlFor="new-pw2">Yangi parolni takrorlang</label>
          <input id="new-pw2" className="input" type="password" autoComplete="new-password" required minLength={6} value={pw2} onChange={(e) => { setPw2(e.target.value); setOk(false) }} />
        </div>
        {pw && pw.length < 8 && <p className="faint text-xs">Maslahat: kamida 8 belgi, harf va raqam aralash bo‘lsin — oson topiladigan parol saytni xavfga qo‘yadi.</p>}
        {err && <div className="alert alert-err" role="alert">{err}</div>}
        {ok && <div className="alert alert-ok" role="status">Parol almashtirildi. Keyingi kirishda yangi paroldan foydalaning.</div>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? <span className="spinner" /> : 'Parolni saqlash'}</button>
      </form>
    </div>
  )
}
