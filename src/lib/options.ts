import { CatalogError, type Options } from "./types"
export type PluginOptions = Options & { allowLocalDevelopment?: boolean }
export function parseOptions(input: PluginOptions): Options {
  if (!input || typeof input.enabled !== "boolean") throw new CatalogError(503, "UCP plugin requires explicit configuration")
  if (!input.enabled) return input
  for (const key of ["apiUrl", "storefrontUrl", "backendUrl"] as const) {
    let u: URL
    try { u = new URL(input[key]) } catch { throw new CatalogError(503, `Invalid UCP ${key}`) }
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
    const internalBackend = key === "backendUrl" && u.protocol === "http:"
    if ((u.protocol !== "https:" && !internalBackend && !(local && input.allowLocalDevelopment && process.env.NODE_ENV !== "production")) || u.username || u.password || u.search || u.hash || u.pathname !== "/") throw new CatalogError(503, `Invalid UCP ${key}`)
  }
  if (!input.publishableKey?.startsWith("pk_") || !/^[A-Z]{2}$/.test(input.country) || !/^[A-Z]{3}$/.test(input.currency)) throw new CatalogError(503, "Configure a publishable key and uppercase country/currency")
  if (input.allowJsonOnlyMcp !== undefined && typeof input.allowJsonOnlyMcp !== "boolean") throw new CatalogError(503, "allowJsonOnlyMcp must be boolean")
  if (input.selection && !["published", "opt-in"].includes(input.selection)) throw new CatalogError(503, "Invalid catalogue selection")
  if (input.priceMode && !["store", "tax-inclusive"].includes(input.priceMode)) throw new CatalogError(503, "Invalid catalogue price mode")
  if (input.maxProducts !== undefined && (!Number.isInteger(input.maxProducts) || input.maxProducts < 1 || input.maxProducts > 10000)) throw new CatalogError(503, "maxProducts must be between 1 and 10000")
  return { ...input, apiUrl: new URL(input.apiUrl).origin, storefrontUrl: new URL(input.storefrontUrl).origin, backendUrl: new URL(input.backendUrl).origin }
}
