import { defineMiddlewares } from "@medusajs/framework/http"
import { route } from "../lib/runtime"
export default defineMiddlewares({ routes: [
  { matcher: "/ucp/*", bodyParser: { sizeLimit: "64kb" }, middlewares: [] },
  ...Object.entries({ "/.well-known/ucp": "profile", "/.well-known/api-catalog": "api-catalog", "/.well-known/ai-catalog.json": "ai-catalog" } as const).map(([matcher, kind]) => ({
    matcher, middlewares: [(req: any, res: any) => route(req, res, kind)],
  })),
] })
