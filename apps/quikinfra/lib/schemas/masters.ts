import { z } from "zod";

/**
 * Validation schemas for Masters module (Phase 0.5 pilot).
 * Models live in packages/database/prisma/schema.prisma (CnCompany, CnVendor).
 */

export const companyCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  legalName: z.string().min(1, "Legal name is required").max(200),
  gstin: z.string().min(15, "GSTIN must be 15 chars").max(15),
  pan: z.string().length(10, "PAN must be 10 chars"),
  cin: z.string().optional().nullable(),
  address: z.string().min(1).max(500),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  pincode: z.string().min(1).max(10),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("").transform(() => null)),
  website: z.string().url().optional().nullable().or(z.literal("").transform(() => null)),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type CompanyCreateInput = z.infer<typeof companyCreateSchema>;
export const companyUpdateSchema = companyCreateSchema.partial();

export const vendorCreateSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1).max(200),
  legalName: z.string().optional().nullable(),
  gstin: z.string().optional().nullable(),
  pan: z.string().optional().nullable(),
  contactPerson: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("").transform(() => null)),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  pincode: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  bankAccountNo: z.string().optional().nullable(),
  bankIfsc: z.string().optional().nullable(),
  paymentTermsDays: z.number().int().min(0).max(365).optional().nullable(),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  status: z.enum(["active", "inactive", "blacklisted"]).default("active"),
});
export type VendorCreateInput = z.infer<typeof vendorCreateSchema>;
export const vendorUpdateSchema = vendorCreateSchema.partial();

// ── Phase 2 master types (API-only for now; UI forms arrive next) ─────────

export const customerCreateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  contactPerson: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("").transform(() => null)),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  gstin: z.string().optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export const customerUpdateSchema = customerCreateSchema.partial();

export const contractorCreateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  legalName: z.string().optional().nullable(),
  gstin: z.string().optional().nullable(),
  pan: z.string().optional().nullable(),
  contactPerson: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("").transform(() => null)),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  licenseNo: z.string().optional().nullable(),
  specialization: z.string().optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type ContractorCreateInput = z.infer<typeof contractorCreateSchema>;
export const contractorUpdateSchema = contractorCreateSchema.partial();

export const uomCreateSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type UomCreateInput = z.infer<typeof uomCreateSchema>;
export const uomUpdateSchema = uomCreateSchema.partial();

export const itemGroupCreateSchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type ItemGroupCreateInput = z.infer<typeof itemGroupCreateSchema>;
export const itemGroupUpdateSchema = itemGroupCreateSchema.partial();

export const itemCreateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  groupId: z.string().min(1),
  uomId: z.string().min(1),
  hsnCode: z.string().optional().nullable(),
  gstRate: z.number().min(0).max(100).optional().nullable(),
  minStockLevel: z.number().min(0).optional().nullable(),
  reorderLevel: z.number().min(0).optional().nullable(),
  standardRate: z.number().min(0).optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type ItemCreateInput = z.infer<typeof itemCreateSchema>;
export const itemUpdateSchema = itemCreateSchema.partial();
