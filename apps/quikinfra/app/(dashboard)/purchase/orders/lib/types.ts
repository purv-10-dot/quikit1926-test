/**
 * Shared types for the Purchase Orders page.
 *
 * Extracted verbatim from orders/page.tsx as part of the god-file
 * decomposition. Pure type declarations — no runtime code.
 */

export interface TermRow {
  id: string;
  status?: string;
  applicableTo?: string;
  title?: string;
  body?: string;
  isDefault?: boolean;
}

/** Indent / RFQ source line consumed by the autofill onChange handlers. */
export interface SourceLine {
  id?: string;
  lineId?: string;
  itemId?: string | null;
  itemCode?: string | null;
  itemName?: string | null;
  uomCode?: string | null;
  quantity?: number | string | null;
  qtyRequested?: number | string | null;
  qtyOpen?: number | string | null;
  standardRate?: number | string | null;
  unitRate?: number | string | null;
  gstRate?: number | string | null;
  sourceIndentLineId?: string | null;
}

export interface RfqVendorLike {
  vendorId?: string;
  quotedRates?: Array<{ lineId?: string; rate?: string | number }>;
}

export interface RfqLike {
  vendors?: RfqVendorLike[];
}

/** Source-doc lookups consumed by the autofill onChange handlers. */
export interface OrderIndentNode {
  id?: string; projectId?: string; requiredDate?: string; lines?: SourceLine[];
}
export interface OrderRfqNode {
  id?: string; projectId?: string; rfqNumber?: string; dueDate?: string;
  sourceIndentId?: string; lines?: SourceLine[]; vendors?: RfqVendorLike[];
}

export interface PoRow {
  [key: string]: unknown;
  id: string;
  poNumber?: string;
  isUrgentLocal?: boolean;
  sourceRfqNumber?: string;
  sourceRfqId?: string;
  sourceIndentNumber?: string;
  sourceIndentId?: string;
  vendorName?: string;
  vendorPhone?: string | null;
  vendorId?: string | null;
  projectName?: string;
  poDate?: string;
  deliveryDate?: string;
  isOverdue?: boolean;
  totalAmount?: number | string;
  status?: string;
}