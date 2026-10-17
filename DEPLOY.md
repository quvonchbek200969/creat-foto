# Tiniq — ishga tushirish (GitHub + Supabase + Netlify)

Jami ~20 daqiqa. Tartib muhim: **avval Supabase, keyin Netlify**.

> Eslatma: bu loyiha «Til sayohati»dan butunlay alohida — alohida repo, alohida Supabase loyihasi, alohida Netlify sayti.

---

## 1) GitHub'ga yuklash

1. github.com → **New repository** → nomi `creat-foto` (ochiq yoki yopiq — kodda maxfiy narsa yo'q, API kalitlar bazada saqlanadi).
2. Repo sahifasida **Add file → Upload files**.
3. `GITHUB_YUKLASH` papkasining **ichidagi** hamma narsani sudrab tashlang (`frontend`, `supabase`, `scripts`, `netlify.toml`, `.gitignore`, `README.md`, `DEPLOY.md`).
   - Papka-papka yuklang va **Commit changes** bosishdan oldin fayllar soni to'liq ekanini tekshiring (brauzer ba'zan fayllarni tashlab ketadi).
   - **Hech qachon** `node_modules`, `dist` va `.env` yuklamang (`GITHUB_YUKLASH`da ular yo'q).

---

## 2) Supabase

1. supabase.com → **New project** (nomi `tiniq`, parolni saqlab qo'ying, region sizga yaqin).
2. **SQL Editor → New query** → `supabase/setup.sql` mazmunini to'liq qo'yib **Run**. Xato bo'lmasligi kerak (qayta ishga tushirish xavfsiz).
3. **Authentication → Providers → Email**:
   - **Confirm email** — o'chiring (ro'yxatdan o'tish darhol ishlashi uchun). Yoqilgan bo'lsa ham ishlaydi, lekin foydalanuvchi pochtadagi xatni bosishi kerak bo'ladi.
4. **Edge Functions → Deploy a new function → Via editor**:
   - Nomi: **`api`** (aynan shunday).
   - `supabase/functions/api/index.ts` mazmunini to'liq qo'ying → **Deploy**.
   - Funksiya sahifasida **Verify JWT** ni **o'chiring** (OFF). Funksiya tokenni o'zi tekshiradi; yoqilgan bo'lsa brauzerdagi so'rovlar 401 oladi.
   - Fayl faqat ASCII belgilardan iborat — Notepad orqali ko'chirsangiz ham buzilmaydi.
5. **Project Settings → API** dan ikkita qiymatni oling: **Project URL** va **anon public** kalit.

---

## 3) Netlify

1. app.netlify.com → **Add new site → Import from Git** → GitHub repo'ni tanlang.
2. Build sozlamalari `netlify.toml`dan avtomatik olinadi (`base = frontend`).
3. **Site configuration → Environment variables** ga 2 ta qiymat qo'shing:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon public kalit
4. **Deploy site**. Tayyor bo'lgach manzilni (`https://....netlify.app`) Supabase'dagi **Authentication → URL Configuration → Site URL** ga yozing.

---

## 4) Birinchi kirish — super admin

1. Saytni oching → **Ro'yxatdan o'tish**. **Birinchi ro'yxatdan o'tgan hisob avtomatik Super admin bo'ladi.**
   Shuning uchun sayt manzilini boshqalarga bermasdan oldin o'zingiz ro'yxatdan o'ting.
2. Tepada **Boshqaruv → API kalitlar**:
   - Xizmatni tanlang (Gemini eng oson: aistudio.google.com/apikey dan kalit oling), kalitni qo'ying → **Qo'shish**.
   - **Sinash** tugmasi kalitni bepul so'rov bilan tekshiradi (rasm yubormaydi, pul sarflamaydi).
   - Bir nechta kalit qo'shsangiz, biri xato bersa keyingisi ishlatiladi; «Navbat» raqami kichik bo'lgani avval.
3. **Boshqaruv → Sozlamalar**: kunlik AI limiti (har bir foydalanuvchiga), AI'ni o'chirib-yoqish, faqat bitta xizmatga majburlash.
4. Studiya → rasm tanlang → **✨ AI** bo'limida sinab ko'ring.

Rollar: **Super admin** — hamma narsa. **Admin** — statistikani va oddiy foydalanuvchilarni ko'radi, bloklaydi. **Foydalanuvchi** — faqat o'z hisobi, AI kunlik limit bilan. Kalitlar brauzerga hech qachon chiqmaydi.

---

## 5) Telefon: ilova sifatida o'rnatish (PWA) — tayyor

Sayt telefonga moslashgan va hech qanday qo'shimcha ishsiz o'rnatiladi:

- **Android (Chrome):** tepadagi **📲 Ilova** tugmasi → «Hoziroq o'rnatish». Chrome uni haqiqiy ilova (WebAPK) sifatida o'rnatadi.
- **iPhone (Safari):** Ulashish → «Bosh ekranga qo'shish» (tugma shu ko'rsatmani o'zi chiqaradi).
- Telegram/Instagram ichidagi brauzerda o'rnatib bo'lmaydi — tugma «Brauzerda oching» deb aytadi.

---

## 6) APK fayl (Android) — saytdan yuklab olinadigan

APK **deploydan keyin** yaratiladi, chunki u saytning haqiqiy HTTPS manziliga va sizning imzo kalitingizga bog'lanadi. Bu kompyuterda Java/Android SDK yo'q, shuning uchun APK'ni PWABuilder (bepul, Microsoft) yig'adi — kod yozish shart emas:

1. **pwabuilder.com** → saytingiz manzilini kiriting → **Start**. Hisobotda «Manifest» va «Service worker» yashil bo'lishi kerak.
2. **Package for stores → Android → Generate package**:
   - *Package ID*: masalan `uz.tiniq.app` (keyin o'zgartirib bo'lmaydi).
   - *Signing key*: **New** (yangisini yaratsin).
3. Yuklab olingan zip ichida:
   - `*.apk` — o'rnatiladigan fayl;
   - `signing.keystore` va `signing-key-info.txt` — **imzo kaliti. Xavfsiz joyda saqlang, GitHub'ga yuklamang.** Yo'qolsa, ilovani yangilab bo'lmaydi;
   - `assetlinks.json`.
4. Repo'ga qo'shing:
   - APK'ni `tiniq.apk` deb nomlab → `frontend/public/tiniq.apk`
   - `assetlinks.json`ni → `frontend/public/.well-known/assetlinks.json`
     (GitHub'da nuqta bilan boshlanadigan papkani sudrash ba'zan ishlamaydi: **Add file → Create new file**, nom maydoniga `frontend/public/.well-known/assetlinks.json` deb yozing va mazmunini qo'ying.)
5. Netlify o'zi qayta joylaydi. Shundan keyin Android telefonda **📲 Ilova → «📥 APK faylni yuklab olish»** tugmasi **o'zi paydo bo'ladi** (fayl yo'q paytda ko'rinmaydi).
6. O'rnatishda telefon «noma'lum manbadan o'rnatish»ga ruxsat so'raydi — bu oddiy holat. `assetlinks.json` bo'lmasa ilova tepasida brauzer manzil satri ko'rinib qoladi; bo'lsa — to'liq ekranda ochiladi.

> iPhone uchun APK yo'q (iOS faqat App Store); iPhone'da 5-bo'limdagi usul ishlaydi.

---

## Tekshiruv buyruqlari

```
cd frontend
npm install
npm test           # piksel algoritmlari + service worker mantig'i
npm run build
```

Edge Function'ni soxta Supabase bilan sinash (Deno kerak): `deno run -A --import-map scripts/fn-test/import_map.json scripts/fn-test/run.js`

## Muammolar

| Belgi | Sabab |
|---|---|
| AI tugmasida «Serverga ulanib bo'lmadi» | Funksiya joylanmagan yoki nomi `api` emas, yoki **Verify JWT** yoqilgan |
| «AI kaliti sozlanmagan» | Boshqaruv → API kalitlar'da faol kalit yo'q |
| «Kalit yaroqsiz» | Kalit noto'g'ri yoki o'chirilgan; **Sinash** bilan tekshiring |
| Ro'yxatdan o'tgach «Emailni tasdiqlang» | Supabase'da **Confirm email** yoqilgan |
| Netlify build xatosi | Avval GitHub'dagi fayllar to'liqligini tekshiring (yuklash chala bo'lgan bo'lishi mumkin) |
| Sayt «Oddiy rejim» belgisi bilan | `VITE_SUPABASE_*` o'zgaruvchilari kiritilmagan; kiritgach saytni qayta joylang |
