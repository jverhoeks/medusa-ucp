# Release candidate validation,20 October 2026

Tested with Node 22.23.3, npm 11.19.0, Medusa 2.21.2 and PostgreSQL 16.

- 18 unit/schema/HTTP tests pass, including a real official MCP SDK client.
- Backend TypeScript passes. There is no custom admin UI in this version.
- Medusa plugin backend and empty admin-extension builds both pass.
- Real Medusa application fixture passes root discovery routes, REST catalogue
  search/lookup/details, public Store API regional/tax-inclusive prices, public
  field projection and an official MCP client session.
- The synthetic EUR 50 query returns the two EUR 35/45 offers, excluding EUR 70.
  No production catalogue, account, order, email or payment is used.
- A positive public HTTPS JSON download verifies the DNS-pinned profile downloader
  with normal TLS verification; private/mixed DNS rejection is covered in tests.
- `npm audit --omit=dev` reports zero vulnerabilities for this plugin installation's
  retained runtime graph. This does not audit an arbitrary consuming Medusa host.
- Package dry-run excludes fixture state, environment files,
  node_modules and integration data. Generated build output is packaged normally;
  source Git tracks no `.medusa` output.

This is local/reproducible evidence, not hosted CI, UCP certification, live shop
integration or payment readiness. Existing Botica Doro remains unchanged. Upstream
schema snapshots are pinned in spec/manifest.json with license attribution.

Stripe's documented own-UCP/Stripe-payments arrangement is the future target.
The supported-country list includes NL, but the owner's profile, agent commerce
relationships, product access, currency/method/SCA flow and sandbox integration
have not been exercised. No Stripe credentials were read or changed.

## rc.2 JSON-only compatibility, 20 October2026

All19 focused tests pass, including opt-in JSON-only tools/list and catalogue calls,
q=0/other-format rejection, hostile Host/Origin rejection, invalid tool input and
coalesced warning output. The official MCP client also passes with compatibility
enabled. Types and plugin/backend-admin builds pass. The actual Medusa fixture on
an isolated port accepted the JSON-only call, emitted the structured warning, and
passed standard REST/MCP price/privacy checks without data writes or payments.
Strict default behavior remains unchanged; no runtime dependency changed.
