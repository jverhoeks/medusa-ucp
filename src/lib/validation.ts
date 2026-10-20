import { z } from "zod"
import { CatalogError, type Operation } from "./types"
const id = z.string().trim().min(1).max(200)
const context = z.object({
  address_country: z.string().regex(/^[A-Z]{2}$/).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  language: z.string().min(2).max(35).optional(),
  intent: z.string().max(1000).optional(),
}).passthrough().optional()
const filters = z.object({
  categories: z.array(z.string().min(1).max(200)).min(1).max(20).optional(),
  price: z.object({ min: z.number().int().nonnegative().safe().optional(), max: z.number().int().nonnegative().safe().optional() }).strict()
    .refine(v => v.min !== undefined || v.max !== undefined, "Supply a price bound")
    .refine(v => v.min === undefined || v.max === undefined || v.min <= v.max, "Reversed price bounds").optional(),
}).strict().refine(v => Object.keys(v).length > 0, "Supply a filter").optional()
const shared = { context, filters, signals: z.record(z.unknown()).optional(), attribution: z.record(z.unknown()).optional() }
export const schemas = {
  search_catalog: z.object({ ...shared, query: z.string().trim().min(1).max(500).optional(), pagination: z.object({ limit: z.number().int().min(1).max(50).optional(), cursor: z.string().max(1000).optional() }).strict().optional() }).strict()
    .refine(v => Boolean(v.query || v.filters), "Supply query or filters"),
  lookup_catalog: z.object({ ...shared, ids: z.array(id).min(1).max(50) }).strict(),
  get_product: z.object({ ...shared, id, selected: z.array(z.object({ name: id, label: id, id: id.optional() }).strict()).max(20).optional(), preferences: z.array(id).max(20).optional() }).strict(),
}
export function validate(operation: Operation, input: unknown): any {
  const result = schemas[operation].safeParse(input)
  if (!result.success) throw new CatalogError(400, result.error.issues[0]?.message || "Invalid request")
  const value: any = result.data
  if (value.filters?.price && !value.context?.currency) throw new CatalogError(400, "Price filters require context.currency")
  // This first release uses exact selections, never silently relaxes a buyer's choice.
  if (operation === "get_product" && value.preferences?.length) throw new CatalogError(400, "Preference relaxation is not supported; use exact selected options")
  return value
}
