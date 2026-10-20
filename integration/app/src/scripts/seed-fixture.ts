import { createApiKeysWorkflow, createProductsWorkflow, createRegionsWorkflow, createSalesChannelsWorkflow, updatePricePreferencesWorkflow, linkSalesChannelsToApiKeyWorkflow } from "@medusajs/medusa/core-flows"
import { ExecArgs } from "@medusajs/framework/types"
import fs from "node:fs"
export default async function seed({ container }: ExecArgs) {
  const url = new URL(process.env.DATABASE_URL || "")
  if (url.hostname !== "localhost" || !url.pathname.startsWith("/ucp_fixture_") || fs.existsSync(".fixture-state.json")) throw new Error("Only a fresh disposable localhost UCP fixture is allowed")
  const { result: channels } = await createSalesChannelsWorkflow(container).run({ input: { salesChannelsData: [{ name: "UCP fixture only" }] } })
  const { result: keys } = await createApiKeysWorkflow(container).run({ input: { api_keys: [{ title: "UCP fixture public key", type: "publishable", created_by: "fixture" }] } })
  await linkSalesChannelsToApiKeyWorkflow(container).run({ input: { id: keys[0].id, add: [channels[0].id] } })
  await createRegionsWorkflow(container).run({ input: { regions: [{ name: "UCP NL fixture", currency_code: "eur", countries: ["nl"] }] } })
  await updatePricePreferencesWorkflow(container).run({ input: { selector: { attribute: "currency_code", value: "eur" }, update: { is_tax_inclusive: true } } })
  const { result } = await createProductsWorkflow(container).run({ input: { products: [35,45,70].map((amount, index) => ({
    title: `Flowers birthday fixture ${index}`, handle: `ucp-fixture-${index}`, status: "published" as any,
    description: "Floral notebook and candle gift. Fictional local fixture only.", metadata: { ucp_enabled: true, supplier_cost: 1 },
    sales_channels: [{id:channels[0].id}], options: [{title:"Size",values:["Small"]}],
    variants: [{title:"Small",manage_inventory:false,options:{Size:"Small"},prices:[{currency_code:"eur",amount}]}],
  })) } })
  fs.writeFileSync(".fixture-state.json", JSON.stringify({ key: keys[0].token, ids: result.map(p=>p.id) }), { mode: 0o600 })
  console.log("Created local UCP fixture products and publishable key")
}
