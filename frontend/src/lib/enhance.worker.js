// Og'ir piksel ishlovi interfeysni qotirmasligi uchun alohida oqimda bajariladi.
import { processImage } from './pixels.js'

self.onmessage = (e) => {
  const { id, buffer, width, height, params, k } = e.data
  try {
    const out = processImage({ data: new Uint8ClampedArray(buffer), width, height }, params, k)
    self.postMessage(
      { id, ok: true, buffer: out.data.buffer, width: out.width, height: out.height },
      [out.data.buffer],
    )
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message ? err.message : err) })
  }
}
