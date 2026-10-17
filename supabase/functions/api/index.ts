// Tiniq - Edge Function "api" (Deno). FAQAT ASCII: Notepad orqali ko'chirilganda belgilar buzilmasin.
// Vazifasi: AI rasm ishlovi (API kalitlar serverda), foydalanuvchi/kalit/sozlama boshqaruvi.
// Joylash: supabase functions deploy api --no-verify-jwt   (token funksiya ichida tekshiriladi)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

class ProviderError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/* ---------- Konstantalar ---------- */

const PROVIDERS = ["gemini", "openai", "replicate", "stability"];
const MODES = ["enhance", "upscale", "restore", "denoise"];
const LABELS: Record<string, string> = {
  gemini: "Google Gemini",
  openai: "OpenAI",
  replicate: "Replicate (Real-ESRGAN)",
  stability: "Stability AI",
};
const DEFAULT_MODEL: Record<string, string> = {
  gemini: "gemini-2.5-flash-image",
  openai: "gpt-image-1",
  replicate: "nightmareai/real-esrgan",
  stability: "fast",
};
// Provayder qabul qiladigan eng katta tomon (piksel). Klient rasmni shunga kichraytirib yuboradi.
const MAX_SIDE: Record<string, number> = { gemini: 2048, openai: 2048, replicate: 1200, stability: 1000 };

const RULES =
  "Keep the exact same composition, subject, faces, identity, text, colors and proportions. " +
  "Do not add, remove or redraw objects. Output only the final image.";
const PROMPTS: Record<string, string> = {
  enhance:
    "Professionally enhance this photograph: make it noticeably sharper and clearer, recover fine detail and texture, " +
    "remove noise and compression artifacts, and correct exposure, contrast and color balance naturally. " + RULES,
  upscale:
    "Upscale this image to a higher resolution with crisp, realistic detail. Reconstruct fine textures, sharpen edges " +
    "and remove blur, noise and JPEG artifacts. " + RULES,
  restore:
    "Restore this old or damaged photograph: remove scratches, dust, stains and fading, repair damaged areas, reduce " +
    "noise and recover natural contrast and detail. If it is black and white keep it black and white. " + RULES,
  denoise:
    "Remove all noise and grain from this photo while preserving every fine detail and texture. " + RULES,
};

/* ---------- Yordamchilar ---------- */

type Img = { bytes: Uint8Array; mime: string };

function b64(bytes: Uint8Array): string {
  let s = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + step)));
  }
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toBlob(img: Img): Blob {
  const b = img.bytes;
  return new Blob([b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer], { type: img.mime });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const extOf = (mime: string) => (mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg");
const today = () => new Date().toISOString().slice(0, 10);

function clean(msg: string, secret = ""): string {
  let m = String(msg || "");
  if (secret && secret.length > 6) m = m.split(secret).join("***");
  return m.replace(/\s+/g, " ").slice(0, 300);
}

function errText(j: any): string {
  if (!j) return "";
  if (typeof j.error === "string") return j.error;
  if (j.error && typeof j.error.message === "string") return j.error.message;
  if (Array.isArray(j.errors) && j.errors.length) return String(j.errors[0]);
  if (typeof j.detail === "string") return j.detail;
  if (typeof j.message === "string") return j.message;
  return "";
}

const timeout = () => AbortSignal.timeout(100000);

/* ---------- Provayderlar ---------- */

async function runGemini(key: string, model: string, input: Img, prompt: string): Promise<Img> {
  const r = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: input.mime, data: b64(input.bytes) } }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
      signal: timeout(),
    },
  );
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new ProviderError(r.status, errText(j) || "HTTP " + r.status);
  const parts = j?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    const d = p.inlineData || p.inline_data;
    if (d && d.data) return { bytes: fromB64(d.data), mime: d.mimeType || d.mime_type || "image/png" };
  }
  const why = j?.candidates?.[0]?.finishReason || j?.promptFeedback?.blockReason || "";
  throw new ProviderError(422, "Gemini rasm qaytarmadi" + (why ? " (" + why + ")" : ""));
}

