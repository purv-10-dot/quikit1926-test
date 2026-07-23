import type { SourceDocType } from "@/components/SourceDocPeekModal";

export interface RfqVendor {
  id: string;
  vendorId?: string;
  vendorName: string;
  email?: string;
  quotedRates?: Array<{ lineId: string; rate: string; remarks?: string }>;
}

export interface RfqLine {
  id?: string;
  lineId?: string;
  itemId?: string;
  itemName?: string;
  itemCode?: string;
  quantity?: number | string;
  uomCode?: string;
}

export interface RfqRow {
  [key: string]: unknown;
  id: string;
  rfqNumber?: string;
  sourceIndentNumber?: string;
  sourceIndentId?: string;
  projectName?: string;
  dueDate?: string;
  lineCount?: number;
  status?: string;
  vendors?: RfqVendor[];
  lines?: RfqLine[];
}

export interface TermRow {
  id: string;
  status?: string;
  applicableTo?: string;
  title?: string;
  body?: string;
  isDefault?: boolean;
}

export interface ProjectRow {
  id: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface ItemRow {
  id: string;
  name?: string;
  code?: string;
  uomCode?: string;
  groupId?: string;
  groupName?: string;
}

export interface PeekTarget {
  type: SourceDocType;
  id: string;
}

export interface AddQuoteCtx {
  rfqId: string;
  rfqNumber: string;
  vendors: RfqVendor[];
  lines: RfqLine[];
  initialVendorRowId?: string;
}

export interface CompareCtx {
  rfqId: string;
  rfqNumber: string;
  projectName: string;
  vendors: RfqVendor[];
  lines: RfqLine[];
}

export interface IndentLine {
  id?: string;
  lineId?: string;
  itemId?: string;
  itemCode?: string;
  itemName?: string;
  qtyRequested?: number | string;
  indentedQty?: number | string;
  quantity?: number | string;
  uomCode?: string;
}
