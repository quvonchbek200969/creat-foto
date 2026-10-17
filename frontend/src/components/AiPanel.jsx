import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { AI_MODES, PROVIDER_INFO, callApi, enhanceOnServer, enhanceWithOwnKey, getLocalKey, setLocalKey } from '../lib/ai.js'
import { bitmapToJpegBase64 } from '../lib/engine.js'

// AI bilan yaxshilash paneli. Natija onResult({bitmap, provider, mode, width, height}) orqali Studiyaga qaytadi.
export default function AiPanel({ src, ai, useAi, onUseAi, onResult, onDiscard }) {
  const { hasBackend, user, isSuper } = useAuth()
  const [mode, setMode] = useState('enhance')
  const [provider, setProvider] = useState('auto')
  const [status, setStatus] = useState(null)
  const [statusErr, setStatusErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [key, setKey] = useState(getLocalKey())
  const [keySaved, setKeySaved] = useState(Boolean(getLocalKey()))

  const loadStatus = useCallback(async () => {
    if (!hasBackend || !user) return setStatus(null)
    try {
      setStatusErr('')
      setStatus(await callApi('status'))
    } catch (e) {
      setStatus(null)
      setStatusErr(e.message)
    }
  }, [hasBackend, user])

  useEffect(() => { loadStatus() }, [loadStatus])

  const providers = status?.providers || []
  const chosen = provider === 'auto' ? providers : providers.filter((p) => p.id === provider)
  const limitReached = status && !status.unlimited && status.used >= status.limit
  const canRun = hasBackend
    ? Boolean(user && status?.enabled && chosen.length && !limitReached)
    : keySaved

  async function run() {
    setBusy(true)
    setErr('')
    try {
      const maxSide = hasBackend ? Math.min(2048, ...chosen.map((p) => p.maxSide)) : 2048
      const { base64, mime } = await bitmapToJpegBase64(src.bitmap, maxSide)
      const res = hasBackend
        ? await enhanceOnServer({ base64, mime, mode, provider })
        : await enhanceWithOwnKey({ base64, mime, mode })
      const bitmap = await createImageBitmap(res.blob)
      onResult({ bitmap, provider: res.provider, mode })
      if (hasBackend && res.limit !== undefined) setStatus((s) => (s ? { ...s, used: res.used, limit: res.limit } : s))
    } catch (e) {
      setErr(e.message)
      if (hasBackend) loadStatus()
    } finally {
      setBusy(false)
    }
  }

  function saveKey() {
    setLocalKey(key)
    setKeySaved(Boolean(key.trim()))
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="label">AI rejimi</p>
        <div className="grid grid-cols-2 gap-2">
          {AI_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              aria-pressed={mode === m.id}
              className={`card-soft p-2.5 text-left transition-colors ${mode === m.id ? '!border-[var(--cyan)] bg-[rgba(34,211,238,.07)]' : 'hover:!border-[var(--line-2)]'}`}
            >
              <div className="text-sm font-semibold">{m.icon} {m.name}</div>
              <div className="faint mt-0.5 text-[11px] leading-snug">{m.hint}</div>
            </button>
          ))}
        </div>
      </div>

      {hasBackend ? (
        !user ? (
          <div className="alert alert-info">
            AI funksiyasidan foydalanish uchun hisobingizga kiring.
            <div className="mt-2 flex gap-2">
              <Link className="btn btn-primary btn-sm" to="/login">Kirish</Link>
              <Link className="btn btn-sm" to="/register">Ro‘yxatdan o‘tish</Link>
            </div>
          </div>
        ) : statusErr ? (
          <div className="alert alert-err">{statusErr}</div>
        ) : !status ? (
          <p className="muted flex items-center gap-2 text-sm"><span className="spinner" /> Tekshirilmoqda…</p>
        ) : !status.enabled ? (
          <div className="alert alert-info">AI xizmati hozircha administrator tomonidan o‘chirib qo‘yilgan.</div>
        ) : !providers.length ? (
          <div className="alert alert-info">
            Hali AI kaliti qo‘shilmagan.{' '}
            {isSuper ? <>Boshqaruv bo‘limida <Link className="underline" to="/admin?tab=keys">API kalit qo‘shing</Link>.</> : 'Administratorga murojaat qiling.'}
          </div>
        ) : (
          <>
            <div>
              <label className="label" htmlFor="ai-provider">AI xizmati</label>
              <select id="ai-provider" className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="auto">Avtomatik (eng yaxshi mavjud)</option>
                {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <p className="muted text-xs">
              {status.unlimited ? 'Cheklovsiz foydalanish' : <>Bugungi limit: <b className="text-white">{status.used}</b> / {status.limit}</>}
            </p>
            {limitReached && <div className="alert alert-err">Bugungi AI limitingiz tugadi. Ertaga qayta urinib ko‘ring.</div>}
          </>
        )
      ) : (
        <div className="card-soft space-y-2 p-3">
          <label className="label" htmlFor="gem-key">Google Gemini API kaliti</label>
          <input id="gem-key" className="input" type="password" autoComplete="off" placeholder="AIza…" value={key} onChange={(e) => { setKey(e.target.value); setKeySaved(false) }} />
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-sm" onClick={saveKey} disabled={!key.trim() || keySaved}>{keySaved ? 'Saqlandi ✓' : 'Saqlash'}</button>
            {keySaved && <button className="btn btn-ghost btn-sm" onClick={() => { setKey(''); setLocalKey(''); setKeySaved(false) }}>O‘chirish</button>}
            <a className="text-xs text-[var(--cyan)] underline" href={PROVIDER_INFO.gemini.keyUrl} target="_blank" rel="noreferrer">Kalitni qayerdan olaman?</a>
          </div>
          <p className="faint text-[11px] leading-snug">
            Kalit faqat shu qurilmadagi brauzeringizda saqlanadi va faqat Google’ga yuboriladi. Umumiy kompyuterda saqlamang.
          </p>
        </div>
      )}

      <button className="btn btn-primary w-full !min-h-12 text-[15px]" onClick={run} disabled={!canRun || busy}>
        {busy ? <><span className="spinner" /> AI ishlayapti… (10–40 soniya)</> : <>✨ AI bilan ishlov berish</>}
      </button>
      {err && <div className="alert alert-err" role="alert">{err}</div>}

      {ai && (
        <div className="card-soft space-y-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">AI natijasi tayyor</span>
            <span className="badge badge-ok">{PROVIDER_INFO[ai.provider]?.label || ai.provider}</span>
          </div>
          <p className="faint text-xs">{ai.bitmap.width}×{ai.bitmap.height} px · {AI_MODES.find((m) => m.id === ai.mode)?.name}</p>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[var(--cyan)]" checked={useAi} onChange={(e) => onUseAi(e.target.checked)} />
            AI natijasini ishlatish
          </label>
          <p className="faint text-[11px] leading-snug">AI natijasi ustiga “Sozlash” bo‘limidagi aniqlik, kattalashtirish va ranglarni ham qo‘shishingiz mumkin.</p>
          <button className="btn btn-ghost btn-sm" onClick={onDiscard}>Natijani o‘chirish</button>
        </div>
      )}

      <p className="faint text-[11px] leading-snug">
        Eslatma: AI rasmni qayta chizadi, shuning uchun mayda detallar (matn, yuz chiziqlari) o‘zgarishi mumkin. Muhim rasmlarda asl nusxa bilan solishtiring.
      </p>
    </div>
  )
}