async function runOpenAI(key: string, model: string, input: Img, prompt: string): Promise<Img> {
  const fd = new FormData();
  fd.append("model", model);
  fd.append("prompt", prompt);
  fd.append("image", toBlob(input), "image." + extOf(input.mime));
  fd.append("size", "auto");
  if (model === "gpt-image-1") fd.append("input_fidelity", "high");
  const r = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: "Bearer " + key },
    body: fd,
    signal: timeout(),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new ProviderError(r.status, errText(j) || "HTTP " + r.status);
  const d = j?.data?.[0];
  if (d?.b64_json) return { bytes: fromB64(d.b64_json), mime: "image/png" };
  if (d?.url && String(d.url).startsWith("https://")) {
    const ir = await fetch(d.url, { signal: timeout() });
    return { bytes: new Uint8Array(await ir.arrayBuffer()), mime: ir.headers.get("content-type") || "image/png" };
  }
  throw new ProviderError(422, "OpenAI rasm qaytarmadi");
}

async function runReplicate(key: string, model: string, input: Img, mode: string): Promise<Img> {
  const auth = { Authorization: "Bearer " + key };
  let slug = model;
  let version = "";
  const colon = model.indexOf(":");
  if (colon > 0) {
    slug = model.slice(0, colon);
    version = model.slice(colon + 1);
  } else {
    const mr = await fetch("https://api.replicate.com/v1/models/" + slug, { headers: auth, signal: timeout() });
    const mj = await mr.json().catch(() => null);
    if (!mr.ok) throw new ProviderError(mr.status, errText(mj) || "Replicate modeli topilmadi: " + slug);
    version = mj?.latest_version?.id || "";
    if (!version) throw new ProviderError(502, "Replicate: model versiyasi topilmadi");
  }
  const inp: Record<string, unknown> = { image: "data:" + input.mime + ";base64," + b64(input.bytes) };
  if (slug.toLowerCase().indexOf("real-esrgan") >= 0) {
    inp.scale = mode === "upscale" ? 4 : 2;
    inp.face_enhance = mode === "enhance" || mode === "restore";
  }
  const r = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json", Prefer: "wait=60" },
    body: JSON.stringify({ version, input: inp }),
    signal: timeout(),
  });
  let j = await r.json().catch(() => null);
  if (!r.ok) throw new ProviderError(r.status, errText(j) || "HTTP " + r.status);
  const deadline = Date.now() + 90000;
  while (j && j.status !== "succeeded") {
    if (j.status === "failed" || j.status === "canceled") throw new ProviderError(502, "Replicate: " + (j.error || j.status));
    if (Date.now() > deadline) throw new ProviderError(504, "Replicate: vaqt tugadi");
    const getUrl = j.urls && j.urls.get;
    if (!getUrl || !String(getUrl).startsWith("https://api.replicate.com/")) throw new ProviderError(502, "Replicate: noto'g'ri javob");
    await sleep(2000);
    const pr = await fetch(getUrl, { headers: auth, signal: timeout() });
    j = await pr.json().catch(() => null);
  }
  const out = Array.isArray(j?.output) ? j.output[0] : j?.output;
  if (typeof out !== "string" || !out.startsWith("https://")) throw new ProviderError(422, "Replicate rasm qaytarmadi");
  const ir = await fetch(out, { signal: timeout() });
  if (!ir.ok) throw new ProviderError(502, "Replicate natijasini yuklab bo'lmadi");
  return { bytes: new Uint8Array(await ir.arrayBuffer()), mime: ir.headers.get("content-type") || "image/png" };
}

async function runStability(key: string, input: Img): Promise<Img> {
  const fd = new FormData();
  fd.append("image", toBlob(input), "image." + extOf(input.mime));
  fd.append("output_format", "png");
  const r = await fetch("https://api.stability.ai/v2beta/stable-image/upscale/fast", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, Accept: "image/*" },
    body: fd,
    signal: timeout(),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => null);
    throw new ProviderError(r.status, errText(j) || "HTTP " + r.status);
  }
  return { bytes: new Uint8Array(await r.arrayBuffer()), mime: r.headers.get("content-type") || "image/png" };
}

async function runProvider(k: any, input: Img, mode: string): Promise<Img> {
  const model = (k.model || "").trim() || DEFAULT_MODEL[k.provider];
  const prompt = PROMPTS[mode] || PROMPTS.enhance;
  switch (k.provider) {
    case "gemini": return await runGemini(k.key_value, model, input, prompt);
    case "openai": return await runOpenAI(k.key_value, model, input, prompt);
    case "replicate": return await runReplicate(k.key_value, model, input, mode);
    case "stability": return await runStability(k.key_value, input);
  }
  throw new ProviderError(400, "Noma'lum provayder");
}

