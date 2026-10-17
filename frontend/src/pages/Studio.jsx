import { useCallback, useEffect, useRef, useState } from 'react'
import AiPanel from '../components/AiPanel.jsx'
import CompareSlider from '../components/CompareSlider.jsx'
import Slider from '../components/Slider.jsx'
import {
  ACCEPT, FORMATS, LIMITS, bitmapToImageData, downloadBlob, formatBytes, imageToBlob, loadBitmap,
  makeSampleFile, paintBitmap, paintImageData, runProcess,
} from '../lib/engine.js'
import { DEFAULTS, effectiveScale } from '../lib/pixels.js'
import { PRESETS, SLIDERS, isDefault, presetParams } from '../lib/presets.js'

const PREVIEW_MAX = 1400
const TABS = [
  { id: 'presets', label: 'Tezkor' },
  { id: 'adjust', label: 'Sozlash' },
  { id: 'ai', label: '✨ AI' },
]

const FEATURES = [
  ['🔍', 'Tiniqlashtirish', 'Xira rasmning chegaralarini keskinlashtiradi va teksturani ochadi.'],
  ['🔭', 'Kattalashtirish', '2×–4× gacha, Lanczos usulida — mayda detallar yo‘qolmaydi.'],
  ['🧹', 'Shovqin tozalash', 'Donadorlik va JPG izlarini chegarani buzmasdan yumshatadi.'],
  ['✨', 'AI yordamchi', 'Gemini, OpenAI, Replicate yoki Stability orqali chuqur yaxshilash.'],
  ['🎨', 'Rang va yorug‘lik', 'Avto-tuzatish, kontrast, to‘yinganlik, iliqlik — jonli ko‘rinish bilan.'],
  ['🔒', 'Maxfiylik', 'Oddiy ishlov rasmni qurilmangizdan chiqarmaydi, hammasi brauzerda.'],
]

