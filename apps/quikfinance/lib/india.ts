import { z } from "zod";

export const INDIAN_STATE_OPTIONS = [
  { label: "Andaman and Nicobar Islands", value: "35" },
  { label: "Andhra Pradesh", value: "37" },
  { label: "Arunachal Pradesh", value: "12" },
  { label: "Assam", value: "18" },
  { label: "Bihar", value: "10" },
  { label: "Chandigarh", value: "04" },
  { label: "Chhattisgarh", value: "22" },
  { label: "Dadra and Nagar Haveli and Daman and Diu", value: "26" },
  { label: "Delhi", value: "07" },
  { label: "Goa", value: "30" },
  { label: "Gujarat", value: "24" },
  { label: "Haryana", value: "06" },
  { label: "Himachal Pradesh", value: "02" },
  { label: "Jammu and Kashmir", value: "01" },
  { label: "Jharkhand", value: "20" },
  { label: "Karnataka", value: "29" },
  { label: "Kerala", value: "32" },
  { label: "Ladakh", value: "38" },
  { label: "Lakshadweep", value: "31" },
  { label: "Madhya Pradesh", value: "23" },
  { label: "Maharashtra", value: "27" },
  { label: "Manipur", value: "14" },
  { label: "Meghalaya", value: "17" },
  { label: "Mizoram", value: "15" },
  { label: "Nagaland", value: "13" },
  { label: "Odisha", value: "21" },
  { label: "Other Territory", value: "97" },
  { label: "Puducherry", value: "34" },
  { label: "Punjab", value: "03" },
  { label: "Rajasthan", value: "08" },
  { label: "Sikkim", value: "11" },
  { label: "Tamil Nadu", value: "33" },
  { label: "Telangana", value: "36" },
  { label: "Tripura", value: "16" },
  { label: "Uttar Pradesh", value: "09" },
  { label: "Uttarakhand", value: "05" },
  { label: "West Bengal", value: "19" }
] as const;

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GST_CHECK_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function normalizeIndiaCode(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase();
}

function gstCharValue(character: string) {
  return GST_CHECK_CHARS.indexOf(character);
}

export function isValidPan(value: string | null | undefined) {
  const pan = normalizeIndiaCode(value);
  return pan.length === 0 || PAN_PATTERN.test(pan);
}

export function computeGstinCheckDigit(gstinWithoutCheckDigit: string) {
  let factor = 2;
  let sum = 0;
  const digits = gstinWithoutCheckDigit.split("").reverse();

  for (const character of digits) {
    const codePoint = gstCharValue(character);
    if (codePoint < 0) {
      return null;
    }

    const product = codePoint * factor;
    sum += Math.floor(product / 36) + (product % 36);
    factor = factor === 2 ? 1 : 2;
  }

  const remainder = sum % 36;
  const checkCodePoint = (36 - remainder) % 36;
  return GST_CHECK_CHARS[checkCodePoint] ?? null;
}

export function isValidGstin(value: string | null | undefined) {
  const gstin = normalizeIndiaCode(value);
  if (gstin.length === 0) {
    return true;
  }
  if (!GSTIN_PATTERN.test(gstin)) {
    return false;
  }

  const expected = computeGstinCheckDigit(gstin.slice(0, -1));
  return expected === gstin.slice(-1);
}

export function inferStateCodeFromGstin(value: string | null | undefined) {
  const gstin = normalizeIndiaCode(value);
  return gstin.length >= 2 ? gstin.slice(0, 2) : null;
}

export function resolveGstSplit(params: {
  taxableValue: number;
  taxAmount: number;
  companyStateCode?: string | null;
  placeOfSupply?: string | null;
}) {
  const companyStateCode = normalizeIndiaCode(params.companyStateCode);
  const placeOfSupply = normalizeIndiaCode(params.placeOfSupply);

  if (params.taxAmount <= 0) {
    return { cgst: 0, sgst: 0, igst: 0 };
  }

  if (companyStateCode && placeOfSupply && companyStateCode !== placeOfSupply) {
    return { cgst: 0, sgst: 0, igst: Number(params.taxAmount.toFixed(2)) };
  }

  const half = Number((params.taxAmount / 2).toFixed(2));
  return {
    cgst: half,
    sgst: Number((params.taxAmount - half).toFixed(2)),
    igst: 0
  };
}

export const gstinSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => isValidGstin(value), "Enter a valid GSTIN with the correct check digit.");

export const optionalGstinSchema = z
  .union([gstinSchema, z.literal("")])
  .optional()
  .nullable()
  .transform((value) => {
    const normalized = normalizeIndiaCode(value);
    return normalized.length > 0 ? normalized : null;
  });

export const panSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => isValidPan(value), "Enter a valid PAN.");

export const optionalPanSchema = z
  .union([panSchema, z.literal("")])
  .optional()
  .nullable()
  .transform((value) => {
    const normalized = normalizeIndiaCode(value);
    return normalized.length > 0 ? normalized : null;
  });

export const stateCodeSchema = z
  .string()
  .trim()
  .refine((value) => INDIAN_STATE_OPTIONS.some((option) => option.value === value), "Choose a valid Indian state code.");

export const optionalStateCodeSchema = z
  .union([stateCodeSchema, z.literal("")])
  .optional()
  .nullable()
  .transform((value) => {
    const normalized = (value ?? "").trim();
    return normalized.length > 0 ? normalized : null;
  });
