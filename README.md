# Tiniq — rasmni tiniqlashtirish

Xira, shovqinli yoki kichik rasmlarni tiniqlashtiradigan, kattalashtiradigan va rangini tuzatadigan sayt. Ikki usulda ishlaydi:

1. **Brauzerda (bepul, kalitsiz)** — rasm qurilmadan chiqmaydi. Aniqlik, shovqin tozalash, tiniqlik, kattalashtirish (2–4×), avto-tuzatish, rang sozlamalari. Natija jonli ko'rinadi (asl/natija slayderi).
2. **AI bilan** — Google Gemini, OpenAI, Replicate (Real-ESRGAN) yoki Stability AI orqali. API kalitlar **serverda** saqlanadi va admin panelda boshqariladi; foydalanuvchi kalitni ko'rmaydi.

Telefonga moslashgan, ilova sifatida o'rnatiladi (PWA) va ixtiyoriy APK sifatida saytdan yuklab olinadi.

**Ishga tushirish:** [DEPLOY.md](DEPLOY.md)

## Imkoniyatlar

| Bo'lim | Nima qiladi |
|---|---|
| Tezkor | 6 ta tayyor sozlama: Avto yaxshilash, Tiniqlashtirish, 2× kattalashtirish, Eski rasm, Portret, Qorong'i rasm |
| Sozlash | Aniqlik va radius, tiniqlik (lokal kontrast), shovqinni kamaytirish, avto-tuzatish, yorqinlik, kontrast, to'yinganlik, jonlilik, iliqlik, 1–4× kattalashtirish |
| AI | Yaxshilash · Kattalashtirish · Tiklash (eski rasm) · Shovqinsiz. Natija ustiga lokal sozlamalarni ham qo'shish mumkin |
| Saqlash | PNG / JPG / WebP, sifat sozlanadi; fayl to'liq o'lchamda ishlanadi (ko'rinish tezlik uchun kichraytirilgan) |
| Boshqaruv | Statistika · foydalanuvchilar (bloklash, rol) · **API kalitlar** (qo'shish, sinash, navbat, yoqish/o'chirish, xato hisobi) · sozlamalar (kunlik limit, AI yoqish/o'chirish) |
| Telefon | Yopishqoq rasm ko'rinishi, pastdagi «Yuklab olish» paneli, 📲 o'rnatish, oflayn qobiq, ixtiyoriy APK |

### Algoritmlar (brauzerda, kutubxonasiz)

- **Shovqin:** bilateral filtr; sezgirligi rasmdagi haqiqiy shovqinga moslanadi (Immerkaer bahosi, medianali) — slayder «shovqinning qancha qismini olib tashlash»ni bildiradi.
- **Aniqlik:** yorug'lik kanalida unsharp mask (rang halolarisiz, halo cheklangan). **Tiniqlik:** o'rta tonlarda katta radiusli lokal kontrast.
- **Kattalashtirish:** Lanczos-3. Xotira himoyasi: chiqish 36 MP gacha (telefonda 16 MP).
- **Avto-tuzatish:** persentilli darajalar + gamma.

## Tuzilma

```
creat-foto/
├── frontend/                 React 19 + Vite 8 + Tailwind 4
│   ├── public/               manifest, sw.js (oflayn), icons/, (ixtiyoriy) tiniq.apk
│   └── src/
│       ├── lib/              pixels.js (algoritmlar), enhance.worker.js, engine.js, ai.js, install.js
│       ├── pages/            Studio, Admin, AuthPages
│       └── components/       CompareSlider, Slider, AiPanel, InstallApp, Layout
├── supabase/
│   ├── setup.sql             baza (bitta fayl)
│   └── functions/api/        Edge Function: AI + boshqaruv (ASCII)
├── scripts/                  test-pixels.mjs, test-sw.mjs, make-icons.mjs, fn-test/ (Deno sinovlari)
├── DEPLOY.md · netlify.toml
```

## Lokal ishga tushirish

```
cd frontend
npm install
cp .env.example .env      # Supabase URL va kalit; bo'sh qoldirsangiz "oddiy rejim"
npm run dev               # http://localhost:5174
```

**Oddiy rejim** (`.env` bo'sh): kirish va admin panel yo'q; lokal ishlov to'liq ishlaydi, AI uchun foydalanuvchi o'zining Gemini kalitini brauzerga kiritadi (faqat shu qurilmada saqlanadi, faqat Google'ga yuboriladi).

## Xavfsizlik

- API kalitlar `api_keys` jadvalida: RLS yoqilgan, siyosat yo'q — klient hech qachon o'qiy olmaydi; faqat Edge Function (service-role). Panelda faqat maska ko'rinadi; xato matnlaridan kalit yashiriladi.
- Rol, bloklanish va email'ni foydalanuvchi o'zgartira olmaydi (trigger). Birinchi ro'yxatdan o'tgan — super admin.
- Admin faqat oddiy foydalanuvchilarni boshqaradi; super admin boshqa adminlar/super adminga tegib bo'lmaydi.
- AI uchun kunlik limit (sozlanadi); yaroqsiz kalit 3 marta ketma-ket 401/403 bersa avtomatik o'chadi.
- AI ishlatilganda rasm tanlangan xizmatga (Google/OpenAI/…) yuboriladi — maxfiy rasmlar uchun faqat lokal ishlovdan foydalaning.

## Sinovlar

| Buyruq | Nimani tekshiradi |
|---|---|
| `npm test` (frontend/) | Algoritmlar (aniqlik nazariya bilan mosligi, denoise, resize, xotira chegarasi) va service worker mantig'i |
| `deno run -A --import-map scripts/fn-test/import_map.json scripts/fn-test/run.js` | Edge Function: ruxsatlar, limit, kalit almashinuvi, sizib chiqmaslik (soxta Supabase va AI bilan) |
