# Medusa UCP

Read-only Universal Commerce Protocol catalogue discovery for **Medusa 2.21.2**, using
UCP **2026-08-25** and the official TypeScript MCP SDK. MIT licensed.

- Standard REST operations: `search_catalog`, `lookup_catalog`, `get_product`.
- Stateless Streamable HTTP MCP with the same operations and business logic.
- UCP profile, RFC 9727 API catalog, OpenAPI, AI Catalog and MCP Server Card.
- Public-product allowlist projection, regional Medusa prices converted to ISO 4217
  minor units, variant selection, availability, category/price filters and cursors.
- No plugin tables, migrations, external cookies, LLM API calls, customer/order
  access, carts, checkout or payment execution.

**Status: release candidate.** Tested against the pinned versions; no claim of
universal agent/platform support or certification. This is lexical catalogue
search, not a natural-language recommendation engine. The visiting assistant can
interpret a gift request, search interests/categories, compare up to two suitable
in-stock results and explain the match from genuine descriptions. Empty matches
remain empty; unknown delivery/packaging costs are never treated as zero.

## Install and configure

Use the release-candidate tarball from this repository's Releases, not an assumed
npm publication. Add it as a normal dependency of your Medusa backend and retain
the lockfile. In `medusa-config.ts`:

```ts
plugins: [{
  resolve: "@jverhoeks/medusa-ucp",
  options: {
    enabled: true,
    apiUrl: "https://shop.example",       // public API/discovery origin
    storefrontUrl: "https://shop.example",
    backendUrl: "http://localhost:9000",  // server-to-server Medusa Store API
    publishableKey: process.env.UCP_MEDUSA_PUBLISHABLE_KEY,
    country: "NL",
    currency: "EUR",
    locale: "nl",
    selection: "opt-in",
    priceMode: "tax-inclusive",
    maxProducts: 1000,
  },
}]
```

`enabled` is explicit. Mark public products with `metadata.ucp_enabled: true` using
normal admin/product updates. `ucp_enabled: false` or `ucp_exclude: true` always
excludes a product. `selection: "published"` instead includes all otherwise public
products. The configured publishable key determines the sales channel. Never use
an admin token as the publishable key. No new admin UI is included in this release.

By default a price is returned only if Medusa supplies a tax-inclusive calculated
amount or explicitly marks its calculated price as tax-inclusive. Missing or
ambiguous prices are omitted, not estimated. `priceMode: "store"` uses the Store
API's configured price basis and includes a response notice; choose it only when
that matches the storefront. Zero-priced products are supported. Currency/country
must match this configured market. A custom indexed adapter can use exported
`CatalogService` for larger catalogues; the default adapter rejects oversized
catalogues instead of silently truncating them.

The backend URL is trusted deployment configuration, never visitor input. Only
that backend's anonymous `/store/regions` and `/store/products` endpoints are read;
visitor cookies and Authorization headers are never forwarded. Existing custom
Store API visibility rules still apply. Exact calculated prices reflect public
quantity-one pricing, not customer-specific discounts, future stock or reservations.

Composite/gift-set products may need application-specific eligibility and
availability. Configure `isVisible(product)` and asynchronous
`availability(product, variant)` hooks to use your existing bundle logic. Hooks
are trusted server code and must be bounded. Do not enable bundle parents based
only on unmanaged parent inventory when checkout consumes component stock.
The public output remains allowlisted even if a hook reads private metadata.

## Discovery and routing

The plugin serves these Medusa API routes:

| Route | Purpose |
| --- | --- |
| `/.well-known/ucp` (also `/ucp/profile`) | Business profile, REST/MCP endpoints and catalogue capabilities |
| `/.well-known/api-catalog` (also `/ucp/api-catalog`) | RFC 9727 Linkset API discovery |
| `/.well-known/ai-catalog.json` (also `/ucp/ai-catalog.json`) | Domain-level MCP discovery |
| `/ucp/openapi.json` | Only the three implemented REST operations |
| `/ucp/mcp/server-card` | Current MCP Server Card extension schema |
| `/ucp/mcp` | Stateless MCP, POST only; no persistent SSE sessions |
| `/ucp/catalog/search` | Search, POST |
| `/ucp/catalog/lookup` | Batch lookup, POST |
| `/ucp/catalog/product` | Single product/variant detail, POST |

