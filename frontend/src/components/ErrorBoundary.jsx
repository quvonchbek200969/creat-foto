import { Component } from 'react'
import { resetApp } from '../lib/recover.js'

// Ilovada kutilmagan xato bo'lsa, butun sahifa qora bo'lib qolmasin: xato matni va tiklash tugmalari ko'rsatiladi.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Tiniq xatosi:', error, info?.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const msg = String(error?.message || error).slice(0, 400)
    return (
      <div className="bg-glow grid min-h-screen place-items-center px-4 py-10">
        <div className="card w-full max-w-md p-6">
          <h1 className="font-display text-xl font-bold">Sahifa ochilmadi</h1>
          <p className="muted mt-2 text-sm leading-relaxed">
            Kutilmagan xato yuz berdi. Quyidagi tugmani bosing — ko‘pincha shu yetarli. Takrorlansa, xato matnini yuboring.
          </p>
          <pre className="faint mt-3 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--bg)] p-2 text-xs">{msg}</pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => location.reload()}>Qayta yuklash</button>
            <button className="btn" onClick={resetApp}>Keshni tozalab yuklash</button>
          </div>
        </div>
      </div>
    )
  }
}
