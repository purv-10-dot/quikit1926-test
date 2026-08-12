/**
 * Light-weight E.164-ish phone normalisation.
 *
 * Rules (defaults to India / +91 when ambiguous):
 *   ""                  → ""
 *   "+91 9876 543 210"  → "+919876543210"
 *   "9876543210"        → "+919876543210"
 *   "09876543210"       → "+919876543210"
 *   "919876543210"      → "+919876543210"
 *   "+44 7700 900111"   → "+447700900111"
 *
 * If the input cannot be confidently normalised, return the digit-only
 * remainder prefixed with "+" — server-side validators still reject anything
 * that doesn't look E.164-shaped.
 */
export function normalisePhoneE164(raw: string | null | undefined): string {
  if (raw == null) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";

  if (hasPlus) {
    return "+" + digits;
  }

  // 10-digit local Indian number → +91 prefix.
  if (digits.length === 10) {
    return "+91" + digits;
  }

  // 11 digits starting with 0 (Indian STD prefix) → strip leading 0, +91 prefix.
  if (digits.length === 11 && digits.startsWith("0")) {
    return "+91" + digits.slice(1);
  }

  // 12 digits starting with 91 (e.g. paste-without-plus from WhatsApp) → +91 prefix
  // is already implied; just add the +.
  if (digits.length === 12 && digits.startsWith("91")) {
    return "+" + digits;
  }

  // Fallback: best-effort.
  return "+" + digits;
}
