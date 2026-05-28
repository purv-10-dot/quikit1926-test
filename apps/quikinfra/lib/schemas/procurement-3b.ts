import { z } from "zod";

// Purchase Indent
export const indentLineSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().positive(),
  uomId: z.string().min(1),
  estimatedRate: z.number().min(0).optional().nullable(),
  remarks: z.string().optional().nullable(),
});
export const indentCreateSchema = z.object({
  indentNumber: z.string().min(1).max(50),
  prId: z.string().optional().nullable(),
  projectId: z.string().min(1),
  requestedById: z.string().min(1),
  requestDate: z.string().min(1),
  requiredDate: z.string().optional().nullable(),
  purpose: z.string().optional().nullable(),
  lines: z.array(indentLineSchema).min(1),
});
export type IndentCreateInput = z.infer<typeof indentCreateSchema>;

// RFQ
export const rfqLineSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().positive(),
  uomId: z.string().min(1),
  specification: z.string().optional().nullable(),
});
export const rfqCreateSchema = z.object({
  rfqNumber: z.string().min(1).max(50),
  indentId: z.string().optional().nullable(),
  projectId: z.string().min(1),
  rfqDate: z.string().min(1),
  closingDate: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  lines: z.array(rfqLineSchema).min(1),
  vendorIds: z.array(z.string()).min(1),
});
export type RfqCreateInput = z.infer<typeof rfqCreateSchema>;

// Gate Pass
export const gatePassCreateSchema = z.object({
  gatePassNumber: z.string().min(1).max(50),
  projectId: z.string().min(1),
  locationId: z.string().min(1),
  type: z.enum(["inward", "outward", "returnable", "non_returnable"]),
  referenceType: z.string().optional().nullable(),
  referenceId: z.string().optional().nullable(),
  referenceNumber: z.string().optional().nullable(),
  vehicleNo: z.string().optional().nullable(),
  driverName: z.string().optional().nullable(),
  driverPhone: z.string().optional().nullable(),
  purpose: z.string().optional().nullable(),
  gatePassDate: z.string().min(1),
});
export type GatePassCreateInput = z.infer<typeof gatePassCreateSchema>;

// Good Return
export const goodReturnLineSchema = z.object({
  itemId: z.string().min(1),
  returnQty: z.number().positive(),
  uomId: z.string().min(1),
  unitRate: z.number().min(0),
  remarks: z.string().optional().nullable(),
});
export const goodReturnCreateSchema = z.object({
  returnNumber: z.string().min(1).max(50),
  grnId: z.string().min(1),
  projectId: z.string().min(1),
  vendorId: z.string().min(1),
  locationId: z.string().min(1),
  returnDate: z.string().min(1),
  reason: z.string().optional().nullable(),
  lines: z.array(goodReturnLineSchema).min(1),
});
export type GoodReturnCreateInput = z.infer<typeof goodReturnCreateSchema>;

// Internal Return
export const internalReturnLineSchema = z.object({
  itemId: z.string().min(1),
  returnQty: z.number().positive(),
  uomId: z.string().min(1),
  unitRate: z.number().min(0),
  remarks: z.string().optional().nullable(),
});
export const internalReturnCreateSchema = z.object({
  returnNumber: z.string().min(1).max(50),
  issueId: z.string().min(1),
  projectId: z.string().min(1),
  locationId: z.string().min(1),
  returnDate: z.string().min(1),
  returnedBy: z.string().min(1),
  reason: z.string().optional().nullable(),
  lines: z.array(internalReturnLineSchema).min(1),
});
export type InternalReturnCreateInput = z.infer<typeof internalReturnCreateSchema>;

// Stock Transfer
export const transferLineSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().positive(),
  uomId: z.string().min(1),
  unitRate: z.number().min(0),
  remarks: z.string().optional().nullable(),
});
export const transferCreateSchema = z
  .object({
    transferNumber: z.string().min(1).max(50),
    projectId: z.string().min(1),
    fromLocationId: z.string().min(1),
    toLocationId: z.string().min(1),
    transferDate: z.string().min(1),
    reason: z.string().optional().nullable(),
    lines: z.array(transferLineSchema).min(1),
  })
  .refine((d) => d.fromLocationId !== d.toLocationId, {
    message: "Source and destination locations must differ",
    path: ["toLocationId"],
  });
export type TransferCreateInput = z.infer<typeof transferCreateSchema>;

// Reconciliation
export const reconLineSchema = z.object({
  itemId: z.string().min(1),
  systemQty: z.number(),
  physicalQty: z.number(),
  uomId: z.string().min(1),
  unitRate: z.number().min(0),
  remarks: z.string().optional().nullable(),
});
export const reconCreateSchema = z.object({
  reconciliationNumber: z.string().min(1).max(50),
  projectId: z.string().min(1),
  locationId: z.string().min(1),
  reconciliationDate: z.string().min(1),
  reason: z.string().optional().nullable(),
  lines: z.array(reconLineSchema).min(1),
});
export type ReconCreateInput = z.infer<typeof reconCreateSchema>;

// Diesel Log
export const dieselCreateSchema = z.object({
  logNumber: z.string().min(1).max(50),
  projectId: z.string().min(1),
  locationId: z.string().min(1),
  logDate: z.string().min(1),
  machineryId: z.string().optional().nullable(),
  driverName: z.string().optional().nullable(),
  vehicleNo: z.string().optional().nullable(),
  fuelQty: z.number().positive(),
  unitRate: z.number().min(0).optional().nullable(),
  amount: z.number().min(0).optional().nullable(),
  openingReading: z.number().min(0).optional().nullable(),
  closingReading: z.number().min(0).optional().nullable(),
  remarks: z.string().optional().nullable(),
});
export type DieselCreateInput = z.infer<typeof dieselCreateSchema>;
