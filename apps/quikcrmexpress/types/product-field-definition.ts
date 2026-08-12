/**
 * Product field definitions — stored on QceOrgWorkspaceSettings.settings.productFieldDefinitions.
 * Values live on QceProduct.dynamicFields.
 */

export type ProductFieldType =
  | "Text"
  | "TextArea"
  | "Number"
  | "Email"
  | "Phone"
  | "Date"
  | "Boolean"
  | "Select"
  | "MultiSelect";

export type ProductFieldRequirement = "Required" | "Optional" | "System";

export interface ProductFieldDefinition {
  key: string;
  label: string;
  fieldType: ProductFieldType;
  requirement: ProductFieldRequirement;
  visible: boolean;
  defaultValue?: string | number | boolean | null;
  helpText?: string | null;
  options?: string[];
  isStandard?: boolean;
  showInList?: boolean;
}

export const STANDARD_PRODUCT_FIELDS: ProductFieldDefinition[] = [
  { key: "name", label: "Product name", fieldType: "Text", requirement: "Required", visible: true, isStandard: true, showInList: true },
  { key: "sku", label: "SKU", fieldType: "Text", requirement: "Required", visible: true, isStandard: true, showInList: true },
  { key: "barcode", label: "Barcode", fieldType: "Text", requirement: "Optional", visible: true, isStandard: true },
  { key: "hsnCode", label: "HSN code", fieldType: "Text", requirement: "Optional", visible: true, isStandard: true },
  { key: "sacCode", label: "SAC code", fieldType: "Text", requirement: "Optional", visible: true, isStandard: true },
  { key: "gstRate", label: "GST %", fieldType: "Number", requirement: "Required", visible: true, isStandard: true, showInList: true },
  { key: "listPrice", label: "List price", fieldType: "Number", requirement: "Required", visible: true, isStandard: true, showInList: true },
  { key: "manufacturer", label: "Manufacturer", fieldType: "Text", requirement: "Optional", visible: true, isStandard: true },
  { key: "warrantyMonths", label: "Warranty (months)", fieldType: "Number", requirement: "Optional", visible: true, isStandard: true },
];

export const STANDARD_PRODUCT_KEYS = new Set(STANDARD_PRODUCT_FIELDS.map((f) => f.key));

export function isValidProductFieldKey(key: string): boolean {
  return /^[a-z][a-zA-Z0-9_]{0,40}$/.test(key);
}
