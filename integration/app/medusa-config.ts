import { defineConfig } from "@medusajs/framework/utils"
import path from "node:path"
import fs from "node:fs"
const port = Number(process.env.UCP_FIXTURE_PORT || 9003)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid fixture port")
const origin = `http://localhost:${port}`
const state = path.join(__dirname, ".fixture-state.json")
const key = fs.existsSync(state) ? JSON.parse(fs.readFileSync(state, "utf8")).key : "pk_fixture"
export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: { storeCors: origin, adminCors: origin, authCors: origin, jwtSecret: "local-ucp-fixture-only", cookieSecret: "local-ucp-fixture-only" },
  },
  admin: { disable: true },
  plugins: [{ resolve: path.resolve(__dirname, "../.."), options: {
    enabled: true, apiUrl: origin, storefrontUrl: "https://fixture.example", backendUrl: origin, allowLocalDevelopment: true,
    allowJsonOnlyMcp: true, publishableKey: key, country: "NL", currency: "EUR", platformProfiles: {
      "https://agent.example/.well-known/ucp": { ucp: { version: "2026-08-25", services: {}, payment_handlers: {}, capabilities: {
        "dev.ucp.shopping.catalog.search": [{version:"2026-08-25"}], "dev.ucp.shopping.catalog.lookup": [{version:"2026-08-25"}],
      } } },
    },
  } }],
})
