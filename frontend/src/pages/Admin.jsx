import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { PROVIDER_IDS, PROVIDER_INFO, callApi } from '../lib/ai.js'

const fmtDate = (s) => (s ? new Date(s).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')

function useLoad(action, payload, deps = []) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const reload = useCallback(async () => {
    setLoading(true)
    try { setData(await callApi(action, payload)); setErr('') } catch (e) { setErr(e.message) } finally { setLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, ...deps])
  useEffect(() => { reload() }, [reload])
  return { data, err, loading, reload }
}

function Msg({ ok, err }) {
  if (err) return <div className="alert alert-err mb-3" role="alert">{err}</div>
  if (ok) return <div className="alert alert-ok mb-3">{ok}</div>
  return null
}

/* ───────── Statistika ───────── */
function Stats() {
  const { data, err, loading } = useLoad('stats')
  if (loading) return <p className="muted flex items-center gap-2"><span className="spinner" /> Yuklanmoqda…</p>
  if (err) return <Msg err={err} />
  const cards = [
    ['Foydalanuvchilar', data.users],
    ['Shu hafta yangi', data.newThisWeek],
    ['Bugungi AI so‘rovlar', data.requestsToday],
    ['7 kunlik AI so‘rovlar', data.requests7d],
    ['7 kunlik xatolar', data.failures7d],
    ['Faol API kalitlar', data.activeKeys],
  ]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {cards.map(([label, v]) => (
        <div key={label} className="card p-4">
          <p className="muted text-sm">{label}</p>
          <p className="font-display mt-1 text-3xl font-bold">{v ?? '—'}</p>
        </div>
      ))}
    </div>
  )
}

/* ───────── API kalitlar ───────── */
const EMPTY_KEY = { provider: 'gemini', label: '', key: '', model: '', priority: 100 }

