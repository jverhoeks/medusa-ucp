import { CatalogError, type CatalogAdapter, type Json, type Options } from "./types"

/** Medusa's anonymous Store API owns sales-channel visibility and regional pricing. */
export class StoreCatalogAdapter implements CatalogAdapter {
  constructor(private options: Options, private fetcher: typeof fetch = fetch) {}
  private async read(path: string, params: Record<string, string>, locale: string, deadline?: AbortSignal) {
    const url = new URL(path, this.options.backendUrl)
    url.search = new URLSearchParams(params).toString()
    const response = await this.fetcher(url, { headers: {
      "x-publishable-api-key": this.options.publishableKey, "x-medusa-locale": locale,
    }, cache: "no-store", redirect: "error", signal: deadline ? AbortSignal.any([AbortSignal.timeout(10000), deadline]) : AbortSignal.timeout(10000) })
    if (!response.ok) throw new CatalogError(503, "Medusa catalogue is unavailable")
    // Bound upstream response bodies, even with a misconfigured backend.
    const reader = response.body?.getReader(); if (!reader) throw new CatalogError(503, "Missing catalogue response")
    const chunks: Uint8Array[] = []; let size = 0
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      size += value.length
      if (size > 4 * 1024 * 1024) { await reader.cancel(); throw new CatalogError(503, "Catalogue page is too large") }
      chunks.push(value)
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) }
    catch { throw new CatalogError(503, "Invalid catalogue response") }
  }
  async load(context: Json) {
    const deadline = AbortSignal.timeout(20000)
    let bytes = 0
    const country = (context.address_country || this.options.country).toLowerCase()
    const currency = (context.currency || this.options.currency).toLowerCase()
    if (country !== this.options.country.toLowerCase() || currency !== this.options.currency.toLowerCase()) throw new CatalogError(400, "This catalogue does not support the requested market/currency")
    const locale = context.language || this.options.locale || country
    const data = await this.read("/store/regions", {}, locale, deadline)
    const region = data.regions?.find((r: Json) => r.currency_code === currency && r.countries?.some((c: Json) => c.iso_2 === country))
    if (!region) throw new CatalogError(503, "Configured Medusa market is unavailable")
    const products: Json[] = []; const seen = new Set<string>()
    const cap = this.options.maxProducts || 1000
    for (let offset = 0; offset < cap;) {
      const page = await this.read("/store/products", {
        region_id: region.id, country_code: country, limit: String(Math.min(100, cap - offset)), offset: String(offset),
        fields: "id,title,description,handle,status,thumbnail,*images,*categories,*tags,+metadata,*options,*variants.options,*variants.calculated_price,+variants.inventory_quantity,+variants.manage_inventory,+variants.allow_backorder",
      }, locale, deadline)
      bytes += Buffer.byteLength(JSON.stringify(page.products || []), "utf8")
      if (bytes > 8 * 1024 * 1024) throw new CatalogError(503, "Catalogue exceeds the response memory bound; use a custom indexed adapter")
      if (!Array.isArray(page.products) || !Number.isSafeInteger(page.count) || page.count < 0) throw new CatalogError(503, "Invalid catalogue page")
      if (page.count > cap) throw new CatalogError(503, "Catalogue exceeds configured product bound; increase maxProducts or use a custom indexed adapter")
      for (const p of page.products) {
        if (seen.has(p.id)) throw new CatalogError(503, "Catalogue changed during pagination; retry")
        seen.add(p.id); products.push(p)
      }
      offset += page.products.length
      if (offset >= page.count) return products
      if (!page.products.length) throw new CatalogError(503, "Incomplete catalogue page")
    }
    return products
  }
}
