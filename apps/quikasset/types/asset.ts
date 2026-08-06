export type AssetStatus = "Available" | "Assigned" | "InRepair" | "Retired";

export type BaseCategory = {
  id: string;
  name: string;
  _count?: { categories?: number } | null;
};

export type Category = {
  id: string;
  name: string;
  baseCategoryId?: string;
  _count?: { assets?: number } | null;
};

export type AssetReplacement = {
  id: string;
  type: "Temporary" | "Permanent";
  isActive: boolean;
  endDate?: string | null;
};

export type Asset = {
  id: string;
  warehouse?: string | null;
  assetType: string;
  baseCategoryId: string;
  categoryId: string;
  itemName: string;
  itemCode: string;
  serialNumber: string;
  invoiceNumber: string;
  price?: number | null;
  purchaseDate: string;
  location: string;
  condition: string;
  warrantyEndDate?: string | null;
  description: string;
  invoiceFileKey?: string | null;
  invoiceFileName?: string | null;
  invoiceFileType?: string | null;
  invoiceFileSize?: number | null;
  assetStatus: AssetStatus;
  baseCategory?: BaseCategory | null;
  category?: Category | null;
  replacementsReceived?: AssetReplacement[] | null;
  /** Platform User.id of who added the asset; `addedByName` is the resolved name. */
  createdByUserId?: string | null;
  addedByName?: string | null;
  createdAt?: string;
  updatedAt?: string;
};
