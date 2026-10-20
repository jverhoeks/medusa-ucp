import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { route } from "../../../lib/runtime"
export async function GET(req: MedusaRequest, res: MedusaResponse) { return route(req, res, "mcp") }
export async function POST(req: MedusaRequest, res: MedusaResponse) { return route(req, res, "mcp") }
export async function DELETE(req: MedusaRequest, res: MedusaResponse) { return route(req, res, "mcp") }
export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) { return route(req, res, "mcp") }
