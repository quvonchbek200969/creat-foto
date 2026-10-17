// Ilovani telefonga o'rnatish: brauzerning o'rnatish so'rovi, platforma aniqlash va APK mavjudligini tekshirish.
import { useEffect, useState } from 'react'

export const APK_PATH = '/tiniq.apk'

let deferred = null // beforeinstallprompt hodisasi (Android Chrome / Edge)
const subs = new Set()
const notify = () => subs.forEach((fn) => fn())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

export function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export function detectPlatform() {
  const ua = navigator.userAgent || ''
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const android = /Android/i.test(ua)
  // Telegram, Instagram, Facebook ichki brauzerlari ilovani o'rnata olmaydi
  const inApp = /FBAN|FBAV|Instagram|Telegram|Line\/|MicroMessenger|; wv\)/i.test(ua)
  const safari = ios && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua)
  return { ios, android, inApp, safari, mobile: ios || android }
}

export async function promptInstall() {
  if (!deferred) return 'unavailable'
  deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  notify()
  return outcome // 'accepted' | 'dismissed'
}

// APK fayl haqiqatan joylanganmi? Netlify SPA qoidasi yo'q faylga index.html (text/html) qaytaradi — shuni ajratamiz.
let apkCheck = null
export function checkApk() {
  if (!apkCheck) {
    apkCheck = fetch(APK_PATH, { method: 'HEAD', cache: 'no-store' })
      .then((r) => r.ok && !/text\/html/i.test(r.headers.get('content-type') || ''))
      .catch(() => false)
  }
  return apkCheck
}

export function useInstall() {
  const [, force] = useState(0)
  const [apk, setApk] = useState(false)
  useEffect(() => {
    const fn = () => force((n) => n + 1)
    subs.add(fn)
    checkApk().then(setApk)
    return () => subs.delete(fn)
  }, [])
  return { canPrompt: Boolean(deferred), standalone: isStandalone(), apk, platform: detectPlatform() }
}