export default function Studio() {
  const [src, setSrc] = useState(null) // { bitmap, name, size, shrunk }
  const [ai, setAi] = useState(null) // { bitmap, provider, mode }
  const [useAi, setUseAi] = useState(true)
  const [params, setParams] = useState(DEFAULTS)
  const [tab, setTab] = useState('presets')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [over, setOver] = useState(false)
  const [loadingFile, setLoadingFile] = useState(false)
  const [view, setView] = useState({ w: 0, h: 0 })
  const [fmt, setFmt] = useState('png')
  const [quality, setQuality] = useState(92)
  const [exporting, setExporting] = useState(false)
  const [done, setDone] = useState(null)

  const beforeRef = useRef(null)
  const afterRef = useRef(null)
  const previewRef = useRef(null)
  const paramsRef = useRef(params)
  const baseRef = useRef(null)
  const job = useRef({ running: false, again: false })
  const fileInput = useRef(null)

  const base = src ? (useAi && ai ? ai.bitmap : src.bitmap) : null

  /* ───────── Jonli ko'rib chiqish (kichraytirilgan nusxada, "oxirgisi yutadi") ───────── */
  const renderPreview = useCallback(() => {
    const j = job.current
    if (j.running) { j.again = true; return }
    j.running = true
    setBusy(true)
    ;(async () => {
      try {
        do {
          j.again = false
          const prev = previewRef.current
          const b = baseRef.current
          if (!prev || !b) break
          const p = paramsRef.current
          const s = effectiveScale(b.width, b.height, p.scale, LIMITS.maxOut)
          const k = Math.min(1, Math.max(prev.width, prev.height) / (Math.max(b.width, b.height) * s))
          const out = await runProcess(prev, { ...p, scale: 1 }, k)
          if (afterRef.current && previewRef.current === prev) paintImageData(afterRef.current, out)
        } while (j.again)
      } catch (e) {
        setErr(e.message)
      } finally {
        j.running = false
        setBusy(false)
      }
    })()
  }, [])

  useEffect(() => {
    paramsRef.current = params
    if (previewRef.current) renderPreview()
  }, [params, renderPreview])

  useEffect(() => {
    baseRef.current = base
    if (!base || !src) { previewRef.current = null; return }
    const img = bitmapToImageData(base, PREVIEW_MAX)
    previewRef.current = img
    setView({ w: img.width, h: img.height })
    if (beforeRef.current) paintBitmap(beforeRef.current, src.bitmap, img.width, img.height)
    renderPreview()
  }, [base, src, renderPreview])

  /* ───────── Rasm ochish: tanlash, sudrab tashlash, Ctrl+V ───────── */
  const openFile = useCallback(async (file) => {
    if (!file) return
    setErr('')
    setDone(null)
    setLoadingFile(true)
    try {
      const { bitmap, shrunk } = await loadBitmap(file)
      setAi(null)
      setUseAi(true)
      setParams(DEFAULTS)
      setTab('presets')
      setSrc({ bitmap, name: file.name || 'rasm.png', size: file.size, shrunk })
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoadingFile(false)
    }
  }, [])

  useEffect(() => {
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'))
      if (item) openFile(item.getAsFile())
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [openFile])

  const dropProps = {
    onDragOver: (e) => { e.preventDefault(); setOver(true) },
    onDragLeave: () => setOver(false),
    onDrop: (e) => { e.preventDefault(); setOver(false); openFile(e.dataTransfer.files?.[0]) },
  }

  /* ───────── Saqlash (to'liq o'lchamda ishlov) ───────── */
  async function exportImage() {
    if (!base) return
    setExporting(true)
    setErr('')
    try {
      const out = await runProcess(bitmapToImageData(base, 0), paramsRef.current, 1)
      const blob = await imageToBlob(out, fmt, quality / 100)
      const name = `${(src.name || 'rasm').replace(/\.[^.]+$/, '')}-tiniq.${FORMATS[fmt].ext}`
      downloadBlob(blob, name)
      setDone({ name, size: blob.size, w: out.width, h: out.height })
    } catch (e) {
      setErr(e.message || 'Saqlashda xato')
    } finally {
      setExporting(false)
    }
  }

  const set = (key) => (v) => setParams((p) => ({ ...p, [key]: v }))
  const activePreset = PRESETS.find((p) => {
    const t = presetParams(p.id)
    return Object.keys(DEFAULTS).every((k) => t[k] === params[k])
  })

  /* ───────── 1) Rasm tanlanmagan: bosh ekran ───────── */
  if (!src) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
        <div className="mx-auto max-w-2xl text-center">
          <span className="badge badge-info">Bepul · brauzerda · AI bilan</span>
          <h1 className="font-display mt-4 text-4xl font-bold leading-tight sm:text-5xl">
            Xira rasmni <span className="text-grad">bir zumda tiniq</span> qiling
          </h1>
          <p className="muted mx-auto mt-4 max-w-xl text-base sm:text-lg">
            Tiniqlashtirish, kattalashtirish, shovqin tozalash va ranglarni tuzatish. Xohlasangiz — sun’iy intellekt yordamida.
          </p>
        </div>

        <div className={`drop mt-9 px-6 py-14 text-center ${loadingFile ? 'opacity-60' : ''}`} data-over={over} {...dropProps}>
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-[var(--panel-2)] text-3xl">🖼️</div>
          <p className="text-lg font-semibold">
            <span className="[@media(pointer:coarse)]:hidden">Rasmni shu yerga tashlang</span>
            <span className="hidden [@media(pointer:coarse)]:inline">Galereyadan rasm tanlang</span>
          </p>
          <p className="muted mt-1 text-sm">
            <span className="[@media(pointer:coarse)]:hidden">yoki Ctrl+V bilan qo‘ying · </span>JPG, PNG, WebP
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button className="btn btn-primary !min-h-12 px-6" onClick={() => fileInput.current?.click()} disabled={loadingFile}>
              {loadingFile ? <><span className="spinner" /> Ochilmoqda…</> : 'Rasm tanlash'}
            </button>
            <button className="btn !min-h-12" onClick={async () => openFile(await makeSampleFile())} disabled={loadingFile}>Namuna bilan sinash</button>
          </div>
          <input ref={fileInput} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { openFile(e.target.files?.[0]); e.target.value = '' }} />
        </div>
        {err && <div className="alert alert-err mt-4" role="alert">{err}</div>}

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([icon, title, text]) => (
            <div key={title} className="card p-4">
              <div className="text-2xl">{icon}</div>
              <h3 className="mt-2 font-semibold">{title}</h3>
              <p className="muted mt-1 text-sm leading-snug">{text}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  /* ───────── 2) Muharrir ───────── */
  const s = effectiveScale(base.width, base.height, params.scale, LIMITS.maxOut)
  const outW = Math.round(base.width * s)
  const outH = Math.round(base.height * s)
  const aspectDiff = Math.abs(base.width / base.height - src.bitmap.width / src.bitmap.height) / (src.bitmap.width / src.bitmap.height)

  return (
    <div className="mx-auto grid max-w-[1500px] gap-4 px-4 pb-24 pt-4 lg:grid-cols-[minmax(0,1fr)_390px] lg:pb-4">
      <section className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" title={src.name}>{src.name}</p>
            <p className="faint text-xs">
              {src.bitmap.width}×{src.bitmap.height} px · {formatBytes(src.size)}
              {(s > 1 || (useAi && ai)) && <> → <span className="text-[var(--cyan)]">{outW}×{outH} px</span></>}
            </p>
          </div>
          <button className="btn btn-sm" onClick={() => fileInput.current?.click()}>Yangi rasm</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setParams(DEFAULTS); setAi(null) }} disabled={isDefault(params) && !ai}>Asliga qaytarish</button>
          <input ref={fileInput} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { openFile(e.target.files?.[0]); e.target.value = '' }} />
        </div>

        {src.shrunk && <div className="alert alert-info">Rasm juda katta bo‘lgani uchun {LIMITS.maxIn / 1e6} megapikselgacha kichraytirildi.</div>}
        {err && <div className="alert alert-err" role="alert">{err}</div>}
        {useAi && ai && aspectDiff > 0.05 && <div className="alert alert-info">AI natijasining nisbati asl rasmdan farq qiladi — solishtirishda biroz cho‘zilgan ko‘rinishi mumkin.</div>}

        {/* Telefonda rasm tepada qotib turadi — slayderlarni surganda natija ko'rinib turadi */}
        <div className="sticky top-[57px] z-20 -mx-4 bg-[rgba(11,13,17,.94)] px-4 py-2 backdrop-blur lg:static lg:mx-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <div {...dropProps} className={over ? 'rounded-2xl ring-2 ring-[var(--cyan)]' : ''}>
            <CompareSlider beforeRef={beforeRef} afterRef={afterRef} width={view.w} height={view.h} busy={busy} afterLabel={useAi && ai ? 'Tiniq + AI' : 'Tiniq'} />
          </div>
        </div>
        <p className="faint text-center text-xs">Chiziqni suring — asl va natijani solishtiring. Ko‘rinish tezlik uchun kichraytirilgan; saqlanadigan fayl to‘liq sifatda bo‘ladi.</p>

        <div className="card flex flex-wrap items-end gap-3 p-3">
          <div>
            <label className="label" htmlFor="fmt">Format</label>
            <select id="fmt" className="input !min-h-10 !w-auto" value={fmt} onChange={(e) => setFmt(e.target.value)}>
              {Object.entries(FORMATS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
            </select>
          </div>
          {fmt !== 'png' && (
            <div className="min-w-[150px] flex-1 sm:max-w-[220px]">
              <Slider label="Sifat" value={quality} min={50} max={100} def={92} unit="%" onChange={setQuality} />
            </div>
          )}
          <div className="ml-auto flex items-center gap-3">
            {done && <span className="faint hidden text-xs sm:inline">Saqlandi: {done.w}×{done.h} · {formatBytes(done.size)}</span>}
            <button className="btn btn-primary !min-h-11 hidden px-5 lg:inline-flex" onClick={exportImage} disabled={exporting}>
              {exporting ? <><span className="spinner" /> Tayyorlanmoqda…</> : <>⬇ Yuklab olish</>}
            </button>
          </div>
        </div>
      </section>

      {/* Telefon: yuklab olish tugmasi har doim pastda */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-[rgba(11,13,17,.94)] px-4 pt-3 backdrop-blur lg:hidden" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-semibold">{outW}×{outH} px</p>
            <p className="faint truncate">{done ? `Saqlandi · ${formatBytes(done.size)}` : FORMATS[fmt].ext.toUpperCase()}</p>
          </div>
          <button className="btn btn-primary !min-h-12 px-6" onClick={exportImage} disabled={exporting}>
            {exporting ? <><span className="spinner" /> Tayyorlanmoqda…</> : <>⬇ Yuklab olish</>}
          </button>
        </div>
      </div>

      <aside className="card min-w-0 p-3 lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-84px)] lg:overflow-y-auto">
        <div className="tab-row mb-3" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className="tab" onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {tab === 'presets' && (
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setParams(presetParams(p.id))}
                aria-pressed={activePreset?.id === p.id}
                className={`card-soft p-3 text-left transition-colors ${activePreset?.id === p.id ? '!border-[var(--cyan)] bg-[rgba(34,211,238,.07)]' : 'hover:!border-[var(--line-2)]'}`}
              >
                <div className="text-xl">{p.icon}</div>
                <div className="mt-1 text-sm font-semibold leading-tight">{p.name}</div>
                <div className="faint mt-0.5 text-[11px] leading-snug">{p.hint}</div>
              </button>
            ))}
            <p className="faint col-span-2 mt-1 text-xs">Tayyor sozlamani tanlang, so‘ng “Sozlash” bo‘limida o‘zingizga moslang.</p>
          </div>
        )}

        {tab === 'adjust' && (
          <div className="space-y-4">
            <div>
              <p className="label">Kattalashtirish</p>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} className={`btn btn-sm ${params.scale === n ? '!border-[var(--cyan)] !bg-[rgba(34,211,238,.1)]' : ''}`} aria-pressed={params.scale === n} onClick={() => set('scale')(n)}>{n}×</button>
                ))}
              </div>
              {params.scale > 1 && (
                <p className="faint mt-1.5 text-xs">
                  Natija: <b className="text-white">{outW}×{outH}</b> px
                  {s < params.scale && <span className="text-[var(--amber)]"> · xotira uchun {s}× bilan cheklandi</span>}
                </p>
              )}
            </div>
            {SLIDERS.map((g) => (
              <div key={g.group}>
                <p className="label !mb-1">{g.group}</p>
                {g.items.map((it) => (
                  <Slider key={it.key} {...it} value={params[it.key]} def={DEFAULTS[it.key]} onChange={set(it.key)} />
                ))}
              </div>
            ))}
            <button className="btn btn-ghost btn-sm w-full" onClick={() => setParams(DEFAULTS)} disabled={isDefault(params)}>Hammasini boshlang‘ich holatga qaytarish</button>
          </div>
        )}

        {tab === 'ai' && (
          <AiPanel
            src={src}
            ai={ai}
            useAi={useAi}
            onUseAi={setUseAi}
            onResult={(r) => { setAi(r); setUseAi(true); setErr('') }}
            onDiscard={() => { setAi(null); setUseAi(true) }}
          />
        )}
      </aside>
    </div>
  )
}
