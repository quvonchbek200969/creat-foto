import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import InstallApp from './InstallApp.jsx'

export function Logo({ className = '' }) {
  return (
    <Link to="/" className={`flex items-center gap-2.5 ${className}`} aria-label="Tiniq — bosh sahifa">
      <img src="/favicon.svg" alt="" width="32" height="32" className="rounded-lg" />
      <span className="font-display text-xl font-bold">Tiniq</span>
    </Link>
  )
}

export default function Layout({ children }) {
  const { hasBackend, user, profile, isStaff, signOut, loading } = useAuth()
  const nav = useNavigate()
  const linkCls = ({ isActive }) =>
    `rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${isActive ? 'bg-[var(--panel-2)] text-white' : 'muted hover:text-white'}`

  return (
    <div className="bg-glow min-h-screen">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[rgba(11,13,17,.82)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-3 px-4">
          <Logo />
          <nav className="ml-2 flex items-center gap-1" aria-label="Asosiy menyu">
            <NavLink to="/" end className={linkCls}>Studiya</NavLink>
            {isStaff && <NavLink to="/admin" className={linkCls}>Boshqaruv</NavLink>}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <InstallApp className="btn btn-sm !px-2.5 sm:!px-3" label="📲 Ilova" />
            {!hasBackend && <span className="badge badge-warn hidden sm:inline-flex" title="Supabase ulanmagan">Oddiy rejim</span>}
            {hasBackend && !loading && (user ? (
              <>
                <span className="muted hidden max-w-[200px] truncate text-sm md:inline" title={user.email}>{profile?.display_name || user.email}</span>
                {profile && profile.role !== 'user' && <span className="badge badge-info hidden sm:inline-flex">{profile.role === 'superadmin' ? 'Super admin' : 'Admin'}</span>}
                <button className="btn btn-ghost btn-sm" onClick={async () => { await signOut(); nav('/') }}>Chiqish</button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost btn-sm">Kirish</Link>
                <Link to="/register" className="btn btn-primary btn-sm"><span className="hidden sm:inline">Ro‘yxatdan o‘tish</span><span className="sm:hidden">Ro‘yxat</span></Link>
              </>
            ))}
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="faint mx-auto max-w-[1500px] px-4 py-8 text-center text-xs">
        Tiniq — rasm brauzeringizda ishlanadi. AI funksiyasi yoqilganda rasm tanlangan AI xizmatiga yuboriladi.
      </footer>
    </div>
  )
}
