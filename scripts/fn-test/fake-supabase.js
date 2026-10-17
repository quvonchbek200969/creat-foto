// Edge Function'ni Supabase'siz sinash uchun xotiradagi soxta mijoz. Faqat test uchun.
export const DB = {
  profiles: [], api_keys: [], settings: [], usage: [], ai_log: [],
  tokens: {}, // token -> { id, email }
  authCalls: [],
}

let n = 0
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`

const DEFAULTS = {
  api_keys: () => ({ id: uuid(), success_count: 0, failure_count: 0, consecutive_failures: 0, is_active: true, created_at: new Date(Date.now() + n).toISOString(), last_used_at: null, last_error: null, label: null, model: null, priority: 100 }),
  ai_log: () => ({ id: ++n, created_at: new Date().toISOString() }),
}

class Q {
  constructor(table) {
    this.t = table; this.op = 'select'; this.f = []; this.ord = []; this.lim = null
    this.head = false; this.cnt = false; this.one = false; this.payload = null
  }
  select(_c, o) { if (this.op === 'select') { this.head = !!o?.head; this.cnt = !!o?.count } return this }
  eq(c, v) { this.f.push((r) => r[c] === v); return this }
  gte(c, v) { this.f.push((r) => r[c] >= v); return this }
  order(c, o) { this.ord.push([c, o?.ascending !== false]); return this }
  limit(k) { this.lim = k; return this }
  maybeSingle() { this.one = true; return this }
  single() { this.one = true; return this }
  insert(row) { this.op = 'insert'; this.payload = row; return this }
  update(p) { this.op = 'update'; this.payload = p; return this }
  upsert(rows) { this.op = 'upsert'; this.payload = rows; return this }
  delete() { this.op = 'delete'; return this }
  then(res, rej) { return Promise.resolve(this.run()).then(res, rej) }
  run() {
    const rows = DB[this.t]
    const match = () => rows.filter((r) => this.f.every((fn) => fn(r)))
    if (this.op === 'insert') {
      const row = { ...(DEFAULTS[this.t] ? DEFAULTS[this.t]() : {}), ...this.payload }
      rows.push(row)
      return { data: this.one ? row : [row], error: null }
    }
    if (this.op === 'update') { const m = match(); m.forEach((r) => Object.assign(r, this.payload)); return { data: m, error: null } }
    if (this.op === 'delete') { for (const r of match()) rows.splice(rows.indexOf(r), 1); return { data: null, error: null } }
    if (this.op === 'upsert') {
      for (const p of this.payload) { const ex = rows.find((r) => r.key === p.key); ex ? Object.assign(ex, p) : rows.push({ ...p }) }
      return { data: null, error: null }
    }
    let m = match()
    for (const [c, asc] of [...this.ord].reverse()) m = [...m].sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1))
    if (this.lim) m = m.slice(0, this.lim)
    if (this.head) return { data: null, count: m.length, error: null }
    if (this.one) return { data: m[0] || null, error: null }
    return { data: m, error: null }
  }
}

export function createClient() {
  return {
    from: (t) => new Q(t),
    rpc: async (name, args) => {
      if (name !== 'bump_usage') return { data: null, error: { message: 'unknown rpc' } }
      const day = new Date().toISOString().slice(0, 10)
      let r = DB.usage.find((u) => u.user_id === args.p_user && u.day === day)
      if (!r) DB.usage.push((r = { user_id: args.p_user, day, count: 0 }))
      r.count++
      return { data: r.count, error: null }
    },
    auth: {
      getUser: async (tok) => (DB.tokens[tok] ? { data: { user: DB.tokens[tok] }, error: null } : { data: { user: null }, error: { message: 'bad token' } }),
      admin: {
        updateUserById: async (id, p) => { DB.authCalls.push(['update', id, p]); return { error: null } },
        deleteUser: async (id) => { DB.authCalls.push(['delete', id]); DB.profiles.splice(DB.profiles.findIndex((p) => p.id === id), 1); return { error: null } },
      },
    },
  }
}
