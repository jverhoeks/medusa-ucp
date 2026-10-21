export const VERSION = "2026-08-25"
export const PACKAGE_VERSION = "0.1.0-rc.2"
export const SEARCH = "dev.ucp.shopping.catalog.search"
export const LOOKUP = "dev.ucp.shopping.catalog.lookup"
export const CAPABILITIES = [SEARCH, LOOKUP]
export type Operation = "search_catalog" | "lookup_catalog" | "get_product"
export type Json = Record<string, any>
export class CatalogError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
export type Options = {
  enabled: boolean
  apiUrl: string
  storefrontUrl: string
  backendUrl: string
  publishableKey: string
  country: string
  currency: string
  locale?: string
  name?: string
  selection?: "opt-in" | "published"
  priceMode?: "tax-inclusive" | "store"
  /** Narrow compatibility for JSON-only MCP clients; responses remain JSON. */
  allowJsonOnlyMcp?: boolean
  maxProducts?: number
  platformProfiles?: Record<string, Json>
  /** Public-product policy. Never return private fields from this hook. */
  isVisible?: (product: Json) => boolean
  /** Composite products must resolve component availability through this hook. */
  availability?: (product: Json, variant: Json) => Promise<{ available?: boolean; status?: string }>
}
export type CatalogAdapter = { load(context: Json): Promise<Json[]> }

export function errorResponse(status: number, message: string) {
  return { ucp: { version: VERSION, status: "error" }, messages: [{ type: "error", code: status === 404 ? "not_found" : status === 409 ? "incompatible_request" : status === 429 ? "rate_limited" : status >= 500 ? "temporarily_unavailable" : "invalid_request", content: message, severity: "recoverable" }] }
}
