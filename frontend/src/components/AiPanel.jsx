import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { AI_MODES, PROVIDER_INFO, callApi, enhanceOnServer, enhanceWithOwnKey, getLocalKey, setLocalKey } from '../lib/ai.js'
import { bitmapToJpegBase64, fitToSource } from '../lib/engine.js'
import { nearestAspect } from '../lib/pixels.js'

// AI bilan yaxshilash paneli. Natija onResult({bitmap, provider, mode, nativeW, nativeH}) orqali Studiyaga qaytadi.
// compact — "Tezkor" bo'limidagi ixcham Gemini kartasi (bitta tugma); aks holda to'liq panel ("✨ AI" bo'limi).
// Manba: server tayyor bo'lsa — server (kalitlar serverda), aks holda yoki server xato bersa — foydalanuvchining o'z Gemini kaliti.
export default function AiPanel({ src, ai, target = 0, useAi, onUseAi, onResult, onDiscard, compact = false }) {
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
  const limitReached = Boolean(status && !status.unlimited && status.used >= status.limit)
  const serverReady = Boolean(hasBackend && user && status?.enabled && chosen.length && !limitReached)
  const canRun = serverReady || keySaved

  async function run() {
    setBusy(true)
    setErr('')
    try {
      // 3K/4K maqsadida Gemini 4K natija beradi (ko'proq detal), kirishga ham kattaroq rasm yuboriladi
      const size = target >= 3072 ? '4K' : '2K'
      const wantSide = size === '4K' ? 3072 : 2048
      const maxSide = serverReady ? Math.min(wantSide, ...chosen.map((p) => p.maxSide)) : wantSide
      const { base64, mime, width, height } = await bitmapToJpegBase64(src.bitmap, maxSide)
      const aspect = nearestAspect(width, height)
      let res
      if (serverReady) {
        try {
          res = await enhanceOnServer({ base64, mime, mode, provider, aspect, size })
        } catch (e) {
          if (!keySaved) throw e // server ishlamadi, lekin o'z kaliti bor bo'lsa — o'sha bilan davom etamiz
          res = await enhanceWithOwnKey({ base64, mime, mode, aspect, size })
        }
      } else {
        res = await enhanceWithOwnKey({ base64, mime, mode, aspect, size })
      }
      const raw = await createImageBitmap(res.blob)
      const nativeW = raw.width, nativeH = raw.height
      const bitmap = await fitToSource(raw, src.bitmap)
      onResult({ bitmap, provider: res.provider, mode, nativeW, nativeH })
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

  // Nega server ishlatilmayapti — qisqa tushuntirish (o'z kalit bilan ishlash mumkinligi baribir aytiladi)
  function serverNote() {
    if (!hasBackend || serverReady) return null
    if (!user) {
      return (
        <>
          Server AI uchun hisobingizga kiring:{' '}
          <Link className="underline" to="/login">Kirish</Link> · <Link className="underline" to="/register">Ro‘yxatdan o‘tish</Link>
        </>
      )
    }
    if (statusErr) return statusErr
    if (!status) return <span className="inline-flex items-center gap-2"><span className="spinner" /> Server tekshirilmoqda…</span>
    if (!status.enabled) return 'AI xizmati hozircha administrator tomonidan o‘chirib qo‘yilgan.'
    if (!providers.length) {
      return isSuper
        ? <>Serverda AI kaliti yo‘q — <Link className="underline" to="/admin?tab=keys">API kalit qo‘shing</Link>.</>
        : 'Serverda AI kaliti hali qo‘shilmagan.'
    }
    if (limitReached) return 'Bugungi server limitingiz tugadi.'
    return null
  }
  const note = serverNote()

  const keyBox = (
    <div className="card-soft space-y-2 p-3">
      <label className="label" htmlFor={`gem-key-${compact ? 'c' : 'f'}`}>Google Gemini API kaliti{hasBackend ? ' (o‘z kalitingiz)' : ''}</label>
      <input
        id={`gem-key-${compact ? 'c' : 'f'}`}
        className="input"
        type="password"
        autoComplete="off"
        placeholder="AIza…"
        value={key}
        onChange={(e) => { setKey(e.target.value); setKeySaved(false) }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-sm" onClick={saveKey} disabled={!key.trim() || keySaved}>{keySaved ? 'Saqlandi ✓' : 'Saqlash'}</button>
        {keySaved && <button className="btn btn-ghost btn-sm" onClick={() => { setKey(''); setLocalKey(''); setKeySaved(false) }}>O‘chirish</button>}
        <a className="text-xs text-[var(--cyan)] underline" href={PROVIDER_INFO.gemini.keyUrl} target="_blank" rel="noreferrer">Kalitni qayerdan olaman?</a>
      </div>
      <p className="faint text-[11px] leading-snug">
        Gemini rasm modellari <b>bepul tarifda ishlamaydi</b>: kalit to‘lov (billing) yoqilgan Google loyihasidan bo‘lishi kerak
        (rasm boshiga taxminan 3–5 sent). Kalit faqat shu brauzerda saqlanadi va faqat Google’ga yuboriladi. Umumiy kompyuterda saqlamang.
      </p>
    </div>
  )

  const runButton = (
    <button className="btn btn-primary w-full !min-h-12 text-[15px]" onClick={run} disabled={!canRun || busy}>
      {busy
        ? <><span className="spinner" /> Gemini ishlayapti… ({target >= 3072 ? '40–90' : '10–40'} soniya)</>
        : compact ? <>✨ Gemini bilan tiniqlashtirish</> : <>✨ AI bilan ishlov berish</>}
    </button>
  )

  const result = ai && (
    <div className="card-soft space-y-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">AI natijasi tayyor</span>
        <span className="badge badge-ok">{PROVIDER_INFO[ai.provider]?.label || ai.provider}</span>
      </div>
      <p className="faint text-xs">
        {AI_MODES.find((m) => m.id === ai.mode)?.name} · AI qaytargan: {ai.nativeW || ai.bitmap.width}×{ai.nativeH || ai.bitmap.height} px
        {ai.bitmap.width !== (ai.nativeW || ai.bitmap.width) && <> → asl o‘lchamga keltirildi</>}
      </p>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-[var(--cyan)]" checked={useAi} onChange={(e) => onUseAi(e.target.checked)} />
        AI natijasini ishlatish
      </label>
      <p className="faint text-[11px] leading-snug">AI natijasi ustiga yengil aniqlik avtomatik qo‘shildi. “Sozlash” bo‘limida aniqlik, kattalashtirish va ranglarni o‘zgartirishingiz mumkin.</p>
      <button className="btn btn-ghost btn-sm" onClick={onDiscard}>Natijani o‘chirish</button>
    </div>
  )

  const limitLine = serverReady && (
    <p className="muted text-xs">
      {status.unlimited ? 'Cheklovsiz foydalanish' : <>Bugungi limit: <b className="text-white">{status.used}</b> / {status.limit}</>}
    </p>
  )

  /* ───────── Ixcham ko'rinish: "Tezkor" bo'limining tepasida ───────── */
  if (compact) {
    return (
      <div className="mb-3 space-y-3 rounded-2xl border border-[rgba(34,211,238,.35)] bg-[rgba(34,211,238,.06)] p-3">
        <div>
          <p className="text-sm font-semibold">✨ Gemini AI bilan tiniqlashtirish</p>
          <p className="faint mt-0.5 text-xs leading-snug">
            Eng kuchli usul: xira rasmni qayta tiklaydi, mayda detallarni ochadi. Natija ustiga yengil aniqlik ham qo‘shiladi.
          </p>
        </div>
        {note && <div className="alert alert-info text-xs">{note}</div>}
        {limitLine}
        {(!serverReady || err) && keyBox}
        {runButton}
        {err && <div className="alert alert-err" role="alert">{err}</div>}
        {result}
      </div>
    )
  }

  /* ───────── To'liq panel ───────── */
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

      {note && <div className="alert alert-info text-sm">{note}</div>}
      {serverReady && (
        <>
          <div>
            <label className="label" htmlFor="ai-provider">AI xizmati</label>
            <select id="ai-provider" className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="auto">Avtomatik (eng yaxshi mavjud)</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          {limitLine}
        </>
      )}
      {(!serverReady || err) && keyBox}

      {runButton}
      {err && <div className="alert alert-err" role="alert">{err}</div>}
      {result}

      <p className="faint text-[11px] leading-snug">
        Eslatma: AI rasmni qayta chizadi, shuning uchun mayda detallar (matn, yuz chiziqlari) o‘zgarishi mumkin. Muhim rasmlarda asl nusxa bilan solishtiring.
      </p>
    </div>
  )
}
