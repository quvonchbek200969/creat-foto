// Sayt "qotib" qolsa yoki eski keshdan buzilsa: service worker va keshlarni tozalab, sahifani qayta yuklaydi.
// Kirish (login) ma'lumoti o'chmaydi — u localStorage'da qoladi.
export async function resetApp() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || []
    await Promise.all(regs.map((r) => r.unregister()))
  } catch { /* eski brauzer */ }
  try {
    const keys = (await globalThis.caches?.keys?.()) || []
    await Promise.all(keys.map((k) => caches.delete(k)))
  } catch { /* kesh yo'q */ }
  location.reload()
}