function Keys() {
  const { data, err, loading, reload } = useLoad('key-list')
  const [form, setForm] = useState(EMPTY_KEY)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState({ ok: '', err: '' })
  const [tests, setTests] = useState({})
  const info = PROVIDER_INFO[form.provider]

  async function act(name, fn, okText) {
    setBusy(name)
    setMsg({ ok: '', err: '' })
    try { await fn(); if (okText) setMsg({ ok: okText, err: '' }); await reload() } catch (e) { setMsg({ ok: '', err: e.message }) } finally { setBusy('') }
  }

  const save = (e) => {
    e.preventDefault()
    const payload = { ...form, priority: Number(form.priority) || 100 }
    if (editing) return act('save', async () => { await callApi('key-update', { id: editing, ...payload }); setEditing(null); setForm(EMPTY_KEY) }, 'Kalit yangilandi.')
    return act('save', async () => { await callApi('key-add', payload); setForm(EMPTY_KEY) }, 'Kalit qo‘shildi. “Sinash” tugmasi bilan tekshirib ko‘ring.')
  }

  const startEdit = (k) => {
    setEditing(k.id)
    setForm({ provider: k.provider, label: k.label || '', key: '', model: k.model || '', priority: k.priority })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function test(k) {
    setTests((t) => ({ ...t, [k.id]: { loading: true } }))
    try {
      const r = await callApi('key-test', { id: k.id })
      setTests((t) => ({ ...t, [k.id]: { ok: true, text: `Ishlayapti · ${r.ms} ms` } }))
    } catch (e) {
      setTests((t) => ({ ...t, [k.id]: { ok: false, text: e.message } }))
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={save} className="card space-y-4 p-4">
        <h2 className="font-display text-lg font-bold">{editing ? 'Kalitni tahrirlash' : 'Yangi API kalit qo‘shish'}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="k-prov">Xizmat</label>
            <select id="k-prov" className="input" value={form.provider} disabled={Boolean(editing)} onChange={(e) => setForm({ ...form, provider: e.target.value })}>
              {PROVIDER_IDS.map((id) => <option key={id} value={id}>{PROVIDER_INFO[id].label}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="k-label">Nom (ixtiyoriy)</label>
            <input id="k-label" className="input" placeholder="Masalan: asosiy kalit" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="k-key">API kalit {editing && <span className="faint">(bo‘sh qoldirsangiz o‘zgarmaydi)</span>}</label>
            <input id="k-key" className="input font-mono" type="password" autoComplete="off" required={!editing} placeholder={editing ? '••••••••' : 'Kalitni shu yerga qo‘ying'} value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="k-model">Model (ixtiyoriy)</label>
            <input id="k-model" className="input font-mono" placeholder={info.model} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="k-pr">Navbat (kichik raqam — avval)</label>
            <input id="k-pr" className="input" type="number" min="1" max="1000" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
          </div>
        </div>
        <p className="faint text-xs leading-snug">
          {info.note} · <a className="text-[var(--cyan)] underline" href={info.keyUrl} target="_blank" rel="noreferrer">Kalit olish</a>
        </p>
        <Msg {...msg} />
        <div className="flex gap-2">
          <button className="btn btn-primary" disabled={busy === 'save'}>{busy === 'save' ? <span className="spinner" /> : editing ? 'Saqlash' : 'Qo‘shish'}</button>
          {editing && <button type="button" className="btn" onClick={() => { setEditing(null); setForm(EMPTY_KEY) }}>Bekor qilish</button>}
        </div>
      </form>

      <div className="card overflow-x-auto">
        {loading ? <p className="muted p-4"><span className="spinner" /></p> : err ? <div className="p-4"><Msg err={err} /></div> : !data.keys.length ? (
          <p className="muted p-5 text-sm">Hali kalit yo‘q. Yuqoridagi formadan qo‘shing — kalitlar faqat serverda saqlanadi va foydalanuvchiga ko‘rinmaydi.</p>
        ) : (
          <table className="tbl">
            <thead><tr><th>Xizmat</th><th>Kalit</th><th>Navbat</th><th>Natija</th><th>Holat</th><th /></tr></thead>
            <tbody>
              {data.keys.map((k) => {
                const t = tests[k.id]
                return (
                  <tr key={k.id}>
                    <td>
                      <div className="font-semibold">{PROVIDER_INFO[k.provider]?.label || k.provider}</div>
                      <div className="faint text-xs">{k.label || '—'} · <span className="font-mono">{k.model || PROVIDER_INFO[k.provider]?.model}</span></div>
                    </td>
                    <td className="font-mono text-xs">{k.masked}</td>
                    <td>{k.priority}</td>
                    <td className="text-xs">
                      <span className="text-[var(--green)]">✓ {k.success_count}</span> · <span className="text-[var(--red)]">✕ {k.failure_count}</span>
                      <div className="faint">{fmtDate(k.last_used_at)}</div>
                      {k.last_error && <div className="max-w-[240px] truncate text-[var(--red)]" title={k.last_error}>{k.last_error}</div>}
                    </td>
                    <td>
                      <button className={`badge ${k.is_active ? 'badge-ok' : 'badge-err'} cursor-pointer`} onClick={() => act('t' + k.id, () => callApi('key-toggle', { id: k.id, active: !k.is_active }))} title="Yoqish / o‘chirish">
                        {k.is_active ? 'Faol' : 'O‘chiq'}
                      </button>
                      {t && <div className={`mt-1 max-w-[220px] text-xs ${t.loading ? 'faint' : t.ok ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>{t.loading ? 'Tekshirilmoqda…' : t.text}</div>}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <button className="btn btn-sm" onClick={() => test(k)}>Sinash</button>{' '}
                      <button className="btn btn-sm" onClick={() => startEdit(k)}>Tahrirlash</button>{' '}
                      <button className="btn btn-danger btn-sm" onClick={() => confirm('Bu kalit o‘chirilsinmi?') && act('d' + k.id, () => callApi('key-delete', { id: k.id }), 'Kalit o‘chirildi.')}>O‘chirish</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="faint text-xs leading-relaxed">
        Bir nechta kalit qo‘shsangiz, biri xato bersa keyingisi ishlatiladi. Yaroqsiz kalit (401/403) ketma-ket 3 marta xato bersa, avtomatik o‘chiriladi. Limit (429) xatosida o‘chirilmaydi.
      </p>
    </div>
  )
}

/* ───────── Foydalanuvchilar ───────── */
function Users() {
  const { isSuper, user } = useAuth()
  const { data, err, loading, reload } = useLoad('user-list')
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState({ ok: '', err: '' })

  async function act(fn, okText) {
    setMsg({ ok: '', err: '' })
    try { await fn(); setMsg({ ok: okText, err: '' }); await reload() } catch (e) { setMsg({ ok: '', err: e.message }) }
  }

  if (loading) return <p className="muted"><span className="spinner" /></p>
  if (err) return <Msg err={err} />
  const list = data.users.filter((u) => `${u.email} ${u.display_name || ''}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input className="input max-w-sm" placeholder="Ism yoki email bo‘yicha qidirish" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="muted text-sm">{list.length} / {data.users.length}</span>
        <button className="btn btn-sm" onClick={reload}>Yangilash</button>
      </div>
      <Msg {...msg} />
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Foydalanuvchi</th><th>Rol</th><th>Bugun AI</th><th>Ro‘yxatdan o‘tgan</th><th /></tr></thead>
          <tbody>
            {list.map((u) => {
              const self = u.id === user?.id
              const manageable = isSuper ? !self && u.role !== 'superadmin' : u.role === 'user'
              return (
                <tr key={u.id}>
                  <td>
                    <div className="font-semibold">{u.display_name || '—'} {self && <span className="badge badge-info ml-1">Siz</span>}</div>
                    <div className="faint text-xs">{u.email}</div>
                  </td>
                  <td>
                    {isSuper && manageable ? (
                      <select className="input !min-h-9 !w-auto !py-1 text-sm" value={u.role} onChange={(e) => act(() => callApi('set-role', { id: u.id, role: e.target.value }), 'Rol o‘zgartirildi.')}>
                        <option value="user">O‘quvchi</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : <span className={`badge ${u.role === 'superadmin' ? 'badge-warn' : u.role === 'admin' ? 'badge-info' : ''}`}>{u.role === 'superadmin' ? 'Super admin' : u.role === 'admin' ? 'Admin' : 'Foydalanuvchi'}</span>}
                    {u.is_blocked && <span className="badge badge-err ml-2">Bloklangan</span>}
                  </td>
                  <td>{u.today}</td>
                  <td className="text-xs">{fmtDate(u.created_at)}</td>
                  <td className="whitespace-nowrap text-right">
                    {manageable && (
                      <>
                        <button className="btn btn-sm" onClick={() => act(() => callApi('user-block', { id: u.id, blocked: !u.is_blocked }), u.is_blocked ? 'Blok olib tashlandi.' : 'Foydalanuvchi bloklandi.')}>{u.is_blocked ? 'Blokdan chiqarish' : 'Bloklash'}</button>{' '}
                        {isSuper && <button className="btn btn-danger btn-sm" onClick={() => confirm(`${u.email} butunlay o‘chirilsinmi?`) && act(() => callApi('user-delete', { id: u.id }), 'Foydalanuvchi o‘chirildi.')}>O‘chirish</button>}
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!isSuper && <p className="faint text-xs">Admin sifatida siz faqat oddiy foydalanuvchilarni ko‘rasiz va bloklay olasiz. Rol berish va o‘chirish — faqat super admin.</p>}
    </div>
  )
}

/* ───────── Sozlamalar ───────── */
function Settings() {
  const { data, err, loading } = useLoad('settings-get')
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState({ ok: '', err: '' })
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (data) setForm(data.settings) }, [data])

  if (loading || !form) return err ? <Msg err={err} /> : <p className="muted"><span className="spinner" /></p>

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setMsg({ ok: '', err: '' })
    try { await callApi('settings-save', form); setMsg({ ok: 'Saqlandi.', err: '' }) } catch (e2) { setMsg({ ok: '', err: e2.message }) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={save} className="card max-w-xl space-y-5 p-5">
      <label className="flex cursor-pointer items-center justify-between gap-4">
        <span>
          <span className="block font-semibold">AI xizmati yoqilgan</span>
          <span className="faint text-xs">O‘chirilsa, hech kim AI’dan foydalana olmaydi (lokal ishlov ishlayveradi).</span>
        </span>
        <input type="checkbox" className="h-5 w-5 accent-[var(--cyan)]" checked={form.ai_enabled === 'on'} onChange={(e) => setForm({ ...form, ai_enabled: e.target.checked ? 'on' : 'off' })} />
      </label>
      <div>
        <label className="label" htmlFor="lim">Bir foydalanuvchiga kunlik AI limiti</label>
        <input id="lim" className="input max-w-[160px]" type="number" min="0" max="10000" value={form.ai_daily_limit} onChange={(e) => setForm({ ...form, ai_daily_limit: e.target.value })} />
        <p className="faint mt-1 text-xs">0 — cheklovsiz. Adminlarga limit qo‘llanmaydi.</p>
      </div>
      <div>
        <label className="label" htmlFor="prov">AI xizmat rejimi</label>
        <select id="prov" className="input max-w-sm" value={form.ai_provider} onChange={(e) => setForm({ ...form, ai_provider: e.target.value })}>
          <option value="auto">Avtomatik (hamma faol kalitlar)</option>
          {PROVIDER_IDS.map((id) => <option key={id} value={id}>Faqat {PROVIDER_INFO[id].label}</option>)}
        </select>
      </div>
      <Msg {...msg} />
      <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Saqlash'}</button>
    </form>
  )
}

/* ───────── Sahifa ───────── */
export default function Admin() {
  const { hasBackend, loading, user, isStaff, isSuper } = useAuth()
  const [params, setParams] = useSearchParams()

  if (!hasBackend) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold">Boshqaruv paneli ulanmagan</h1>
        <p className="muted mt-2">Panel uchun Supabase kerak. README.md’dagi “Ishga tushirish” bo‘limiga qarang.</p>
        <Link to="/" className="btn mt-5">Studiyaga qaytish</Link>
      </div>
    )
  }
  if (loading) return <div className="grid min-h-[50vh] place-items-center"><span className="spinner" /></div>
  if (!user || !isStaff) return <Navigate to="/" replace />

  const tabs = [
    { id: 'stats', label: 'Statistika', el: <Stats /> },
    { id: 'users', label: 'Foydalanuvchilar', el: <Users /> },
    ...(isSuper ? [
      { id: 'keys', label: 'API kalitlar', el: <Keys /> },
      { id: 'settings', label: 'Sozlamalar', el: <Settings /> },
    ] : []),
  ]
  const current = tabs.find((t) => t.id === params.get('tab')) || tabs[0]

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="font-display mb-4 text-2xl font-bold">Boshqaruv</h1>
      <div className="tab-row mb-5 max-w-xl overflow-x-auto" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={current.id === t.id} className="tab" onClick={() => setParams({ tab: t.id })}>{t.label}</button>
        ))}
      </div>
      {current.el}
    </div>
  )
}