// Kalitni bepul so'rov bilan tekshirish (rasm yuborilmaydi, pul sarflanmaydi)
async function pingProvider(k: any): Promise<void> {
  let r: Response;
  const sig = AbortSignal.timeout(20000);
  if (k.provider === "gemini") {
    r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", { headers: { "x-goog-api-key": k.key_value }, signal: sig });
  } else if (k.provider === "openai") {
    r = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: "Bearer " + k.key_value }, signal: sig });
  } else if (k.provider === "replicate") {
    r = await fetch("https://api.replicate.com/v1/account", { headers: { Authorization: "Bearer " + k.key_value }, signal: sig });
  } else {
    r = await fetch("https://api.stability.ai/v1/user/account", { headers: { Authorization: "Bearer " + k.key_value }, signal: sig });
  }
  if (!r.ok) {
    const j = await r.json().catch(() => null);
    throw new ProviderError(r.status, errText(j) || "HTTP " + r.status);
  }
}

// Kalit yaroqsizligi: 401/403, yoki Gemini kabi 400 + "API key not valid" matni
function isAuthError(e: ProviderError): boolean {
  return e.status === 401 || e.status === 403 ||
    /api key not valid|api_key_invalid|invalid api key|incorrect api key|invalid_api_key/i.test(e.message);
}

function userMessage(e: ProviderError): string {
  if (isAuthError(e)) return "AI kaliti yaroqsiz yoki ruxsati yo'q. Administratorga xabar bering.";
  if (e.status === 429) return "AI xizmatining limiti vaqtincha tugagan. Birozdan keyin urinib ko'ring.";
  if (e.status === 413) return "Rasm AI uchun juda katta.";
  if (e.status === 504 || e.name === "TimeoutError") return "AI xizmati kech javob berdi. Qayta urinib ko'ring.";
  return "AI rasmni ishlay olmadi: " + e.message;
}

/* ---------- Autentifikatsiya va sozlamalar ---------- */

type User = { id: string; email: string; role: string };

async function authUser(req: Request): Promise<User> {
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!tok) throw new HttpError(401, "Avval tizimga kiring.");
  const { data, error } = await db.auth.getUser(tok);
  if (error || !data.user) throw new HttpError(401, "Sessiya eskirgan. Qaytadan kiring.");
  const { data: p } = await db.from("profiles").select("role,is_blocked").eq("id", data.user.id).maybeSingle();
  if (!p) throw new HttpError(403, "Profil topilmadi.");
  if (p.is_blocked) throw new HttpError(403, "Hisobingiz bloklangan.");
  return { id: data.user.id, email: data.user.email ?? "", role: p.role };
}

const isStaff = (u: User) => u.role === "admin" || u.role === "superadmin";

function need(u: User, level: "staff" | "superadmin"): void {
  if (level === "superadmin" && u.role !== "superadmin") throw new HttpError(403, "Bu amal faqat super admin uchun.");
  if (level === "staff" && !isStaff(u)) throw new HttpError(403, "Bu amal faqat adminlar uchun.");
}

async function getSettings(): Promise<Record<string, string>> {
  const s: Record<string, string> = { ai_enabled: "on", ai_daily_limit: "10", ai_provider: "auto" };
  const { data } = await db.from("settings").select("key,value");
  for (const r of data || []) s[r.key] = r.value;
  return s;
}

async function activeKeys(pref: string): Promise<any[]> {
  let q = db.from("api_keys").select("*").eq("is_active", true).order("priority", { ascending: true }).order("created_at", { ascending: true });
  if (pref !== "auto") q = q.eq("provider", pref);
  const { data } = await q;
  return data || [];
}

async function usedToday(uid: string): Promise<number> {
  const { data } = await db.from("usage").select("count").eq("user_id", uid).eq("day", today()).maybeSingle();
  return data ? data.count : 0;
}

function mask(k: string): string {
  return k.length > 12 ? k.slice(0, 4) + "..." + k.slice(-4) : "****";
}

/* ---------- Amallar ---------- */

async function actStatus(u: User) {
  const s = await getSettings();
  const keys = await activeKeys(s.ai_provider);
  const seen: Record<string, boolean> = {};
  const providers: any[] = [];
  for (const k of keys) {
    if (seen[k.provider]) continue;
    seen[k.provider] = true;
    providers.push({ id: k.provider, label: LABELS[k.provider], maxSide: MAX_SIDE[k.provider] });
  }
  const limit = parseInt(s.ai_daily_limit, 10) || 0;
  const unlimited = isStaff(u) || limit === 0;
  await db.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", u.id);
  return json({ enabled: s.ai_enabled === "on", providers, limit, unlimited, used: await usedToday(u.id), role: u.role });
}

