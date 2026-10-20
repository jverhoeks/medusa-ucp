import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { route } from "../../../lib/runtime"
export async function GET(req: MedusaRequest, res: MedusaResponse) { return route(req, res, "profile") }
export async function HEAD(req: MedusaRequest, res: MedusaResponse) { return route(req, res, "profile") }
export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) { return route(req, res, "profile") }
