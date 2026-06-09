/**
 * Zod schemas for the Quotes module — Product, PriceList, Quote, lines,
 * status transitions, and list filters.
 *
 * Numeric fields use `z.number()` (not coerce) so the API contract is
 * "send JSON numbers, not strings." `nonnegative()` matches the
 * Decimal(18,2) DB columns which are unsigned by convention.
 */

import { z } from "zod";
import { pageSchema, pageSizeSchema } from "@/lib/validators/pagination";

// ---------- Product ----------

export const productTypeSchema = z.enum(["Product", "Service", "Bundle"]);

const productTaxonomyIds = z.object({
  categoryId: z.string().min(1).optional().nullable(),
  subcategoryId: z.string().min(1).optional().nullable(),
  brandId: z.string().min(1).optional().nullable(),
  familyId: z.string().min(1).optional().nullable(),
});

export const createProductSchema = z
  .object({
    name: z.string().min(1).max(200),
    sku: z.string().min(1).max(50),
    category: z.string().max(100).optional().nullable(),
    barcode: z.string().max(80).optional().nullable(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    hsnCode: z.string().max(10).optional().nullable(),
    sacCode: z.string().max(10).optional().nullable(),
    unitGroup: z.string().max(50).optional(),
    defaultUnit: z.string().max(50).optional(),
    standardCost: z.number().nonnegative().optional().nullable(),
    listPrice: z.number().nonnegative(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/u, "Use 3-letter ISO 4217 currency codes")
      .optional(),
    gstRate: z.number().min(0).max(100),
    cgstRate: z.number().min(0).max(100).optional().nullable(),
    sgstRate: z.number().min(0).max(100).optional().nullable(),
    igstRate: z.number().min(0).max(100).optional().nullable(),
    manufacturer: z.string().max(200).optional().nullable(),
    warrantyMonths: z.number().int().min(0).max(600).optional().nullable(),
    weightKg: z.number().nonnegative().optional().nullable(),
    lengthCm: z.number().nonnegative().optional().nullable(),
    widthCm: z.number().nonnegative().optional().nullable(),
    heightCm: z.number().nonnegative().optional().nullable(),
    serialTracked: z.boolean().optional(),
    dynamicFields: z.record(z.unknown()).optional(),
    description: z.string().max(5000).optional().nullable(),
    imageUrl: z.string().url().optional().nullable().or(z.literal("")),
    productType: productTypeSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .merge(productTaxonomyIds);

export const updateProductSchema = createProductSchema.partial().strict();

export const listProductsQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  q: z.string().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  categoryId: z.string().optional(),
  subcategoryId: z.string().optional(),
  brandId: z.string().optional(),
  familyId: z.string().optional(),
  tag: z.string().optional(),
  hsnCode: z.string().optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  productType: productTypeSchema.optional(),
  trashed: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

export const stockMovementSchema = z.object({
  warehouseId: z.string().min(1),
  variantId: z.string().min(1).optional().nullable(),
  quantity: z.number().int(),
  movementType: z.enum(["Receipt", "Issue", "Adjustment", "Reserve", "Release", "Transfer"]),
  reference: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const productVariantSchema = z.object({
  sku: z.string().min(1).max(50),
  name: z.string().max(200).optional().nullable(),
  barcode: z.string().max(80).optional().nullable(),
  attributes: z.record(z.string()).optional().nullable(),
  listPrice: z.number().nonnegative().optional().nullable(),
  standardCost: z.number().nonnegative().optional().nullable(),
  gstRate: z.number().min(0).max(100).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const productImageSchema = z.object({
  url: z.string().url(),
  label: z.string().max(200).optional().nullable(),
  sortOrder: z.number().int().optional(),
  isPrimary: z.boolean().optional(),
});

export const taxonomyCreateSchema = z.object({
  kind: z.enum(["Category", "Subcategory", "Brand", "Family"]),
  name: z.string().min(1).max(120),
  parentId: z.string().min(1).optional().nullable(),
  sortOrder: z.number().int().optional(),
});

// ---------- Price List ----------

export const createPriceListSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/u)
    .optional(),
  effectiveFrom: z.string().datetime().optional().nullable(),
  effectiveTo: z.string().datetime().optional().nullable(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  regionCode: z.string().trim().max(64).optional().nullable(),
  customerTier: z.string().trim().max(64).optional().nullable(),
});

export const updatePriceListSchema = createPriceListSchema.partial().strict();

export const priceListItemSchema = z.object({
  productId: z.string().min(1),
  unitPrice: z.number().nonnegative(),
  discountPct: z.number().min(0).max(100).optional(),
  minQuantity: z.number().int().min(1).optional(),
  floorPrice: z.number().nonnegative().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const updatePriceListItemSchema = priceListItemSchema.partial().strict();

export const priceListSortBySchema = z.enum(["name", "createdAt", "updatedAt"]);

export const listPriceListsQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  q: z.string().optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/u)
    .optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  isDefault: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  trashed: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  sortBy: priceListSortBySchema.optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});

export const bulkPriceListItemsSchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1),
  mode: z.enum(["percent", "absolute"]),
  value: z.number(),
  allowBelowFloor: z.boolean().optional(),
});

export const importPriceListItemsSchema = z.object({
  rows: z
    .array(
      z.object({
        sku: z.string().min(1),
        unitPrice: z.number().nonnegative(),
        discountPct: z.number().min(0).max(100).optional(),
        minQuantity: z.number().int().min(1).optional(),
        floorPrice: z.number().nonnegative().optional().nullable(),
        notes: z.string().max(2000).optional().nullable(),
      }),
    )
    .min(1)
    .max(5000),
  allowBelowFloor: z.boolean().optional(),
});

export const duplicatePriceListSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
});

