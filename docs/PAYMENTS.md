# Future checkout and payments

The current plugin is a read-only catalogue service. Future work is deliberately
separate from this release and requires its own authorization and acceptance gates.

1. Add UCP cart/checkout adapters around Medusa's existing cart, tax, shipping,
   stock reservation and payment-collection workflows. Never duplicate the order
   or ledger model in this plugin. Build idempotency and compensation into mutations.
2. Negotiate and advertise a capability only after its implementation and tests
   exist. Keep published protocol versions/schemas immutable; retain compatibility
   with deployed clients. Product-only prices are not a payable checkout total.
3. Reprice the exact selected variants/quantities at checkout, calculate packaging
   and destination-specific delivery/tax, validate composite stock and obtain the
   user's confirmation of the resulting amount and terms.
4. Add payment-provider adapters behind the checkout boundary. The intended first
   integration is **our own UCP checkout with Stripe only for payments**, using
   `com.stripe.payments` and Shared Payment Tokens. Stripe documents this exact
   retail arrangement. Retain Medusa as the order/payment-collection source of truth.
   The plugin remains reusable for other providers; Stripe is not a requirement
   for read-only discovery. Verify Netherlands
   merchant eligibility for the precise agent-payment integration, supported
   currencies/methods, account onboarding, SCA/3DS/redirect behavior and provider terms.
   Do not infer that normal Stripe card/iDEAL support implies UCP/AP2/MPP support.
5. If the chosen agent/platform/provider supports AP2, validate signed checkout and
   payment mandates bound to the exact cart/amount, expiry, user consent and audience.
   A claimed profile URL, unsigned context or MCP connection never authorizes a charge.
6. Evaluate MPP separately if a concrete use case calls for machine payments. Do not
   put paid-access middleware in front of free product search. No automatic linkage
   between MPP, AP2 or Stripe is assumed by this architecture.
7. Handle signed, retryable webhooks, idempotent completion, failure recovery,
   refunds and audit trails. Keep provider secrets and mandates server-side; never
   advertise them in discovery documents, logs, package examples or tool metadata.
8. Before production, prove sandbox success and failure flows, buyer-present and
   delegated consent, SCA/3DS, cancellation/retry, duplicate delivery and refund
   behavior. Release test first with backups and rollback; no real charge is a smoke test.

No checkout handler interface is exposed as a stable API yet: it should follow the
chosen UCP/provider contract, rather than freezing an unverified payment design.
The current shared catalogue service and separate REST/MCP transports leave that
boundary open without shipping pretend payment endpoints.

Primary references:
- https://ucp.dev/2026-08-25/specification/overview/
- https://ucp.dev/documentation/ucp-and-ap2/
- https://ap2-protocol.org/
- https://mpp.dev/

## Stripe retail target, reviewed20 October 2026

Stripe's own-checkout guide explicitly supports a merchant-owned UCP checkout
with Stripe processing payment credentials. The merchant needs a Stripe business
profile and a confirmed commerce relationship with each agent in the same mode.
The agent obtains a scoped SPT, submits it to UCP Complete Checkout, and our
server uses the authoritative checkout total to create/confirm the Stripe
PaymentIntent. No raw card collection belongs in this merchant plugin.

Before implementation, pin the Stripe handler schema/API version and verify the
current environment enum and instrument requirements against that version.
The reviewed material uses preview Stripe APIs; do not copy unpinned snippets
into production. The existing Medusa Stripe provider must be evaluated for SPT
support; do not assume it already accepts `shared_payment_granted_token`.

The separate MCP monetization guide is an experimental flow where a tool returns
a purchase link and an HTTP endpoint negotiates MPP payment. It can support
one-time purchases; it is not a requirement for UCP retail checkout. Keep search
free and do not accidentally charge once through MPP and again through Medusa.
An MPP receipt is not a substitute for a valid Medusa physical-goods order,
delivery details, inventory allocation, fulfillment or the consumer invoice.

Stripe's seller SPT documentation lists NL as a supported country as of 20 October 2026.
Account access, currency/method availability and SCA/3DS remain unverified for the
owner's account. Country support alone does not establish account/product access. No Stripe account inspection,
credential changes, sandbox charge or live charge is performed by this phase.

Reviewed primary sources:
- https://docs.stripe.com/agentic-commerce/sellers/use-cases/retail
- https://docs.stripe.com/agentic-commerce/sellers/use-cases/retail/ucp
- https://docs.stripe.com/agentic-commerce/protocols/ucp/stripe-payments-handler
- https://docs.stripe.com/agentic-commerce/monetize-mcp
- https://docs.stripe.com/payments/machine

- https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens.md?agent-seller=seller
