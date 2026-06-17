import { parsePhoneNumberFromString } from "libphonenumber-js";

/** Strip everything except digits. */
export function digitsOnly(input: string): string {
  return input.replace(/\D+/g, "");
}

/** Normalize to E.164 if possible, otherwise return digits-only. */
export function normalizePhone(input: string, defaultCountry?: "IN" | "US"): string {
  if (!input) return "";
  try {
    const parsed = parsePhoneNumberFromString(input, defaultCountry);
    if (parsed?.isValid()) return parsed.number;
  } catch {
    /* fallthrough */
  }
  return digitsOnly(input);
}

export function maskDigits(input: string): string {
  return input.replace(/\d{7,}/g, (m) => `${m.slice(0, 2)}…${m.slice(-2)}`);
}
