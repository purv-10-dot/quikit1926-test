import { z } from "zod";

// Strings without anchors so we can use .source inside HTML pattern attributes
// (HTML pattern attribute applies ^ and $ implicitly).
export const PAN_PATTERN = "[A-Z]{5}[0-9]{4}[A-Z]";
export const TAN_PATTERN = "[A-Z]{4}[0-9]{5}[A-Z]";
export const GSTIN_PATTERN = "[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]";
export const CIN_PATTERN = "[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}";
export const AADHAAR_PATTERN = "[2-9][0-9]{11}";
// EPF Member ID:
//   Region(2 letters) + Office(3 letters) + Establishment(7 digits) + Extension(3 digits) + Member(7 digits)
// Two accepted formats:
//   Slashed:   MH/BAN/0000016/000/0000134
//   Compact:   MHBAN000001600000000134   (22 chars)
export const EPF_PATTERN = "(?:[A-Z]{2}/[A-Z]{3}/[0-9]{7}/[0-9]{3}/[0-9]{7}|[A-Z]{2}[A-Z]{3}[0-9]{7}[0-9]{3}[0-9]{7})";
// ESI Employer Code: 17 digits. Either compact (17 digits) or grouped 2-2-6-3-4 with hyphens — no mixing.
export const ESI_PATTERN = "(?:[0-9]{17}|[0-9]{2}-[0-9]{2}-[0-9]{6}-[0-9]{3}-[0-9]{4})";

export const PAN_REGEX = new RegExp(`^${PAN_PATTERN}$`);
export const TAN_REGEX = new RegExp(`^${TAN_PATTERN}$`);
export const GSTIN_REGEX = new RegExp(`^${GSTIN_PATTERN}$`);
export const CIN_REGEX = new RegExp(`^${CIN_PATTERN}$`);
export const AADHAAR_REGEX = new RegExp(`^${AADHAAR_PATTERN}$`);
export const EPF_REGEX = new RegExp(`^${EPF_PATTERN}$`);
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

export const zPan = z
  .string()
  .regex(PAN_REGEX, "Invalid PAN — must be 5 letters + 4 digits + 1 letter");
export const zTan = z
  .string()
  .regex(TAN_REGEX, "Invalid TAN — must be 4 letters + 5 digits + 1 letter");
export const zGstin = z
  .string()
  .regex(GSTIN_REGEX, "Invalid GSTIN — must be 15 chars in correct format");
export const zCin = z
  .string()
  .regex(CIN_REGEX, "Invalid CIN — must be 21 chars in correct format");
export const zAadhaar = z
  .string()
  .regex(AADHAAR_REGEX, "Invalid Aadhaar — must be 12 digits starting with 2-9");
export const zEpfEstablishmentId = z
  .string()
  .regex(EPF_REGEX, "Invalid EPF Member ID — format: Region(2) + Office(3) + Establishment(7) + Extension(3) + Member(7). e.g. MH/BAN/0000016/000/0000134");
export const zEsiEmployerCode = z
  .string()
  .regex(ESI_REGEX, "Invalid ESI Employer Code — must be 17 digits");
