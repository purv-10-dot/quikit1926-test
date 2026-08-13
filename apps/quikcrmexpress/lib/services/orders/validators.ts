/**
 * Zod schemas for the Orders module. Keep narrow on purpose — Orders
 * are mostly created via Quote → Order (single endpoint), and the
 * patch surface is intentionally small (status, dates, notes).
 */
import { z } from "zod";
import { pageSchema, pageSizeSchema } from "@/lib/validators/pagination";

export const orderStatusSchema = z.enum([
  "Open",
  "Confirmed",
  "Fulfilled",
  "Closed",
  "Cancelled",
]);

export const updateOrderSchema = z
  .object({
    status: orderStatusSchema.optional(),
    expectedDeliveryDate: z.string().datetime().nullable().optional(),
    cancellationReason: z.string().max(2000).nullable().optional(),
    internalNotes: z.string().max(10000).nullable().optional(),
  })
  .strict();

export const listOrdersQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  status: orderStatusSchema.optional(),
  accountId: z.string().optional(),
  q: z.string().optional(),
  trashed: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});