async function actEnhance(u: User, body: any) {
  const s = await getSettings();
  if (s.ai_enabled !== "on") throw new HttpError(503, "AI xizmati hozircha o'chirilgan.");
  const mode = MODES.indexOf(body.mode) >= 0 ? body.mode : "enhance";
  const mime = ["image/jpeg", "image/png", "image/webp"].indexOf(body.mime) >= 0 ? body.mime : "";
  if (!mime) throw new HttpError(400, "Rasm formati qo'llab-quvvatlanmaydi.");
  const image = typeof body.image === "string" ? body.image : "";
  if (!image) throw new HttpError(400, "Rasm yuborilmadi.");
  if (image.length > 9000000) throw new HttpError(413, "Rasm juda katta.");
  let pref = typeof body.provider === "string" ? body.provider : "auto";
  if (pref !== "auto" && PROVIDERS.indexOf(pref) < 0) throw new HttpError(400, "Noma'lum AI xizmati.");
  if (s.ai_provider !== "auto") pref = s.ai_provider;

  const limit = parseInt(s.ai_daily_limit, 10) || 0;
  const unlimited = isStaff(u) || limit === 0;
  if (!unlimited && (await usedToday(u.id)) >= limit) {
    throw new HttpError(429, "Bugungi AI limitingiz tugadi (" + limit + " ta). Ertaga qayta urinib ko'ring.");
  }

  const keys = (await activeKeys(pref)).slice(0, 4);
  if (!keys.length) throw new HttpError(503, "AI kaliti sozlanmagan. Administratorga murojaat qiling.");

  let bytes: Uint8Array;
  try {
    bytes = fromB64(image);
  } catch (_e) {
    throw new HttpError(400, "Rasm ma'lumoti buzilgan.");
  }
  const input: Img = { bytes, mime };

  let last: ProviderError | null = null;
  for (const k of keys) {
    const t0 = Date.now();
    try {
      const out = await runProvider(k, input, mode);
      const used = (await db.rpc("bump_usage", { p_user: u.id })).data as number;
      await db.from("api_keys").update({
        success_count: k.success_count + 1, consecutive_failures: 0, last_used_at: new Date().toISOString(),
      }).eq("id", k.id);
      await db.from("ai_log").insert({ user_id: u.id, provider: k.provider, mode, ok: true, ms: Date.now() - t0 });
      return json({ image: b64(out.bytes), mime: out.mime, provider: k.provider, used: used ?? 0, limit: unlimited ? 0 : limit });
    } catch (e) {
      const pe = e instanceof ProviderError ? e : new ProviderError(e instanceof Error && e.name === "TimeoutError" ? 504 : 502, e instanceof Error ? e.message : "xato");
      pe.message = clean(pe.message, k.key_value);
      last = pe;
      const fails = k.consecutive_failures + 1;
      const dead = isAuthError(pe) && fails >= 3;
      await db.from("api_keys").update({
        failure_count: k.failure_count + 1, consecutive_failures: fails, last_error: pe.status + ": " + pe.message,
        ...(dead ? { is_active: false } : {}),
      }).eq("id", k.id);
      await db.from("ai_log").insert({ user_id: u.id, provider: k.provider, mode, ok: false, ms: Date.now() - t0, error: pe.message });
    }
  }
  throw new HttpError(502, userMessage(last as ProviderError));
}

async function actStats(u: User) {
  need(u, "staff");
  const day0 = today() + "T00:00:00Z";
  const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const head = { count: "exact" as const, head: true };
  const [users, fresh, reqToday, req7, fail7, keys] = await Promise.all([
    db.from("profiles").select("id", head),
    db.from("profiles").select("id", head).gte("created_at", since7),
    db.from("ai_log").select("id", head).eq("ok", true).gte("created_at", day0),
    db.from("ai_log").select("id", head).eq("ok", true).gte("created_at", since7),
    db.from("ai_log").select("id", head).eq("ok", false).gte("created_at", since7),
    db.from("api_keys").select("id", head).eq("is_active", true),
  ]);
  return json({
    users: users.count ?? 0, newThisWeek: fresh.count ?? 0, requestsToday: reqToday.count ?? 0,
    requests7d: req7.count ?? 0, failures7d: fail7.count ?? 0, activeKeys: keys.count ?? 0,
  });
}

