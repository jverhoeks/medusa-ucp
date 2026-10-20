import https from "node:https"
import { lookup } from "node:dns/promises"
import ipaddr from "ipaddr.js"
import { CatalogError, CAPABILITIES, VERSION, type Json } from "./types"

export function profileUrl(input: string) {
  if (input.length > 2000) throw new CatalogError(400, "Platform profile URL is too long")
  let u: URL
  try { u = new URL(input) } catch { throw new CatalogError(400, "Invalid platform profile URL") }
  if (u.protocol !== "https:" || u.username || u.password || u.hash || u.search || (u.port && u.port !== "443")) throw new CatalogError(400, "Platform profile must be a public HTTPS URL")
  const host = u.hostname.replace(/^\[|\]$/g, "")
  if (ipaddr.isValid(host) && !publicAddress(host)) throw new CatalogError(400, "Private platform profile is not allowed")
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) throw new CatalogError(400, "Private platform profile is not allowed")
  return u
}
export function publicAddress(address: string) {
  try {
    let ip = ipaddr.parse(address)
    if (ip.kind() === "ipv6" && (ip as ipaddr.IPv6).isIPv4MappedAddress()) ip = (ip as ipaddr.IPv6).toIPv4Address()
    return ip.range() === "unicast"
  } catch { return false }
}
/** Pin TLS to the DNS answers we vetted. No redirects, ambient auth or private IPs. */
export async function downloadProfile(url: URL, resolver: typeof lookup = lookup): Promise<Json> {
  const host = url.hostname.replace(/^\[|\]$/g, "")
  let timer: ReturnType<typeof setTimeout> | undefined
  let addresses
  try {
    addresses = await Promise.race([
      resolver(host, { all: true }),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new CatalogError(502, "Platform profile DNS lookup timed out")), 5000) }),
    ])
  } finally { if (timer) clearTimeout(timer) }
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new CatalogError(400, "Platform profile resolved to a non-public address")
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      agent: false, signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" },
      lookup: ((_hostname: string, options: any, callback: any) => {
        if (options?.all) callback(null, addresses)
        else callback(null, addresses[0].address, addresses[0].family)
      }) as any,
    }, response => {
      if (response.statusCode !== 200) { response.resume(); reject(new CatalogError(502, "Platform profile is unavailable")); return }
      const chunks: Buffer[] = []; let size = 0
      response.on("data", (chunk: Buffer) => {
        size += chunk.length
        if (size > 65536) { response.destroy(); reject(new CatalogError(413, "Platform profile is too large")); return }
        chunks.push(chunk)
      })
      response.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))) }
        catch { reject(new CatalogError(400, "Platform profile is not JSON")) }
      })
      response.on("error", () => reject(new CatalogError(502, "Platform profile download failed")))
    })
    request.on("error", () => reject(new CatalogError(502, "Platform profile download failed")))
  })
}
export function negotiate(profile: Json, capability: string) {
  if (profile?.ucp?.version !== VERSION) throw new CatalogError(409, "Unsupported UCP version")
  const offered = profile.ucp.capabilities
  const active = Object.fromEntries(CAPABILITIES.filter(name => Array.isArray(offered?.[name]) && offered[name].some((v: Json) => v.version === VERSION)).map(name => [name, [{ version: VERSION }]]))
  if (!active[capability]) throw new CatalogError(409, "No compatible catalogue capability")
  return { version: VERSION, capabilities: active }
}
export class ProfileResolver {
  private cache = new Map<string, { value: Json; expires: number }>()
  constructor(private configured: Record<string, Json> = {}, private download = downloadProfile) {}
  async resolve(value: string) {
    const url = profileUrl(value)
    // Trusted deployment configuration permits offline fixtures; request URLs still validated.
    if (Object.prototype.hasOwnProperty.call(this.configured, url.href)) return this.configured[url.href]
    const hit = this.cache.get(url.href)
    if (hit && hit.expires > Date.now()) return hit.value
    const result = await this.download(url)
    if (this.cache.size >= 256) {
      for (const [key, item] of this.cache) if (item.expires <= Date.now()) this.cache.delete(key)
      if (this.cache.size >= 256) this.cache.delete(this.cache.keys().next().value!)
    }
    this.cache.set(url.href, { value: result, expires: Date.now() + 60000 })
    return result
  }
}
