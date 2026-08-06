/**
 * Constants, config maps, and row factories for the BOQ Import drawer.
 *
 * Extracted verbatim from BOQImportDrawer.tsx as part of the god-file
 * decomposition.
 */

import type {
  ImportMode,
  UniversalField,
  UniversalGroup,
} from "./types";

export const UNIVERSAL_FIELD_LABELS: Record<UniversalField, string> = {
  boq_number: "BOQ No.",
  description: "Description",
  unit: "Unit",
  rate: "Rate",
  qty_tender: "Tender Qty",
  qty_scope: "Scope Qty",
  qty_subco: "Sub-Co Qty",
  qty_self: "Self Qty",
  amt_estimated: "Estimated Amount",
  amt_billed: "Billed Amount",
  IGNORE: "— Ignore —",
};

export const UNIVERSAL_FIELD_OPTIONS: UniversalField[] = [
  "boq_number",
  "description",
  "unit",
  "rate",
  "qty_tender",
  "qty_scope",
  "qty_subco",
  "qty_self",
  "amt_estimated",
  "amt_billed",
  "IGNORE",
];

export const FIELD_GROUP: Record<Exclude<UniversalField, "IGNORE">, UniversalGroup> = {
  boq_number: "Identity",
  description: "Identity",
  unit: "Identity",
  rate: "Quantities",
  qty_tender: "Quantities",
  qty_scope: "Quantities",
  qty_subco: "Quantities",
  qty_self: "Quantities",
  amt_estimated: "Amounts",
  amt_billed: "Amounts",
};


export const GROUP_DOT_COLOR: Record<UniversalGroup, string> = {
  Identity: "bg-orange-500",
  Quantities: "bg-green-500",
  Amounts: "bg-amber-500",
};

// description is the only required field (Column Mapper Spec §1.2).
export const REQUIRED_FIELDS: UniversalField[] = ["description"];

export const MODE_LABEL: Record<ImportMode, string> = {
  AUTO: "Auto Detect",
  STRICT_TEMPLATE: "QuikInfra Template",
  GENERIC_SOR: "Generic SOR BOQ",
  ALPHABETIC_SOR: "Alphabetic SOR",
  UNIVERSAL: "Custom Mapping",
};

export const MODE_HINT: Record<ImportMode, string> = {
  AUTO: "Server sniffs the workbook and picks the right format.",
  STRICT_TEMPLATE: "6 columns: BOQ No · SOR No · Description · Unit · Rate · Op. Undone Qty",
  GENERIC_SOR: "9 columns: S.No · SOR Item · Sub Item · Item Name · Description · Unit · Qty · Rate · Amount",
  ALPHABETIC_SOR: "Alphabetic numbering — I/NO. · SOR Numbers · Description · Total Qty · Unit (A.1 · A.2.2.1 · a. · b.)",
  UNIVERSAL: "Any format — you pick which column is which. No fixed structure required.",
};

// A 403 from any BOQ upload/import endpoint means the user's role lacks the
// `construction.boq.import` permission — surface a clear message instead of
// the generic "Forbidden" the auth layer returns.
export const NO_IMPORT_PERMISSION_MSG =
  "You don't have permission to import the BOQ. Please contact your administrator.";