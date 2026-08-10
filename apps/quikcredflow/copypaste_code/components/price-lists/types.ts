export interface PriceListRow {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  isActive: boolean;
  isDefault: boolean;
  regionCode: string | null;
  customerTier: string | null;
  itemsCount: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PriceListItemRow {
  id: string;
  productId: string;
  unitPrice: number;
  discountPct: number;
  minQuantity: number;
  floorPrice: number | null;
  notes: string | null;
  product: {
    id: string;
    name: string;
    sku: string;
    listPrice: number;
    gstRate: number;
  } | null;
}

export interface PriceListDetail {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  isActive: boolean;
  isDefault: boolean;
  regionCode: string | null;
  customerTier: string | null;
  versionNumber: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
  items: PriceListItemRow[];
}

export interface AuditEntry {
  id: string;
  action: string;
  summary: string;
  userName: string | null;
  createdAt: string;
}