With a separate Next.js storefront, route **these exact discovery paths and
`/ucp/*`** to the backend at your reverse proxy. Merely installing a backend
plugin cannot make frontend-owned root URLs resolve. Preserve existing API rules,
TLS, preview noindex and private-route protections. Add this homepage header:

```http
Link: </.well-known/api-catalog>; rel="api-catalog"
```

`llms.txt` can link to the profile and API documentation after they are reachable.
It remains a readable guide, not a second static price list. Public discovery
responses permit cross-origin reads; operational REST/MCP requests with an Origin
header must match the configured API or storefront origin. Server-to-server
agents normally omit Origin. MCP Host validation uses the configured API host;
reverse proxies must preserve that Host. Local HTTP API origins require
`allowLocalDevelopment: true` and are forbidden with NODE_ENV=production.

## Standard REST example

```sh
curl https://shop.example/ucp/catalog/search \
  -H 'Content-Type: application/json' \
  -H 'Request-Id: 42fab1bc-cc35-4f1a-a852-b0f5792c958b' \
  -H 'UCP-Agent: profile="https://agent.example/.well-known/ucp"' \
  -d '{"query":"flowers","context":{"address_country":"NL","currency":"EUR","intent":"Birthday gift around EUR 50"},"filters":{"price":{"max":5000}},"pagination":{"limit":2}}'
```

The caller must publish its actual UCP platform profile with version 2026-08-25 and
the relevant catalogue capabilities. Capability versions are negotiated exactly;
incompatible or absent capabilities are rejected. Profile retrieval is bounded,
HTTPS-only, disallows private/link-local/loopback destinations, pins validated DNS
answers to the TLS connection, and follows no redirects. Public profile metadata
is not proof of an agent's identity or authority to buy. `platformProfiles` can
provide preloaded public profiles for offline fixtures or known integrations.

Batch lookup: `{"ids":["prod_...","variant_..."]}`. Details:
`{"id":"prod_...","selected":[{"name":"Size","label":"Small"}]}`.
Product and variant IDs are supported; SKU/handle lookup and preference relaxation
are not implemented. Unknown input/filter fields are rejected instead of ignored.
Known unsupported selections do not silently fall back to a different variant.
Prices in filters and responses are **minor units: 5000 = EUR 50**.

MCP uses the standard tool names, with arguments:

```json
{
  "meta": {"ucp-agent": {"profile": "https://agent.example/.well-known/ucp"}},
  "catalog": {"query": "flowers", "context": {"currency": "EUR"}, "filters": {"price": {"max": 5000}}, "pagination": {"limit": 2}}
}
```

MCP clients initialize and use `tools/list` / `tools/call` normally. Only the three
read-only tools are registered. Results are returned in `structuredContent` and
text; missing products are UCP business outcomes, malformed calls are tool errors.
A profile URI is never persisted with a shopper prompt, cookie or customer record.

## Payments later

See [the payment roadmap](docs/PAYMENTS.md). This release advertises an empty
`payment_handlers` registry and no checkout/AP2/payment capability. Adding a
configuration field cannot enable payments. Existing Medusa checkout is unaffected.
The intended payment path is our own UCP checkout plus Stripe’s `com.stripe.payments`
handler, as described in Stripe’s retail guide. Stripe Netherlands support for the specific agent payment product, onboarding,
methods and authorization flow must be verified before implementation; ordinary
Stripe account availability does not establish agent-payment eligibility.

## Validation and limits

Node 22 and npm 11.19.0:

```sh
npm ci
npm test
npm run typecheck
npm run build
npm pack --dry-run
```

Tests include the official MCP client, pinned UCP request/response schemas, minor
units, exact filters/options, field privacy, draft/opt-in exclusion, stale cursors,
negotiation, SSRF protections and bounded rate limiting. See
[integration instructions](docs/INTEGRATION.md) for the disposable real Medusa test.
Vendored schemas are attributed in THIRD_PARTY_NOTICES.md and SHA256-pinned in
spec/manifest.json. They are validation fixtures; this is not an upstream-certified
conformance suite.

Search scans a bounded public catalogue without caching prices. Pagination
restarts if the relevant catalogue snapshot changes. A process-local limiter
allows 120 requests/minute per Express-resolved IP with at most 5000 active keys,
and at most 8 catalogue executions run concurrently. Configure trusted proxy
handling and a shared edge/distributed limiter for multi-process production.
No client-supplied forwarding header is parsed by the plugin. Buyer claims in
context do not grant discounts, account access or payment authority.
