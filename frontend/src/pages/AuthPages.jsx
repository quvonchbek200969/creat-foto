import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Layout.jsx'
import { useAuth } from '../context/AuthContext.jsx'

function Shell({ title, subtitle, children, footer }) {
  return (
    <div className="bg-glow grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Logo className="mb-6 justify-center" />
        <div className="card p-6">
          <h1 className="font-display text-2xl font-bold">{title}</h1>
          <p className="muted mt-1 text-sm">{subtitle}</p>
          <div className="mt-5">{children}</div>
        </div>
        <p className="muted mt-4 text-center text-sm">{footer}</p>
      </div>
    </div>
  )
}

function NoBackend() {
  return (
    <Shell title="Hisob yo‘q rejim" subtitle="Bu nusxada server (Supabase) ulanmagan." footer={<Link className="text-[var(--cyan)] underline" to="/">Studiyaga qaytish</Link>}>
      <p className="muted text-sm leading-relaxed">
        Rasmni tiniqlashtirish uchun kirish shart emas. AI uchun o‘zingizning Gemini kalitingizni Studiyadagi “✨ AI” bo‘limiga kiriting.
        Administrator bo‘lsangiz, README’dagi qo‘llanma bo‘yicha Supabase’ni ulang.
      </p>
    </Shell>
  )
}

export function Login() {
  const { hasBackend, user, signIn } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (!hasBackend) return <NoBackend />
  if (user) return <Navigate to="/" replace />

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await signIn(email, password)
      nav('/')
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell title="Kirish" subtitle="Hisobingizga kiring." footer={<>Hisobingiz yo‘qmi? <Link className="text-[var(--cyan)] underline" to="/register">Ro‘yxatdan o‘ting</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Login yoki email</label>
          <input id="email" className="input" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="pw">Parol</label>
          <input id="pw" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {err && <div className="alert alert-err" role="alert">{err}</div>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? <span className="spinner" /> : 'Kirish'}</button>
      </form>
    </Shell>
  )
}

export function Register() {
  const { hasBackend, user, signUp } = useAuth()
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [needConfirm, setNeedConfirm] = useState(false)

  if (!hasBackend) return <NoBackend />
  if (user) return <Navigate to="/" replace />

  async function submit(e) {
    e.preventDefault()
    if (password.length < 6) return setErr('Parol kamida 6 belgidan iborat bo‘lsin.')
    setBusy(true)
    setErr('')
    try {
      const opened = await signUp(email, password, name)
      if (opened) nav('/')
      else setNeedConfirm(true)
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }

  if (needConfirm) {
    return (
      <Shell title="Emailni tasdiqlang" subtitle="Hisob deyarli tayyor." footer={<Link className="text-[var(--cyan)] underline" to="/login">Kirish sahifasi</Link>}>
        <p className="muted text-sm leading-relaxed"><b className="text-white">{email}</b> manziliga xat yubordik. Xatdagi havolani bosing, so‘ng kiring.</p>
      </Shell>
    )
  }

  return (
    <Shell title="Ro‘yxatdan o‘tish" subtitle="AI funksiyasidan foydalanish uchun hisob oching." footer={<>Hisobingiz bormi? <Link className="text-[var(--cyan)] underline" to="/login">Kirish</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="name">Ism</label>
          <input id="name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="pw">Parol (kamida 6 belgi)</label>
          <input id="pw" className="input" type="password" autoComplete="new-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {err && <div className="alert alert-err" role="alert">{err}</div>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? <span className="spinner" /> : 'Hisob ochish'}</button>
      </form>
    </Shell>
  )
}
