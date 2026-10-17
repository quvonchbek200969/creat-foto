import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { APK_PATH, promptInstall, useInstall } from '../lib/install.js'

// "Ilovani yuklab olish" tugmasi va ko'rsatmali oyna.
export default function InstallApp({ className = '', label = '📲 Ilovani yuklab olish' }) {
  const { canPrompt, standalone, apk, platform } = useInstall()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (standalone) return null // allaqachon ilova sifatida ochilgan

  async function install() {
    setBusy(true)
    const r = await promptInstall()
    setBusy(false)
    if (r === 'accepted') setOpen(false)
  }

  return (
    <>
      <button type="button" className={className || 'btn btn-sm'} onClick={() => setOpen(true)}>{label}</button>
      {open && createPortal(
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/70 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" onClick={() => setOpen(false)} role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="inst-title" className="card max-h-[92vh] w-full max-w-md overflow-y-auto !rounded-b-none p-5 sm:!rounded-b-[14px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <img src="/icons/icon-192.png" alt="" width="48" height="48" className="rounded-xl" />
                <div>
                  <h2 id="inst-title" className="font-display text-lg font-bold">Tiniq ilovasi</h2>
                  <p className="muted text-sm">Telefoningizga o‘rnating</p>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Yopish">✕</button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              {platform.inApp && (
                <div className="alert alert-info">
                  Siz Telegram/Instagram kabi ilova ichidagi brauzerdasiz — bu yerda o‘rnatib bo‘lmaydi.
                  Menyudan (⋮ yoki ⋯) <b>“Brauzerda ochish”</b>ni tanlang: Android’da Chrome, iPhone’da Safari.
                </div>
              )}

              {canPrompt && (
                <button className="btn btn-primary w-full !min-h-12" onClick={install} disabled={busy}>
                  {busy ? <span className="spinner" /> : '⬇ Hoziroq o‘rnatish'}
                </button>
              )}

              {apk && platform.android && (
                <a className="btn w-full !min-h-12" href={APK_PATH} download>📥 APK faylni yuklab olish</a>
              )}

              {platform.ios && !platform.inApp && (
                <ol className="muted list-decimal space-y-1.5 pl-5">
                  {!platform.safari && <li><b className="text-white">Safari</b>’da oching (iPhone’da faqat Safari o‘rnata oladi).</li>}
                  <li>Pastdagi <b className="text-white">Ulashish</b> tugmasini bosing (kvadratdan chiqqan o‘q).</li>
                  <li><b className="text-white">“Bosh ekranga qo‘shish”</b>ni tanlang.</li>
                  <li><b className="text-white">Qo‘shish</b>ni bosing — Tiniq ilova kabi ochiladi.</li>
                </ol>
              )}

              {platform.android && !canPrompt && !platform.inApp && (
                <ol className="muted list-decimal space-y-1.5 pl-5">
                  <li><b className="text-white">Chrome</b>’da menyuni oching (yuqori o‘ngdagi ⋮).</li>
                  <li><b className="text-white">“Ilovani o‘rnatish”</b> yoki <b className="text-white">“Bosh ekranga qo‘shish”</b>ni tanlang.</li>
                  <li>Tasdiqlang — ilova bosh ekranda paydo bo‘ladi.</li>
                </ol>
              )}

              {!platform.mobile && !canPrompt && (
                <p className="muted">
                  Kompyuterda Chrome/Edge manzil satrining o‘ng tomonidagi <b className="text-white">o‘rnatish belgisi</b>ni (⊕) bosing.
                  Telefonda esa shu sahifani oching — ko‘rsatma o‘sha yerda chiqadi.
                </p>
              )}

              <p className="faint text-xs leading-relaxed">
                Ilova sahifani tezroq ochadi, to‘liq ekranda ishlaydi va internet sekin bo‘lsa ham yuklanadi.
                Rasmlar qurilmangizda ishlanadi.
              </p>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
