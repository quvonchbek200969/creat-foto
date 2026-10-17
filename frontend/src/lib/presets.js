import { DEFAULTS } from './pixels.js'

// Tayyor sozlamalar — bir bosishda qo'llanadi
export const PRESETS = [
  {
    id: 'auto',
    icon: '✨',
    name: 'Avto yaxshilash',
    hint: 'Yorug‘lik, kontrast va aniqlikni o‘zi tuzatadi',
    params: { denoise: 25, auto: 60, sharpen: 55, radius: 1.2, clarity: 25, vibrance: 20 },
  },
  {
    id: 'sharp',
    icon: '🔍',
    name: 'Tiniqlashtirish',
    hint: 'Xira rasmni keskinlashtiradi',
    params: { denoise: 15, sharpen: 90, radius: 1.5, clarity: 35 },
  },
  {
    id: 'upscale',
    icon: '🔭',
    name: '2× kattalashtirish',
    hint: 'O‘lchamni 2 barobar oshiradi va tiniqligini saqlaydi',
    params: { scale: 2, denoise: 20, sharpen: 65, radius: 1.6, clarity: 20 },
  },
  {
    id: 'old',
    icon: '📜',
    name: 'Eski rasm',
    hint: 'Xira va rangi o‘chgan rasm uchun',
    params: { denoise: 45, auto: 90, contrast: 15, sharpen: 65, radius: 1.4, clarity: 35, saturation: 10 },
  },
  {
    id: 'portrait',
    icon: '🙂',
    name: 'Portret',
    hint: 'Yumshoq: teri tekis, ko‘z va soch aniq',
    params: { denoise: 40, auto: 30, sharpen: 35, radius: 1.1, clarity: 10, vibrance: 15, warmth: 6 },
  },
  {
    id: 'night',
    icon: '🌙',
    name: 'Qorong‘i rasm',
    hint: 'Kam yorug‘likda olingan rasmni yoritadi, shovqinni tozalaydi',
    params: { denoise: 65, auto: 85, brightness: 12, sharpen: 45, radius: 1.3, clarity: 15, vibrance: 15 },
  },
]

export function presetParams(id) {
  const p = PRESETS.find((x) => x.id === id)
  return { ...DEFAULTS, ...(p ? p.params : {}) }
}

// Sozlash tabidagi slayderlar
export const SLIDERS = [
  { group: 'Tiniqlik', items: [
    { key: 'sharpen', label: 'Aniqlik', min: 0, max: 100, hint: 'Chegaralarni keskinlashtiradi' },
    { key: 'radius', label: 'Aniqlik radiusi', min: 0.5, max: 4, step: 0.1, unit: 'px', hint: 'Xira rasmda kattaroq qiymat' },
    { key: 'clarity', label: 'Tiniqlik', min: 0, max: 100, hint: 'Lokal kontrast — teksturani ochadi' },
    { key: 'denoise', label: 'Shovqinni kamaytirish', min: 0, max: 100, hint: 'Donadorlik va JPG izlarini yumshatadi' },
  ] },
  { group: 'Yorug‘lik va rang', items: [
    { key: 'auto', label: 'Avto-tuzatish', min: 0, max: 100, hint: 'Qorong‘i yoki xira rasmni tekislaydi' },
    { key: 'brightness', label: 'Yorqinlik', min: -100, max: 100 },
    { key: 'contrast', label: 'Kontrast', min: -100, max: 100 },
    { key: 'saturation', label: 'To‘yinganlik', min: -100, max: 100 },
    { key: 'vibrance', label: 'Jonlilik', min: 0, max: 100, hint: 'Faqat so‘nik ranglarni jonlantiradi' },
    { key: 'warmth', label: 'Iliqlik', min: -100, max: 100, hint: 'Manfiy — sovuq, musbat — iliq' },
  ] },
]

export function isDefault(params) {
  return Object.keys(DEFAULTS).every((k) => params[k] === DEFAULTS[k])
}
