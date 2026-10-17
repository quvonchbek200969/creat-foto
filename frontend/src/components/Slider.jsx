// Nom, qiymat va qayta o'rnatish (ikki marta bosish) bilan slayder
export default function Slider({ label, hint, value, min, max, step = 1, unit = '', def = 0, onChange }) {
  const pct = ((value - min) / (max - min)) * 100
  const shown = Number.isInteger(step) ? value : Number(value).toFixed(1)
  const changed = value !== def
  return (
    <div className="py-1.5">
      <div className="mb-0.5 flex items-baseline justify-between gap-2">
        <label className="text-[13px] font-semibold" htmlFor={`sl-${label}`} title={hint}>{label}</label>
        <button
          type="button"
          onClick={() => onChange(def)}
          disabled={!changed}
          title={changed ? 'Boshlang‘ich qiymatga qaytarish' : ''}
          className={`font-mono text-xs tabular-nums ${changed ? 'text-[var(--cyan)] hover:underline' : 'faint'} disabled:cursor-default`}
        >
          {shown}{unit}
        </button>
      </div>
      <input
        id={`sl-${label}`}
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--p': `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(def)}
      />
      {hint && <p className="faint -mt-0.5 text-[11px] leading-tight">{hint}</p>}
    </div>
  )
}
