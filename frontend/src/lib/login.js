// "Login" (masalan, Quvonchbek) yoki email bilan kirish.
// Supabase Auth faqat email bilan ishlaydi, shuning uchun email ko'rinishida bo'lmagan login ichki emailga o'giriladi:
//   Quvonchbek  ->  quvonchbek@tiniq.local
// (Bunday hisob SUPER_ADMIN.sql orqali yaratiladi; oddiy foydalanuvchilar haqiqiy email bilan ro'yxatdan o'tadi.)
export const LOGIN_DOMAIN = 'tiniq.local'

export function loginToEmail(input) {
  const v = String(input || '').trim()
  if (!v) return ''
  if (v.includes('@')) return v
  return `${v.toLowerCase().replace(/\s+/g, '')}@${LOGIN_DOMAIN}`
}

export const isLoginEmail = (email) => String(email || '').toLowerCase().endsWith(`@${LOGIN_DOMAIN}`)

// Ekranda ichki email o'rniga chiroyli ko'rinish: quvonchbek@tiniq.local -> quvonchbek
export const emailToLogin = (email) => (isLoginEmail(email) ? String(email).split('@')[0] : String(email || ''))