async function actUserList(u: User) {
  need(u, "staff");
  let q = db.from("profiles").select("id,email,display_name,role,is_blocked,created_at,last_seen_at").order("created_at", { ascending: false }).limit(1000);
  if (u.role !== "superadmin") q = q.eq("role", "user");
  const { data } = await q;
  const { data: use } = await db.from("usage").select("user_id,count").eq("day", today());
  const map: Record<string, number> = {};
  for (const r of use || []) map[r.user_id] = r.count;
  return json({ users: (data || []).map((p: any) => ({ ...p, today: map[p.id] || 0 })) });
}

async function targetProfile(u: User, id: unknown) {
  if (typeof id !== "string" || id.length < 10) throw new HttpError(400, "Foydalanuvchi ko'rsatilmagan.");
  const { data: t } = await db.from("profiles").select("id,role").eq("id", id).maybeSingle();
  if (!t) throw new HttpError(404, "Foydalanuvchi topilmadi.");
  if (t.id === u.id) throw new HttpError(400, "O'zingizga bu amalni qo'llab bo'lmaydi.");
  if (t.role === "superadmin") throw new HttpError(403, "Super adminga bu amalni qo'llab bo'lmaydi.");
  if (u.role !== "superadmin" && t.role !== "user") throw new HttpError(403, "Admin faqat oddiy foydalanuvchilarni boshqaradi.");
  return t;
}

async function actUserBlock(u: User, body: any) {
  need(u, "staff");
  const t = await targetProfile(u, body.id);
  const blocked = body.blocked === true;
  await db.from("profiles").update({ is_blocked: blocked }).eq("id", t.id);
  try {
    await db.auth.admin.updateUserById(t.id, { ban_duration: blocked ? "876000h" : "none" });
  } catch (_e) { /* profil bloklandi; auth ban ixtiyoriy qo'shimcha himoya */ }
  return json({ ok: true });
}

async function actSetRole(u: User, body: any) {
  need(u, "superadmin");
  const t = await targetProfile(u, body.id);
  if (body.role !== "user" && body.role !== "admin") throw new HttpError(400, "Rol noto'g'ri.");
  await db.from("profiles").update({ role: body.role }).eq("id", t.id);
  return json({ ok: true });
}

async function actUserDelete(u: User, body: any) {
  need(u, "superadmin");
  const t = await targetProfile(u, body.id);
  const { error } = await db.auth.admin.deleteUser(t.id);
  if (error) throw new HttpError(500, "O'chirib bo'lmadi: " + error.message);
  return json({ ok: true });
}

async function actKeyList(u: User) {
  need(u, "superadmin");
  const { data } = await db.from("api_keys").select("*").order("priority", { ascending: true }).order("created_at", { ascending: true });
  return json({
    keys: (data || []).map((k: any) => {
      const { key_value, ...rest } = k;
      return { ...rest, masked: mask(key_value) };
    }),
  });
}

function keyFields(body: any, partial: boolean) {
  const out: Record<string, unknown> = {};
  if (!partial || body.provider !== undefined) {
    if (PROVIDERS.indexOf(body.provider) < 0) throw new HttpError(400, "Xizmat noto'g'ri.");
    out.provider = body.provider;
  }
  if (body.label !== undefined) out.label = String(body.label).trim().slice(0, 60) || null;
  if (body.model !== undefined) {
    const m = String(body.model).trim();
    if (m && !/^[A-Za-z0-9._\-\/:]{1,120}$/.test(m)) throw new HttpError(400, "Model nomi noto'g'ri belgilardan iborat.");
    out.model = m || null;
  }
  if (body.priority !== undefined) {
    const p = parseInt(body.priority, 10);
    if (!(p >= 1 && p <= 1000)) throw new HttpError(400, "Navbat 1 dan 1000 gacha bo'lsin.");
    out.priority = p;
  }
  if (typeof body.key === "string" && body.key.trim()) {
    const k = body.key.trim();
    if (k.length < 8 || k.length > 500 || /\s/.test(k)) throw new HttpError(400, "Kalit noto'g'ri ko'rinadi (bo'sh joy bo'lmasin, kamida 8 belgi).");
    out.key_value = k;
  } else if (!partial) {
    throw new HttpError(400, "Kalitni kiriting.");
  }
  return out;
}

