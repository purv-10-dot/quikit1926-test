/**
 * Shared dependency contract for the PO form config builders.
 * All the page-derived data/handlers the field-group builders need.
 */

import type { QueryClient } from "@tanstack/react-query";
import type { ItemPickerItem } from "@/components/ItemPickerModal";
import type { SourceLine, OrderIndentNode, OrderRfqNode, RfqLike } from "./types";

export type Opt = { value: string; label: string; hint?: string; [k: string]: unknown };

export type ItemLike = {
  id: string;
  code?: string | null;
  name?: string | null;
  uomId?: string | null;
  uomCode?: string | null;
  groupId?: string | null;
  standardRate?: number | string | null;
  gstRate?: number | string | null;
  [k: string]: unknown;
};

export type VendorLike = {
  id: string;
  companyName?: string;
  name?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  [k: string]: unknown;
};

export interface PoFormConfigDeps {
  projectOptions: Opt[];
  vendorOptions: Opt[];
  locationOptions: Opt[];
  termsOptions: Opt[];
  sourceRfqOptions: Opt[];
  sourceIndentOptions: Opt[];
  itemGroups: Array<{ id: string; name: string; status?: string; itemCount?: number }>;
  readyRfqs: OrderRfqNode[];
  vendorById: Map<string, VendorLike>;
  termsById: Map<string, { title: string; body: string }>;
  indentById: Map<string, OrderIndentNode>;
  rfqById: Map<string, OrderRfqNode>;
  defaultPoTermsId: string;
  todayIso: string;
  prefill: {
    formData: Record<string, string>;
    lines: Record<string, unknown>[];
    secondaryLines: Record<string, unknown>[];
  } | null;
  qc: QueryClient;
  resolveItemId: (l: SourceLine | null | undefined) => string;
  pickRfqVendorAndRates: (rfq: RfqLike) => {
    vendorId: string | null;
    rateByLineKey: Map<string, string>;
  };
  setPickerCtx: (
    ctx: {
      items: ItemPickerItem[];
      selectedIds: string[];
      onSave: (ids: string[]) => void;
      vendorLabel: string;
    } | null,
  ) => void;
}
