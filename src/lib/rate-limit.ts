import { CatalogError } from "./types"
export class RateLimiter {
  private keys = new Map<string, { count: number; until: number }>()
  constructor(private limit = 120, private maxKeys = 5000, private now = Date.now) {}
  take(key: string) {
    const now = this.now()
    let entry = this.keys.get(key)
    if (!entry || entry.until <= now) {
      if (this.keys.size >= this.maxKeys) for (const [k, value] of this.keys) if (value.until <= now) this.keys.delete(k)
      if (!entry && this.keys.size >= this.maxKeys) throw new CatalogError(429, "Catalogue rate-limit capacity reached")
      entry = { count: 0, until: now + 60000 }; this.keys.set(key, entry)
    }
    if (++entry.count > this.limit) throw new CatalogError(429, "Catalogue rate limit exceeded")
  }
}
