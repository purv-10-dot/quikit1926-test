import { z } from "zod";

/**
 * Zod schemas for Phase 3 — Procurement + Store.
 * Multi-line documents: header + lines are validated together at create time.
 */

// ── Purchase Requisition ────────────────────────────────────────────

export const prLineSchema = z.object({
  itemId: z.string().min(1, "Item is required"),
  quantity: z.number().positive("Quantity must be > 0"),
  uomId: z.string().min(1, "UOM is required"),
  estimatedRate: z.number().min(0).optional().nullable(),
  estimatedAmount: z.number().min(0).optional().nullable(),
  specification: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
});
export type PrLineInput = z.infer<typeof prLineSchema>;

export const prCreateSchema = z.object({
  prNumber: z.string().min(1).max(50),
  projectId: z.string().min(1, "Project is required"),
  requestedById: z.string().min(1, "Requester is required"),
  requestDate: z.string().min(1),
  requiredDate: z.string().optional().nullable(),
  purpose: z.string().optional().nullable(),
  lines: z.array(prLineSchema).min(1, "At least one line is required"),
});
export type PrCreateInput = z.infer<typeof prCreateSchema>;

// ── Purchase Order ─────────────────────────────────────────────────

export const poLineSchema = z.object({
  itemId: z.string().min(1),
  orderedQty: z.number().positive(),
  unitRate: z.number().positive(),
  gstRate: z.number().min(0).max(100).optional().nullable(),
  uomId: z.string().min(1),
  deliveryDate: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
});
export type PoLineInput = z.infer<typeof poLineSchema>;

export const poCreateSchema = z.object({
  poNumber: z.string().min(1).max(50),
  projectId: z.string().min(1),
  vendorId: z.string().min(1),
  prId: z.string().optional().nullable(),
  poDate: z.string().min(1),
  deliveryDate: z.string().optional().nullable(),
  deliveryLocationId: z.string().optional().nullable(),
  paymentTermsDays: z.number().int().min(0).max(365).optional().nullable(),
  termsConditionId: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  lines: z.array(poLineSchema).min(1),
});
export type PoCreateInput = z.infer<typeof poCreateSchema>;

// ── GRN ────────────────────────────────────────────────────────────

export const grnLineSchema = z.object({
  poLineId: z.string().optional().nullable(),
  itemId: z.string().min(1),
  receivedQty: z.number().positive(),
  acceptedQty: z.number().min(0),
  rejectedQty: z.number().min(0).default(0),
  uomId: z.string().min(1),
  unitRate: z.number().min(0),
  qualityStatus: z.enum(["pending", "accepted", "rejected", "conditional"]).default("accepted"),
  batchNo: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
});
export type GrnLineInput = z.infer<typeof grnLineSchema>;

export const grnCreateSchema = z.object({
  grnNumber: z.string().min(1).max(50),
  poId: z.string().min(1),
  projectId: z.string().min(1),
  vendorId: z.string().min(1),
  grnDate: z.string().min(1),
  locationId: z.string().min(1),
  supplierInvoiceNo: z.string().optional().nullable(),
  supplierInvoiceDate: z.string().optional().nullable(),
  challanNo: z.string().optional().nullable(),
  challanDate: z.string().optional().nullable(),
  receivedById: z.string().min(1),
  inspectedById: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  lines: z.array(grnLineSchema).min(1),
});
export type GrnCreateInput = z.infer<typeof grnCreateSchema>;

// ── Material Issue ─────────────────────────────────────────────────

export const miLineSchema = z.object({
  itemId: z.string().min(1),
  issuedQty: z.number().positive(),
  uomId: z.string().min(1),
  unitRate: z.number().min(0),
  remarks: z.string().optional().nullable(),
});
export type MiLineInput = z.infer<typeof miLineSchema>;

export const miCreateSchema = z.object({
  issueNumber: z.string().min(1).max(50),
  projectId: z.string().min(1),
  locationId: z.string().min(1),
  issuedToId: z.string().min(1),
  issuedById: z.string().min(1),
  issueDate: z.string().min(1),
  purpose: z.string().optional().nullable(),
  lines: z.array(miLineSchema).min(1),
});
export type MiCreateInput = z.infer<typeof miCreateSchema>;
