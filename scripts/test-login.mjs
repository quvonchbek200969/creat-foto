// Login <-> email almashtirish mantig'ini sinash. Ishga tushirish:  node scripts/test-login.mjs
import { LOGIN_DOMAIN, emailToLogin, isLoginEmail, loginToEmail } from '../frontend/src/lib/login.js'

let failed = 0
const ok = (c, n, i = '') => { console.log(`${c ? 'OK  ' : 'XATO'}  ${n}${i ? '  — ' + i : ''}`); if (!c) failed++ }

ok(loginToEmail('Quvonchbek') === `quvonchbek@${LOGIN_DOMAIN}`, 'login ichki emailga o\'tadi (kichik harf)', loginToEmail('Quvonchbek'))
ok(loginToEmail('  Quvonchbek  ') === `quvonchbek@${LOGIN_DOMAIN}`, 'bo\'sh joylar olib tashlanadi')
ok(loginToEmail('Quvonch bek') === `quvonchbek@${LOGIN_DOMAIN}`, 'ichidagi bo\'sh joy ham olib tashlanadi')
ok(loginToEmail('Ali@Mail.UZ') === 'Ali@Mail.UZ', 'haqiqiy email o\'zgarishsiz qoladi (Supabase o\'zi kichik harfga o\'tkazadi)')
ok(loginToEmail('') === '' && loginToEmail(null) === '' && loginToEmail(undefined) === '', 'bo\'sh kirish — bo\'sh qiymat')
ok(isLoginEmail('quvonchbek@tiniq.local') && isLoginEmail('X@TINIQ.LOCAL') && !isLoginEmail('a@gmail.com') && !isLoginEmail(''), 'isLoginEmail ichki loginlarni ajratadi')
ok(emailToLogin('quvonchbek@tiniq.local') === 'quvonchbek' && emailToLogin('a@gmail.com') === 'a@gmail.com' && emailToLogin(null) === '', 'emailToLogin ekranda chiroyli ko\'rsatadi')
ok(loginToEmail(emailToLogin('quvonchbek@tiniq.local')) === 'quvonchbek@tiniq.local', 'aylanib o\'tish (login -> email -> login) barqaror')

console.log(failed ? `\n${failed} ta tekshiruv muvaffaqiyatsiz` : '\nHamma tekshiruvlar o\'tdi')
process.exit(failed ? 1 : 0)