// ---------- Quote ----------

export const quoteStatusSchema = z.enum([
  "Draft",
  "Active",
  "Won",
  "Lost",
  "Revised",
]);

export const quoteLineInputSchema = z.object({
  productId: z.string().min(1).optional().nullable(),
  productName: z.string().min(1).max(200),
  sku: z.string().max(50).optional().nullable(),
  hsnCode: z.string().max(10).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  quantity: z.number().positive(),
  unit: z.string().max(50).optional(),
  unitPrice: z.number().nonnegative(),
  discountPct: z.number().min(0).max(100).optional(),
  gstRate: z.number().min(0).max(100),
  sortOrder: z.number().int().optional(),
});

export const createQuoteSchema = z.object({
  accountId: z.string().min(1),
  contactId: z.string().min(1).optional().nullable(),
  opportunityId: z.string().min(1).optional().nullable(),
  priceListId: z.string().min(1).optional().nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/u)
    .optional(),
  effectiveFrom: z.string().datetime().optional().nullable(),
  effectiveTo: z.string().datetime().optional().nullable(),
  companyState: z.string().max(100).optional().nullable(),
  billingState: z.string().max(100).optional().nullable(),
  overallDiscountAmount: z.number().nonnegative().optional(),
  freightAmount: z.number().nonnegative().optional(),
  termsText: z.string().max(20000).optional().nullable(),
  ownerId: z.string().min(1).optional().nullable(),
  lines: z.array(quoteLineInputSchema).optional(),
});

export const updateQuoteSchema = z
  .object({
    contactId: z.string().min(1).nullable().optional(),
    opportunityId: z.string().min(1).nullable().optional(),
    priceListId: z.string().min(1).nullable().optional(),
    effectiveFrom: z.string().datetime().nullable().optional(),
    effectiveTo: z.string().datetime().nullable().optional(),
    companyState: z.string().max(100).nullable().optional(),
    billingState: z.string().max(100).nullable().optional(),
    overallDiscountAmount: z.number().nonnegative().optional(),
    freightAmount: z.number().nonnegative().optional(),
    termsText: z.string().max(20000).nullable().optional(),
    ownerId: z.string().min(1).nullable().optional(),
    // status transitions go through /transition — rejected on PATCH.
  })
  .strict();

export const updateQuoteLineSchema = quoteLineInputSchema.partial().strict();

export const quoteTransitionSchema = z.object({
  toStatus: quoteStatusSchema,
  reason: z.string().max(2000).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const sendQuoteSchema = z.object({
  to: z.array(z.string().email()).min(1, "At least one recipient required").max(20),
  cc: z.array(z.string().email()).max(20).optional(),
  bcc: z.array(z.string().email()).max(20).optional(),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(20000),
});

export const listQuotesQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  status: quoteStatusSchema.optional(),
  accountId: z.string().optional(),
  opportunityId: z.string().optional(),
  ownerId: z.string().optional(),
  q: z.string().optional(),
  trashed: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});
