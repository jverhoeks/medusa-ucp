import { CatalogService } from "./catalog"
import { StoreCatalogAdapter } from "./store-adapter"
import { CatalogHttp } from "./http"
import { CatalogError, errorResponse } from "./types"
import { parseOptions } from "./options"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
const instances = new WeakMap<object, CatalogHttp>()
export async function route(req: MedusaRequest, res: MedusaResponse, kind: Parameters<CatalogHttp["handle"]>[2]) {
  try {
    const config = req.scope.resolve("configModule") as any
    let handler = instances.get(config)
    if (!handler) {
      const plugin = config.plugins?.find((p: any) => typeof p === "object" && /(?:^|\/)medusa-ucp\/?$/.test(p.resolve || ""))
      if (!plugin) throw new CatalogError(404, "Not found")
      const options = parseOptions(plugin.options)
      handler = new CatalogHttp(new CatalogService(options, new StoreCatalogAdapter(options)))
      instances.set(config, handler)
    }
    await handler.handle(req as any, res as any, kind)
  } catch (error) {
    const known = error instanceof CatalogError
    res.status(known ? error.status : 503).json(errorResponse(known ? error.status : 503, known ? error.message : "Catalogue temporarily unavailable"))
  }
}
