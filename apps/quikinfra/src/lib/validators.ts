/**
 * QuikInfra — Production-grade validation utilities.
 *
 * Used by both frontend forms and backend API routes.
 * All validators return { valid: boolean, error?: string }.
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ─── Mobile (Indian 10-digit) ───────────────────────────────────────

export function validateMobile(value: string | undefined | null): ValidationResult {
  if (!value) return { valid: true }; // optional unless marked required
  const cleaned = value.replace(/[\s\-\+]/g, "");
  const normalized = cleaned.startsWith("91") && cleaned.length === 12 ? cleaned.slice(2) : cleaned;
  if (!/^\d{10}$/.test(normalized)) return { valid: false, error: "Mobile must be 10 digits (Indian format)" };
  if (!/^[6-9]/.test(normalized)) return { valid: false, error: "Indian mobile must start with 6, 7, 8, or 9" };
  return { valid: true };
}

export function normalizeMobile(value: string): string {
  const cleaned = value.replace(/[\s\-\+]/g, "");
  return cleaned.startsWith("91") && cleaned.length === 12 ? cleaned.slice(2) : cleaned;
}

// ─── Email ──────────────────────────────────────────────────────────

export function validateEmail(value: string | undefined | null): ValidationResult {
  if (!value) return { valid: true };
  const trimmed = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { valid: false, error: "Invalid email format" };
  return { valid: true };
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

// ─── GSTIN (Indian format with basic checksum) ──────────────────────

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function validateGSTIN(value: string | undefined | null): ValidationResult {
  if (!value) return { valid: true };
  const cleaned = value.trim().toUpperCase();
  if (cleaned.length !== 15) return { valid: false, error: "GSTIN must be exactly 15 characters" };
  if (!GSTIN_REGEX.test(cleaned)) return { valid: false, error: "Invalid GSTIN format. Expected: 22AAAAA0000A1Z5" };
  return { valid: true };
}

// ─── PAN ────────────────────────────────────────────────────────────

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

export function validatePAN(value: string | undefined | null): ValidationResult {
  if (!value) return { valid: true };
  const cleaned = value.trim().toUpperCase();
  if (cleaned.length !== 10) return { valid: false, error: "PAN must be exactly 10 characters" };
  if (!PAN_REGEX.test(cleaned)) return { valid: false, error: "Invalid PAN format. Expected: AAAAA0000A" };
  return { valid: true };
}

// ─── Project Code ───────────────────────────────────────────────────

export function validateProjectCode(value: string | undefined | null): ValidationResult {
  if (!value) return { valid: false, error: "Project code is required" };
  const cleaned = value.trim().toUpperCase();
  if (cleaned.length < 2 || cleaned.length > 10) return { valid: false, error: "Project code must be 2-10 characters" };
  if (!/^[A-Z0-9\-]+$/.test(cleaned)) return { valid: false, error: "Project code can only contain letters, numbers, and hyphens" };
  return { valid: true };
}

export function normalizeProjectCode(value: string): string {
  return value.trim().toUpperCase();
}

// ─── Required field ─────────────────────────────────────────────────

export function validateRequired(value: any, fieldName: string): ValidationResult {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) {
    return { valid: false, error: `${fieldName} is required` };
  }
  return { valid: true };
}

// ─── Positive number ────────────────────────────────────────────────

export function validatePositiveNumber(value: any, fieldName: string): ValidationResult {
  const n = Number(value);
  if (isNaN(n) || n < 0) return { valid: false, error: `${fieldName} must be a positive number` };
  return { valid: true };
}

// ─── Financial Year code ────────────────────────────────────────────

export function validateFYCode(value: string | undefined | null): ValidationResult {
  if (!value) return { valid: false, error: "Financial year label is required" };
  if (!/^FY\s*\d{4}-\d{2}$/i.test(value.trim())) {
    return { valid: false, error: "Financial year format must be 'FY YYYY-YY' (e.g. FY 2025-26)" };
  }
  return { valid: true };
}

// ─── India Financial Year helper ────────────────────────────────────

export function getCurrentFY(): { label: string; startDate: string; endDate: string } {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; // Apr=3
  const nextYear = year + 1;
  return {
    label: `FY ${year}-${String(nextYear).slice(2)}`,
    startDate: `${year}-04-01`,
    endDate: `${nextYear}-03-31`,
  };
}

// ─── IFSC (Indian bank routing, 11 chars: AAAA0XXXXXX) ─────────────

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export function validateIFSC(value: string | undefined | null): ValidationResult {
  if (!value) return { valid: true };
  const cleaned = value.trim().toUpperCase();
  if (cleaned.length !== 11) return { valid: false, error: "IFSC must be exactly 11 characters" };
  if (!IFSC_REGEX.test(cleaned)) return { valid: false, error: "Invalid IFSC format. Expected: SBIN0001234" };
  return { valid: true };
}

// ─── CIN (Corporate Identification Number, 21 chars) ────────────────

const CIN_REGEX = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;

export function validateCIN(value: string | undefined | null): ValidationResult {
  if (!value) return { valid: true };
  const cleaned = value.trim().toUpperCase();
  if (cleaned.length !== 21) return { valid: false, error: "CIN must be exactly 21 characters" };
  if (!CIN_REGEX.test(cleaned)) return { valid: false, error: "Invalid CIN format. Expected: L12345MH2000PLC123456" };
  return { valid: true };
}

// ─── Pincode (Indian 6-digit) ──────────────────────────────────────

export function validatePincode(value: string | undefined | null): ValidationResult {
  if (!value) return { valid: true };
  const cleaned = value.trim();
  if (!/^[1-9]\d{5}$/.test(cleaned)) return { valid: false, error: "Pincode must be 6 digits, cannot start with 0" };
  return { valid: true };
}

// ─── Phone (landline or mobile, 8–15 digits with optional +, -, spaces) ──

export function validatePhone(value: string | undefined | null): ValidationResult {
  if (!value) return { valid: true };
  const cleaned = value.replace(/[\s\-()]/g, "");
  if (!/^\+?\d{8,15}$/.test(cleaned)) return { valid: false, error: "Phone must be 8–15 digits" };
  return { valid: true };
}

// ─── URL ────────────────────────────────────────────────────────────

export function validateURL(value: string | undefined | null): ValidationResult {
  if (!value) return { valid: true };
  const trimmed = value.trim();
  if (!/^https?:\/\/[^\s]+\.[^\s]+$/i.test(trimmed)) {
    return { valid: false, error: "URL must start with http:// or https://" };
  }
  return { valid: true };
}

// ─── HSN / SAC code (4, 6, or 8 digits) ─────────────────────────────

export function validateHSN(value: string | undefined | null): ValidationResult {
  if (!value) return { valid: true };
  const cleaned = value.trim();
  if (!/^\d{4}(\d{2}(\d{2})?)?$/.test(cleaned)) {
    return { valid: false, error: "HSN/SAC must be 4, 6, or 8 digits" };
  }
  return { valid: true };
}

// ─── Percentage (0–100, up to 2 decimals) ──────────────────────────

export function validatePercentage(value: any, fieldName = "Percentage"): ValidationResult {
  if (value === "" || value === null || value === undefined) return { valid: true };
  const n = Number(value);
  if (isNaN(n)) return { valid: false, error: `${fieldName} must be a number` };
  if (n < 0 || n > 100) return { valid: false, error: `${fieldName} must be between 0 and 100` };
  return { valid: true };
}

// ─── Non-negative number (≥ 0) ─────────────────────────────────────

export function validateNonNegativeNumber(value: any, fieldName = "Value"): ValidationResult {
  if (value === "" || value === null || value === undefined) return { valid: true };
  const n = Number(value);
  if (isNaN(n)) return { valid: false, error: `${fieldName} must be a number` };
  if (n < 0) return { valid: false, error: `${fieldName} cannot be negative` };
  return { valid: true };
}

// ─── Positive integer (> 0) ────────────────────────────────────────

export function validatePositiveInteger(value: any, fieldName = "Value"): ValidationResult {
  if (value === "" || value === null || value === undefined) return { valid: true };
  const n = Number(value);
  if (isNaN(n) || !Number.isInteger(n)) return { valid: false, error: `${fieldName} must be an integer` };
  if (n <= 0) return { valid: false, error: `${fieldName} must be greater than zero` };
  return { valid: true };
}

// ─── Min / Max length ──────────────────────────────────────────────

export function validateMinLength(value: string | undefined | null, min: number, fieldName = "Value"): ValidationResult {
  if (!value) return { valid: true };
  if (value.trim().length < min) return { valid: false, error: `${fieldName} must be at least ${min} characters` };
  return { valid: true };
}

// ─── Alphanumeric code (letters, digits, dashes, underscores) ──────

export function validateCode(value: string | undefined | null, fieldName = "Code"): ValidationResult {
  if (!value) return { valid: true };
  const cleaned = value.trim();
  if (!/^[A-Za-z0-9_\-]+$/.test(cleaned)) {
    return { valid: false, error: `${fieldName} can only contain letters, numbers, dashes and underscores` };
  }
  return { valid: true };
}

// ─── Date ISO (YYYY-MM-DD) ─────────────────────────────────────────

export function validateDateISO(value: string | undefined | null, fieldName = "Date"): ValidationResult {
  if (!value) return { valid: true };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { valid: false, error: `${fieldName} must be in YYYY-MM-DD format` };
  const d = new Date(value);
  if (isNaN(d.getTime())) return { valid: false, error: `${fieldName} is not a valid date` };
  return { valid: true };
}

export function validateDateRange(
  startISO: string | undefined | null,
  endISO: string | undefined | null,
  fieldName = "End date",
): ValidationResult {
  if (!startISO || !endISO) return { valid: true };
  if (new Date(endISO) < new Date(startISO)) return { valid: false, error: `${fieldName} must be on or after the start date` };
  return { valid: true };
}

// ─── Batch / form validation helper ────────────────────────────────

export interface FieldValidation {
  field: string;
  value: any;
  validators: Array<(val: any, field?: string) => ValidationResult>;
}

export function validateAll(fields: FieldValidation[]): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    for (const v of f.validators) {
      const result = v(f.value, f.field);
      if (!result.valid) {
        errors[f.field] = result.error!;
        break;
      }
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

// ─── Declarative form-rules helper for React forms ─────────────────
//
// Usage:
//   const rules: ValidationRules<typeof form> = {
//     name: [{ required: true, label: "Company name" }],
//     email: [{ validator: validateEmail }],
//     pan:   [{ validator: validatePAN }],
//   };
//   const errors = validateForm(form, rules);
//   if (Object.keys(errors).length) { setErrors(errors); return; }

export type Rule = {
  required?: boolean;
  label?: string;
  validator?: (v: any, f?: string) => ValidationResult;
};

export type ValidationRules<T> = Partial<Record<keyof T, Rule[]>>;

export function validateForm<T extends Record<string, any>>(form: T, rules: ValidationRules<T>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const key of Object.keys(rules) as Array<keyof T>) {
    const ruleList = rules[key] ?? [];
    const value = form[key];
    for (const rule of ruleList) {
      if (rule.required) {
        const req = validateRequired(value, rule.label ?? String(key));
        if (!req.valid) { errors[key as string] = req.error!; break; }
      }
      if (rule.validator) {
        const res = rule.validator(value, rule.label ?? String(key));
        if (!res.valid) { errors[key as string] = res.error!; break; }
      }
    }
  }
  return errors;
}
