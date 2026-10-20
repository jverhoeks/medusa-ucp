import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js"
import { CAPABILITIES, VERSION, PACKAGE_VERSION, SEARCH, type Options } from "./types"
export function discovery(options: Options) {
  const base = options.apiUrl
  const capabilities = Object.fromEntries(CAPABILITIES.map(name => {
    const file = name === SEARCH ? "search" : "lookup"
    return [name, [{ version: VERSION, spec: `https://ucp.dev/${VERSION}/specification/shopping/catalog/${file}/`, schema: `https://ucp.dev/${VERSION}/schemas/shopping/catalog_${file}.json` }]]
  }))
  return { ucp: { version: VERSION, services: { "dev.ucp.shopping": [
    { version: VERSION, spec: `https://ucp.dev/${VERSION}/specification/overview/`, transport: "rest", schema: `${base}/ucp/openapi.json`, endpoint: `${base}/ucp` },
    { version: VERSION, spec: `https://ucp.dev/${VERSION}/specification/overview/`, transport: "mcp", schema: `https://ucp.dev/${VERSION}/services/shopping/mcp.openrpc.json`, endpoint: `${base}/ucp/mcp` },
  ] }, capabilities, payment_handlers: {} } }
}
export function serverCard(options: Options) {
  const host = new URL(options.apiUrl).hostname.split(".").reverse().join(".")
  return { $schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json", name: `${host}/catalog`, title: options.name || "Medusa catalogue", description: "Read-only product search, lookup and regional prices from a Medusa shop.", version: PACKAGE_VERSION,
    websiteUrl: options.storefrontUrl, remotes: [{ type: "streamable-http", url: `${options.apiUrl}/ucp/mcp`, supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS }] }
}
export function aiCatalog(options: Options) {
  return { specVersion: "1.0", entries: [{ identifier: `urn:air:${new URL(options.apiUrl).hostname}:mcp:catalog`, type: "application/mcp-server-card+json", url: `${options.apiUrl}/ucp/mcp/server-card` }] }
}
export function apiCatalog(options: Options) {
  return { linkset: [{ anchor: `${options.apiUrl}/ucp`, "service-desc": [{ href: `${options.apiUrl}/ucp/openapi.json`, type: "application/vnd.oai.openapi+json" }], "service-doc": [{ href: "https://github.com/jverhoeks/medusa-ucp#readme", type: "text/html" }] }] }
}
export function openapi(options: Options) {
  const refs: Record<string, string> = { search: "catalog_search.json#/$defs/search_request", lookup: "catalog_lookup.json#/$defs/lookup_request", product: "catalog_lookup.json#/$defs/get_product_request" }
  const responses: Record<string, string> = { search: "catalog_search.json#/$defs/search_response", lookup: "catalog_lookup.json#/$defs/lookup_response", product: "catalog_lookup.json#/$defs/get_product_response" }
  return { openapi: "3.1.0", info: { title: options.name || "Medusa UCP catalogue", version: PACKAGE_VERSION, description: "Read-only UCP catalogue. Prices are minor units; shipping and packaging are not quoted. Published catalogue is bounded; no cart, checkout or payment endpoints." }, servers: [{ url: `${options.apiUrl}/ucp` }], paths: Object.fromEntries(Object.keys(refs).map(path => [`/catalog/${path}`, { post: {
    operationId: path === "search" ? "search_catalog" : path === "lookup" ? "lookup_catalog" : "get_product",
    parameters: [{ name: "UCP-Agent", in: "header", required: true, schema: { type: "string" }, description: 'profile="https://agent.example/.well-known/ucp"' }, { name: "Request-Id", in: "header", required: true, schema: { type: "string", format: "uuid" } }],
    requestBody: { required: true, content: { "application/json": { schema: { $ref: `https://ucp.dev/${VERSION}/schemas/shopping/${refs[path]}` } } } },
    responses: { "200": { description: "Catalogue result", content: { "application/json": { schema: { $ref: `https://ucp.dev/${VERSION}/schemas/shopping/${responses[path]}` } } } }, "400": { description: "Invalid or unsupported input" }, "404": { description: "Product not found" }, "409": { description: "Version/capability mismatch or stale cursor" }, "429": { description: "Rate limit exceeded" }, "503": { description: "Catalogue unavailable or bounded capacity reached" } },
  } }])) }
}
