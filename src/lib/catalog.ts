import { createHash } from "node:crypto"
import { CatalogError, SEARCH, LOOKUP, type CatalogAdapter, type Json, type Operation, type Options } from "./types"
import { negotiate, ProfileResolver } from "./profiles"
import { validate } from "./validation"

function plain(value: unknown, max = 10000) {
  return typeof value === "string" ? value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : ""
}
function url(value: unknown, base: string) {
  if (typeof value !== "string") return undefined
  try { const u = new URL(value, base); return u.protocol === "https:" && !u.username && !u.password ? u.href : undefined } catch { return undefined }
}
export function minorUnits(value: unknown, currency: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits!
  const amount = Math.round((value + Number.EPSILON) * 10 ** digits)
  return Number.isSafeInteger(amount) ? amount : undefined
}
function normalize(value: string) { return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase() }
function range(product: Json) {
  const values = product.variants.map((v: Json) => v.price.amount)
  const currency = product.variants[0].price.currency
  product.price_range = { min: { amount: Math.min(...values), currency }, max: { amount: Math.max(...values), currency } }
  return product
}
export class CatalogService {
  private active = 0
  constructor(public options: Options, private adapter: CatalogAdapter, private profiles = new ProfileResolver(options.platformProfiles)) {}
  private async product(raw: Json): Promise<Json | undefined> {
    if (raw.status && raw.status !== "published") return
    if (!raw.id || !raw.handle || !raw.title || raw.metadata?.ucp_enabled === false || raw.metadata?.ucp_exclude === true) return
    if ((this.options.selection || "opt-in") === "opt-in" && raw.metadata?.ucp_enabled !== true) return
    if (this.options.isVisible && !this.options.isVisible(raw)) return
    const currency = this.options.currency.toUpperCase()
    const productUrl = url(`/products/${encodeURIComponent(raw.handle)}`, this.options.storefrontUrl)!
    const variants: Json[] = []
    for (const v of raw.variants || []) {
      const p = v.calculated_price
      if (p?.currency_code?.toUpperCase() !== currency) continue
      const amount = minorUnits(typeof p.calculated_amount_with_tax === "number" ? p.calculated_amount_with_tax :
        ((this.options.priceMode || "tax-inclusive") === "store" || p.is_calculated_price_tax_inclusive === true ? p.calculated_amount : undefined), currency)
      if (amount === undefined || !v.id) continue
      const defaultAvailability = v.manage_inventory === false ? { available: true, status: "in_stock" } :
        typeof v.inventory_quantity === "number" ? { available: v.inventory_quantity >= 1, status: v.inventory_quantity >= 1 ? "in_stock" : v.allow_backorder ? "backorder" : "out_of_stock" } : { status: "unknown" }
      const availability = this.options.availability ? await this.options.availability(raw, v) : defaultAvailability
      variants.push({ id: String(v.id), title: plain(v.title || raw.title, 500), description: { plain: plain(raw.description) }, url: productUrl,
        price: { amount, currency }, availability: { ...(typeof availability.available === "boolean" ? { available: availability.available } : {}), ...(typeof availability.status === "string" ? { status: availability.status.slice(0, 50) } : {}) },
        options: (v.options || []).flatMap((o: Json) => {
          const name = o.option?.title || raw.options?.find((axis: Json) => axis.id === o.option_id)?.title
          return name && o.value ? [{ name: plain(name, 200), label: plain(o.value, 200), ...(o.id ? { id: String(o.id) } : {}) }] : []
        }),
      })
    }
    if (!variants.length) return
    const image = url(raw.thumbnail || raw.images?.[0]?.url, this.options.storefrontUrl)
    const product: Json = { id: String(raw.id), handle: String(raw.handle), title: plain(raw.title, 500), description: { plain: plain(raw.description) }, url: productUrl,
      variants, categories: (raw.categories || []).filter((c: Json) => c.name).map((c: Json) => ({ value: plain(c.name, 200), taxonomy: "merchant" })),
      tags: (raw.tags || []).flatMap((t: Json) => typeof t.value === "string" ? [plain(t.value, 100)] : []),
      ...(image ? { media: [{ type: "image", url: image, alt_text: plain(raw.title, 500) }] } : {}),
    }
    return range(product)
  }
  async execute(operation: Operation, input: unknown, profile: string) {
    const request = validate(operation, input)
    if (this.active >= 8) throw new CatalogError(503, "Catalogue is busy; retry shortly")
    this.active++
    try {
      const ucp = negotiate(await this.profiles.resolve(profile), operation === "search_catalog" ? SEARCH : LOOKUP)
      const raw = await this.adapter.load(request.context || {})
      if (!Array.isArray(raw) || raw.length > (this.options.maxProducts || 1000)) throw new CatalogError(503, "Catalogue exceeds configured bound")
      let products: Json[] = []
      for (const item of raw) { const p = await this.product(item); if (p) products.push(p) }
      const f = request.filters
      if (f?.categories) products = products.filter(p => p.categories.some((c: Json) => f.categories.includes(c.value)))
      if (f?.price) products = products.flatMap(p => {
        const variants = p.variants.filter((v: Json) => (f.price.min === undefined || v.price.amount >= f.price.min) && (f.price.max === undefined || v.price.amount <= f.price.max))
        return variants.length ? [range({ ...p, variants })] : []
      })
      const messages: Json[] = [{ type: "info", content: "Product unit prices only. Shipping and optional packaging are not included or quoted. Availability is current, not reserved; delivery dates are not guaranteed." }]
      if (this.options.priceMode === "store") messages.push({ type: "info", content: "Prices use the configured Medusa Store API price basis; tax inclusion follows that configuration." })
      if (operation === "search_catalog") {
        const tokens = request.query ? normalize(request.query).split(/[^\p{L}\p{N}]+/u).filter(Boolean) : []
        const score = (p: Json) => {
          const text = normalize([p.title, p.description.plain, ...p.tags, ...p.categories.map((c: Json) => c.value)].join(" "))
          return tokens.reduce((n: number, t: string) => n + (text.includes(t) ? (normalize(p.title).includes(t) ? 3 : 1) : 0), 0)
        }
        if (tokens.length) products = products.filter(p => score(p) > 0)
        products.sort((a, b) => Number(b.variants.some((v: Json) => v.availability.available)) - Number(a.variants.some((v: Json) => v.availability.available)) || score(b) - score(a) || a.id.localeCompare(b.id))
        const fingerprint = createHash("sha256").update(JSON.stringify({ query: request.query, context: request.context, filters: f, products })).digest("hex")
        let offset = 0
        if (request.pagination?.cursor) {
          try {
            const cursor = JSON.parse(Buffer.from(request.pagination.cursor, "base64url").toString("utf8"))
            if (cursor.fingerprint !== fingerprint || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0 || cursor.offset > products.length) throw new Error()
            offset = cursor.offset
          } catch { throw new CatalogError(409, "Invalid or stale cursor; restart the search") }
        }
        const limit = request.pagination?.limit || 10
        const hasNext = offset + limit < products.length
        return { ucp, products: products.slice(offset, offset + limit), messages, pagination: { has_next_page: hasNext, ...(hasNext ? { cursor: Buffer.from(JSON.stringify({ offset: offset + limit, fingerprint })).toString("base64url") } : {}), total_count: products.length } }
      }
      if (operation === "lookup_catalog") {
        const found = new Set<string>()
        products = products.flatMap(p => {
          const productMatch = request.ids.includes(p.id)
          const matches = p.variants.filter((v: Json, index: number) => (productMatch && index === 0) || request.ids.includes(v.id)).map((v: Json, index: number) => {
            const inputs: Json[] = []
            if (productMatch && index === 0) { inputs.push({ id: p.id, match: "featured" }); found.add(p.id) }
            if (request.ids.includes(v.id)) { inputs.push({ id: v.id, match: "exact" }); found.add(v.id) }
            return { ...v, inputs }
          })
          return matches.length ? [range({ ...p, variants: matches })] : []
        })
        if (request.ids.some((id: string) => !found.has(id))) messages.push({ type: "info", content: "Some identifiers were not found or are not visible in this market." })
        return { ucp, products, messages }
      }
      const p = products.find(p => p.id === request.id || p.variants.some((v: Json) => v.id === request.id))
      if (!p) throw new CatalogError(404, "Product not found")
      const explicit = p.variants.find((v: Json) => v.id === request.id)
      let variants = explicit ? [explicit] : p.variants
      const selected = request.selected || explicit?.options || []
      variants = variants.filter((v: Json) => selected.every((s: Json) => v.options.some((o: Json) => s.id ? o.id === s.id : o.name === s.name && o.label === s.label)))
      if (!variants.length) throw new CatalogError(404, "No product variant matches the selection")
      const effective = selected.length ? selected : variants[0].options
      const axes = new Map<string, Map<string, Json>>()
      for (const v of p.variants) for (const o of v.options) {
        if (!axes.has(o.name)) axes.set(o.name, new Map())
        const compatible = p.variants.filter((candidate: Json) => candidate.options.some((x: Json) => x.name === o.name && x.label === o.label) && effective.filter((s: Json) => s.name !== o.name).every((s: Json) => candidate.options.some((x: Json) => x.name === s.name && x.label === s.label)))
        axes.get(o.name)!.set(o.label, { label: o.label, ...(o.id ? { id: o.id } : {}), exists: compatible.length > 0, available: compatible.some((c: Json) => c.availability.available === true) })
      }
      return { ucp, product: range({ ...p, variants, selected: effective, options: [...axes].map(([name, values]) => ({ name, values: [...values.values()] })) }), messages }
    } finally { this.active-- }
  }
}
