import { z } from "zod";

// BOQ — nested items (parent can be a group)
export const boqItemSchema = z.object({
  parentId: z.string().optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
  kind: z.enum(["item", "group"]).default("item"),
  code: z.string().optional().nullable(),
  description: z.string().min(1).max(500),
  itemId: z.string().optional().nullable(),
  uomId: z.string().optional().nullable(),
  quantity: z.number().positive().optional().nullable(),
  rate: z.number().min(0).optional().nullable(),
  gstRate: z.number().min(0).max(100).optional().nullable(),
});
export type BoqItemInput = z.infer<typeof boqItemSchema>;

export const boqCreateSchema = z.object({
  boqNumber: z.string().min(1).max(50),
  projectId: z.string().min(1),
  boqDate: z.string().min(1),
  currency: z.string().default("INR"),
  remarks: z.string().optional().nullable(),
  items: z.array(boqItemSchema).min(1),
});
export type BoqCreateInput = z.infer<typeof boqCreateSchema>;

// DPR
export const dprLineSchema = z.object({
  boqItemId: z.string().optional().nullable(),
  activity: z.string().min(1).max(500),
  quantityDone: z.number().min(0),
  uomId: z.string().optional().nullable(),
  labourCount: z.number().int().min(0).optional().nullable(),
  labourHours: z.number().min(0).optional().nullable(),
  machineryUsed: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
});
export type DprLineInput = z.infer<typeof dprLineSchema>;

export const dprCreateSchema = z.object({
  projectId: z.string().min(1),
  dprDate: z.string().min(1),
  weather: z.string().optional().nullable(),
  reportedById: z.string().min(1),
  remarks: z.string().optional().nullable(),
  lines: z.array(dprLineSchema).min(1),
});
export type DprCreateInput = z.infer<typeof dprCreateSchema>;

// Hindrance
export const hindranceCreateSchema = z
  .object({
    projectId: z.string().min(1),
    hindranceDate: z.string().min(1),
    category: z.enum([
      "weather", "permit", "material_shortage", "design_change",
      "labour", "equipment", "external", "other",
    ]),
    title: z.string().min(1).max(200),
    description: z.string().optional().nullable(),
    startDate: z.string().min(1),
    endDate: z.string().optional().nullable(),
  })
  .refine((d) => !d.endDate || new Date(d.endDate) >= new Date(d.startDate), {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });
export type HindranceCreateInput = z.infer<typeof hindranceCreateSchema>;
