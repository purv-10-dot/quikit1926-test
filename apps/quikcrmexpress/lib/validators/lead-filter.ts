import { z } from "zod";
import { pageSchema, pageSizeSchema } from "./pagination";

const operatorEnum = z.enum([
  "eq",
  "neq",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  "isEmpty",
  "isNotEmpty",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "before",
  "after",
  "on",
  // relative date operators (Build 1a)
  "relToday",
  "relYesterday",
  "relTomorrow",
  "relThisWeek",
  "relLastWeek",
  "relNextWeek",
  "relThisMonth",
  "relLastMonth",
  "relThisYear",
  "relLastYear",
  "relLastNDays",
  "relNextNDays",
  "in",
  "notIn",
  "isTrue",
  "isFalse",
]);

const filterValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()),
  z.array(z.number()),
]);

export const conditionRowSchema = z.object({
  field: z.string().min(1),
  operator: operatorEnum,
  value: filterValue.optional(),
  valueTo: z.union([z.string(), z.number(), z.null()]).optional(),
});

export const filterPayloadSchema = z.object({
  matchMode: z.enum(["ALL", "ANY"]).default("ALL"),
  conditions: z.array(conditionRowSchema).default([]),
});

export const leadFilterRequestSchema = z.object({
  filter: filterPayloadSchema,
  page: pageSchema,
  pageSize: pageSizeSchema,
  sortBy: z.string().default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const savedViewBodySchema = z.object({
  name: z.string().min(1).max(120),
  filter: filterPayloadSchema,
  isDefault: z.boolean().optional(),
});

export const savedViewPatchSchema = savedViewBodySchema.partial();

export type ConditionRowInput = z.infer<typeof conditionRowSchema>;
export type FilterPayloadInput = z.infer<typeof filterPayloadSchema>;
export type LeadFilterRequest = z.infer<typeof leadFilterRequestSchema>;
export type SavedViewBody = z.infer<typeof savedViewBodySchema>;
