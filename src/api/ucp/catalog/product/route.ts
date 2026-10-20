import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { route } from "../../../../lib/runtime"
export async function POST(req: MedusaRequest, res: MedusaResponse) { return route(req, res, "get_product") }
export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) { return route(req, res, "get_product") }
