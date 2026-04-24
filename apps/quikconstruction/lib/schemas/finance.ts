import { z } from "zod";

// ── Client Invoice ──────────────────────────────────────────────

export const invoiceLineSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive().optional().nullable(),
  uomId: z.string().optional().nullable(),
  rate: z.number().min(0).optional().nullable(),
  amount: z.number().min(0),
  gstRate: z.number().min(0).max(100).optional().nullable(),
  taxAmount: z.number().min(0).default(0),
  remarks: z.string().optional().nullable(),
});

export const invoiceCreateSchema = z.object({
  invoiceNumber: z.string().min(1).max(50),
  customerId: z.string().min(1),
  projectId: z.string().optional().nullable(),
  rabId: z.string().optional().nullable(),
  invoiceDate: z.string().min(1),
  dueDate: z.string().optional().nullable(),
  subtotal: z.number().min(0).default(0),
  taxAmount: z.number().min(0).default(0),
  cgstAmount: z.number().min(0).default(0),
  sgstAmount: z.number().min(0).default(0),
  igstAmount: z.number().min(0).default(0),
  placeOfSupply: z.string().optional().nullable(),
  total: z.number().min(0),
  remarks: z.string().optional().nullable(),
  lines: z.array(invoiceLineSchema).optional().default([]),
});
export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;

export const invoiceFromRabSchema = z.object({
  invoiceNumber: z.string().min(1).max(50),
  invoiceDate: z.string().min(1),
  dueDate: z.string().optional().nullable(),
});

// ── Client Receipt ──────────────────────────────────────────────

export const receiptAllocationSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().positive(),
});

export const receiptCreateSchema = z.object({
  receiptNumber: z.string().min(1).max(50),
  customerId: z.string().min(1),
  receiptDate: z.string().min(1),
  amount: z.number().positive(),
  mode: z.enum(["cash", "cheque", "bank", "upi", "other"]),
  reference: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  allocations: z.array(receiptAllocationSchema).default([]),
});
export type ReceiptCreateInput = z.infer<typeof receiptCreateSchema>;

// ── Vendor Bill ─────────────────────────────────────────────────

export const billLineSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive().optional().nullable(),
  uomId: z.string().optional().nullable(),
  rate: z.number().min(0).optional().nullable(),
  amount: z.number().min(0),
  gstRate: z.number().min(0).max(100).optional().nullable(),
  taxAmount: z.number().min(0).default(0),
  remarks: z.string().optional().nullable(),
});

export const billCreateSchema = z.object({
  billNumber: z.string().min(1).max(50),
  vendorId: z.string().min(1),
  projectId: z.string().optional().nullable(),
  grnId: z.string().optional().nullable(),
  poId: z.string().optional().nullable(),
  supplierInvoiceNo: z.string().optional().nullable(),
  supplierInvoiceDate: z.string().optional().nullable(),
  billDate: z.string().min(1),
  dueDate: z.string().optional().nullable(),
  subtotal: z.number().min(0).default(0),
  taxAmount: z.number().min(0).default(0),
  cgstAmount: z.number().min(0).default(0),
  sgstAmount: z.number().min(0).default(0),
  igstAmount: z.number().min(0).default(0),
  placeOfSupply: z.string().optional().nullable(),
  total: z.number().min(0),
  remarks: z.string().optional().nullable(),
  lines: z.array(billLineSchema).optional().default([]),
});
export type BillCreateInput = z.infer<typeof billCreateSchema>;

// Notes

export const creditNoteSchema = z.object({
  noteNumber: z.string().min(1).max(50),
  customerId: z.string().min(1),
  invoiceId: z.string().optional().nullable(),
  noteDate: z.string().min(1),
  amount: z.number().positive(),
  reason: z.string().min(1).max(300),
  remarks: z.string().optional().nullable(),
});

export const debitNoteSchema = z.object({
  noteNumber: z.string().min(1).max(50),
  vendorId: z.string().min(1),
  billId: z.string().optional().nullable(),
  noteDate: z.string().min(1),
  amount: z.number().positive(),
  reason: z.string().min(1).max(300),
  remarks: z.string().optional().nullable(),
});

export const billFromGrnSchema = z.object({
  billNumber: z.string().min(1).max(50),
  billDate: z.string().min(1),
  dueDate: z.string().optional().nullable(),
  supplierInvoiceNo: z.string().optional().nullable(),
  supplierInvoiceDate: z.string().optional().nullable(),
});

// ── Vendor Payment ──────────────────────────────────────────────

export const paymentAllocationSchema = z.object({
  billId: z.string().min(1),
  amount: z.number().positive(),
});

export const paymentCreateSchema = z.object({
  paymentNumber: z.string().min(1).max(50),
  vendorId: z.string().min(1),
  paymentDate: z.string().min(1),
  amount: z.number().positive(),
  mode: z.enum(["cash", "cheque", "bank", "upi", "other"]),
  reference: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  allocations: z.array(paymentAllocationSchema).default([]),
});
export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;
