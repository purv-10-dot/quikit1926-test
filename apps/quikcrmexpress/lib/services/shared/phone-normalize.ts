/**
 * Server-only phone normalization shared by leads and contacts (Level 0).
 *
 * Accepts messy user input ("7631957103", "98765 43210", "+1 212 555 1234"),
 * normalizes to E.164 via libphonenumber-js, and rejects genuinely-invalid
 * numbers with a caller-facing message. Bare (country-code-less) numbers are
 * interpreted using `defaultCountry`; input that already carries a country code
 * resolves to THAT country and is never re-prefixed.
 */
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/** Shown verbatim to the API caller on an unparseable / invalid number. */
const INVALID_PHONE_MESSAGE =
  "Not a valid phone number. For international numbers, include the country code (e.g. +1 …).";

export type PhoneNormalizeResult =
  | { ok: true; value: string | null }
  | { ok: false; message: string };

/**
 * Normalize `input` to E.164, or return an error.
 * - null / empty / undefined → { ok: true, value: null } (phone is optional).
 * - parses AND isValid()      → { ok: true, value: "<E.164>" }.
 * - unparseable / invalid     → { ok: false, message }.
 */
export function normalizePhoneOrError(
  input: string | null | undefined,
  defaultCountry: string,
): PhoneNormalizeResult {
  if (input == null) return { ok: true, value: null };
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, value: null };

  // parsePhoneNumberFromString never throws — it returns undefined on failure.
  // A number that already carries a country code ("+12125551234") resolves to
  // that country and ignores defaultCountry, so it is never +91-prefixed.
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry as CountryCode);
  if (!parsed || !parsed.isValid()) {
    return { ok: false, message: INVALID_PHONE_MESSAGE };
  }
  return { ok: true, value: parsed.number };
}
