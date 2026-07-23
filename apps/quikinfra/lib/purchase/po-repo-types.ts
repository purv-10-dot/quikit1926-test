/** Input DTO types for the PO repository. Extracted from po-repository.ts. */

export interface POLineInput {
  indentLineId?: string | null;
  itemId: string;
  itemCode?: string | null;
  itemName?: string | null;
  uomId?: string | null;
  uomCode?: string | null;
  hsnCode?: string | null;
  specification?: string | null;
  poQty: string | number;
  unitRate: string | number;
  discount?: string | number | null;
  gstRate?: string | number | null;
  gstType?: string | null;
  igstAmount?: string | number | null;
  cgstAmount?: string | number | null;
  sgstAmount?: string | number | null;
  amount?: string | number | null;
  taxAmount?: string | number | null;
  totalAmount?: string | number | null;
  deliveryDate?: string | Date | null;
  remarks?: string | null;
  isRCM?: boolean;
}

export interface CreatePOInput {
  orgId: string;
  createdBy: string;
  poNumber: string;
  projectId: string;
  vendorId: string;
  indentId?: string | null;
  rfqId?: string | null;
  poDate: Date;
  deliveryDate?: Date | null;
  deliveryLocationId?: string | null;
  deliveryAddress?: string | null;
  paymentTermsDays?: number | null;
  termsConditionId?: string | null;
  termsAndConditions?: string | null;
  remarks?: string | null;
  isUrgentLocal?: boolean;
  urgentLocalReason?: string | null;
  /** Subject / "Supply For" printed on the PDF. */
  purpose?: string | null;
  /** Extra header-level charges (non-freight). */
  otherCharges?: string | number | null;
  /** Buyer-side contact(s). Comma-separated string (already joined
      upstream from the multi-row contacts section). */
  contactPerson?: string | null;
  contactMobile?: string | null;
  subtotal: string | number;
  freightCharges?: string | number | null;
  taxAmount: string | number;
  totalIGST?: string | number | null;
  totalCGST?: string | number | null;
  totalSGST?: string | number | null;
  totalAmount: string | number;
  status?: string;
  lines: POLineInput[];
}
