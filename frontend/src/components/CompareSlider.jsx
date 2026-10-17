import { useCallback, useRef, useState } from 'react'

// Ikki canvas'ni (asl / natija) ustma-ust qo'yib, chegarasini surib solishtiradi.
// Canvas'larni ota komponent chizadi (beforeRef, afterRef).
export default function CompareSlider({ beforeRef, afterRef, width, height, busy, afterLabel = 'Tiniq' }) {
  const box = useRef(null)
  const [pos, setPos] = useState(50)
  const dragging = useRef(false)

  const move = useCallback((clientX) => {
    const r = box.current.getBoundingClientRect()
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)))
  }, [])

  const ratio = width && height ? width / height : 4 / 3

  return (
    <div
      ref={box}
      className="checker relative mx-auto select-none overflow-hidden rounded-2xl border border-[var(--line-2)] touch-pan-y"
      style={{ aspectRatio: `${width || 4} / ${height || 3}`, width: `min(100%, calc(var(--cmp-h) * ${ratio}))` }}
      onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); move(e.clientX) }}
      onPointerMove={(e) => dragging.current && move(e.clientX)}
      onPointerUp={() => { dragging.current = false }}
      onPointerCancel={() => { dragging.current = false }}
    >
      <canvas ref={afterRef} className="absolute inset-0 h-full w-full" />
      <canvas ref={beforeRef} className="absolute inset-0 h-full w-full" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />

      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold backdrop-blur" style={{ opacity: pos > 12 ? 1 : 0 }}>Asl</span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-[var(--cyan)] backdrop-blur" style={{ opacity: pos < 88 ? 1 : 0 }}>{afterLabel}</span>

      <div className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white/90 shadow-[0_0_12px_rgba(0,0,0,.6)]" style={{ left: `${pos}%`, transform: 'translateX(-50%)' }}>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Asl va natijani solishtirish"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pos)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 4))
            if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 4))
          }}
          className="pointer-events-auto absolute left-1/2 top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[#0b0d11] shadow-lg"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l-6 6 6 6M15 6l6 6-6 6" /></svg>
        </div>
      </div>

      {busy && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium backdrop-blur">
          <span className="spinner !h-3.5 !w-3.5" /> Yangilanmoqda…
        </div>
      )}
    </div>
  )
}
