import { z } from "zod";

// Strings without anchors so we can use .source inside HTML pattern attributes
// (HTML pattern attribute applies ^ and $ implicitly).
export const PAN_PATTERN = "[A-Z]{5}[0-9]{4}[A-Z]";
export const TAN_PATTERN = "[A-Z]{4}[0-9]{5}[A-Z]";
export const GSTIN_PATTERN = "[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]";
export const CIN_PATTERN = "[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}";
const AADHAAR_PATTERN = "[2-9][0-9]{11}";
// ESI Employer Code: 17 digits. Either compact (17 digits) or grouped 2-2-6-3-4 with hyphens — no mixing.
export const ESI_PATTERN = "(?:[0-9]{17}|[0-9]{2}-[0-9]{2}-[0-9]{6}-[0-9]{3}-[0-9]{4})";

export const PAN_REGEX = new RegExp(`^${PAN_PATTERN}$`);
export const TAN_REGEX = new RegExp(`^${TAN_PATTERN}$`);
export const GSTIN_REGEX = new RegExp(`^${GSTIN_PATTERN}$`);
export const CIN_REGEX = new RegExp(`^${CIN_PATTERN}$`);
export const AADHAAR_REGEX = new RegExp(`^${AADHAAR_PATTERN}$`);
export const ESI_REGEX = new RegExp(`^${ESI_PATTERN}$`);

export const ID_TITLES = {
  pan: "PAN format: 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F)",
  tan: "TAN format: 4 letters + 5 digits + 1 letter (e.g. ABCD12345E)",
  gstin: "GSTIN format: 15 chars — 2 digits + PAN + entity-no + Z + check (e.g. 27ABCDE1234F1Z5)",
  cin: "CIN format: 21 chars (e.g. U72200KA2010PTC012345)",
  aadhaar: "Aadhaar format: 12 digits, first digit 2-9",
  epf: "EPF Member ID: Region(2) + Office(3) + Establishment(7) + Extension(3) + Member(7). e.g. MH/BAN/0000016/000/0000134 or MHBAN000001600000000134",
  esi: "ESI Employer Code format: 17 digits, e.g. 00-00-000000-000-0000",
} as const;

const zPan = z
  .string()
  .regex(PAN_REGEX, "Invalid PAN — must be 5 letters + 4 digits + 1 letter");
const zAadhaar = z
  .string()
  .regex(AADHAAR_REGEX, "Invalid Aadhaar — must be 12 digits starting with 2-9");

// ─── Contact & common field validators (shared across all HRMS forms) ───────

// Indian mobile: 10 digits starting 6-9, with an optional +91 / 0 prefix.
export const PHONE_REGEX = /^(?:\+91[- ]?|0)?[6-9]\d{9}$/;
// Loose phone (mobile OR landline): 7–15 digits, optional +, spaces/hyphens allowed.
export const PHONE_LOOSE_REGEX = /^\+?[0-9][0-9\s-]{6,15}$/;
export const PINCODE_REGEX = /^[1-9][0-9]{5}$/;      // Indian PIN — 6 digits, no leading 0
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;  // 4 letters + 0 + 6 alphanumerics
export const BANK_ACCOUNT_REGEX = /^[0-9]{9,18}$/;   // 9–18 digits

/** Treat empty string / null as "not provided" so optional fields don't fail. */
const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

/** Required 10-digit Indian mobile. */
export const zPhone = z.string().regex(PHONE_REGEX, "Enter a valid 10-digit mobile number");
/** Optional 10-digit Indian mobile (blank allowed). */
export const zPhoneOptional = z.preprocess(emptyToUndefined, zPhone.optional());
/** Optional mobile-or-landline number (blank allowed). */
export const zPhoneLooseOptional = z.preprocess(
  emptyToUndefined,
  z.string().regex(PHONE_LOOSE_REGEX, "Enter a valid phone number").optional(),
);

const zIfsc = z.string().regex(IFSC_REGEX, "Invalid IFSC — 4 letters + 0 + 6 chars (e.g. HDFC0001234)");
export const zIfscOptional = z.preprocess(emptyToUndefined, zIfsc.optional());

export const zBankAccount = z.string().regex(BANK_ACCOUNT_REGEX, "Account number must be 9–18 digits");

// Optional (blank-allowed) variants of the statutory IDs.
export const zPanOptional = z.preprocess(emptyToUndefined, zPan.optional());
export const zAadhaarOptional = z.preprocess(emptyToUndefined, zAadhaar.optional());