async function actKeyAdd(u: User, body: any) {
  need(u, "superadmin");
  const f = keyFields(body, false);
  const { data, error } = await db.from("api_keys").insert(f).select("id").single();
  if (error) throw new HttpError(500, "Saqlab bo'lmadi: " + error.message);
  return json({ ok: true, id: data.id });
}

async function actKeyUpdate(u: User, body: any) {
  need(u, "superadmin");
  const f = keyFields(body, true);
  delete f.provider; // xizmatni o'zgartirib bo'lmaydi
  if (f.key_value) { f.consecutive_failures = 0; f.last_error = null; }
  if (!Object.keys(f).length) throw new HttpError(400, "O'zgartirish yo'q.");
  const { error } = await db.from("api_keys").update(f).eq("id", body.id);
  if (error) throw new HttpError(500, "Saqlab bo'lmadi: " + error.message);
  return json({ ok: true });
}

async function actKeyToggle(u: User, body: any) {
  need(u, "superadmin");
  const patch: Record<string, unknown> = { is_active: body.active === true };
  if (body.active === true) patch.consecutive_failures = 0;
  await db.from("api_keys").update(patch).eq("id", body.id);
  return json({ ok: true });
}

async function actKeyDelete(u: User, body: any) {
  need(u, "superadmin");
  await db.from("api_keys").delete().eq("id", body.id);
  return json({ ok: true });
}

async function actKeyTest(u: User, body: any) {
  need(u, "superadmin");
  const { data: k } = await db.from("api_keys").select("*").eq("id", body.id).maybeSingle();
  if (!k) throw new HttpError(404, "Kalit topilmadi.");
  const t0 = Date.now();
  try {
    await pingProvider(k);
  } catch (e) {
    const pe = e instanceof ProviderError ? e : new ProviderError(502, e instanceof Error ? e.message : "xato");
    const msg = clean(pe.message, k.key_value);
    await db.from("api_keys").update({ last_error: pe.status + ": " + msg }).eq("id", k.id);
    throw new HttpError(400, isAuthError(pe) ? "Kalit yaroqsiz (" + pe.status + ")" : "Xato: " + msg);
  }
  await db.from("api_keys").update({ last_error: null, consecutive_failures: 0 }).eq("id", k.id);
  return json({ ok: true, ms: Date.now() - t0 });
}

async function actSettingsGet(u: User) {
  need(u, "superadmin");
  return json({ settings: await getSettings() });
}

async function actSettingsSave(u: User, body: any) {
  need(u, "superadmin");
  const enabled = body.ai_enabled === "off" ? "off" : "on";
  const limit = parseInt(body.ai_daily_limit, 10);
  if (!(limit >= 0 && limit <= 10000)) throw new HttpError(400, "Limit 0 dan 10000 gacha bo'lsin.");
  const prov = String(body.ai_provider || "auto");
  if (prov !== "auto" && PROVIDERS.indexOf(prov) < 0) throw new HttpError(400, "AI xizmat rejimi noto'g'ri.");
  const { error } = await db.from("settings").upsert([
    { key: "ai_enabled", value: enabled },
    { key: "ai_daily_limit", value: String(limit) },
    { key: "ai_provider", value: prov },
  ]);
  if (error) throw new HttpError(500, "Saqlab bo'lmadi: " + error.message);
  return json({ ok: true });
}

/* ---------- Kirish nuqtasi ---------- */

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Faqat POST so'rov qabul qilinadi." }, 405);
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.action !== "string") throw new HttpError(400, "So'rov noto'g'ri.");
    const u = await authUser(req);
    switch (body.action) {
      case "status": return await actStatus(u);
      case "enhance": return await actEnhance(u, body);
      case "stats": return await actStats(u);
      case "user-list": return await actUserList(u);
      case "user-block": return await actUserBlock(u, body);
      case "user-delete": return await actUserDelete(u, body);
      case "set-role": return await actSetRole(u, body);
      case "key-list": return await actKeyList(u);
      case "key-add": return await actKeyAdd(u, body);
      case "key-update": return await actKeyUpdate(u, body);
      case "key-toggle": return await actKeyToggle(u, body);
      case "key-delete": return await actKeyDelete(u, body);
      case "key-test": return await actKeyTest(u, body);
      case "settings-get": return await actSettingsGet(u);
      case "settings-save": return await actSettingsSave(u, body);
    }
    throw new HttpError(400, "Noma'lum amal.");
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Server xatosi. Keyinroq urinib ko'ring." }, 500);
  }
});
