/**
 * Validate + coerce a Lead.dynamicFields payload against the org's field
 * definitions. Used on both lead create and lead update.
 *
 * Behavior:
 *   - Unknown keys are dropped silently (matches legacy permissive behavior).
 *   - Known keys are coerced to the field's declared type.
 *   - Required fields with empty values raise an error if `requireMissing=true`.
 *   - Select/MultiSelect values must be in the option set.
 *
 * Standard fields are out of scope here — those are written directly to the
 * Lead row, not into dynamicFields. Only fields with isStandard !== true pass
 * through this validator.
 */

import type { LeadFieldDefinition } from "@/types/field-definition";
import { STANDARD_KEYS } from "@/types/field-definition";

export interface DynamicFieldsValidationResult {
  /** Validated + coerced values to persist. */
  values: Record<string, unknown>;
  /** Per-key error messages (only set when requireMissing surfaced a problem). */
  errors: Record<string, string>;
}

export function validateDynamicFields(opts: {
  defs: LeadFieldDefinition[];
  input: Record<string, unknown> | null | undefined;
  requireMissing?: boolean;
}): DynamicFieldsValidationResult {
  const customDefs = opts.defs.filter((d) => !d.isStandard && !STANDARD_KEYS.has(d.key));
  const out: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const def of customDefs) {
    const raw = opts.input?.[def.key];
    const isEmpty =
      raw === null || raw === undefined || raw === "" || (Array.isArray(raw) && raw.length === 0);

    if (isEmpty) {
      if (def.requirement === "Required" && opts.requireMissing) {
        errors[def.key] = `${def.label} is required`;
      }
      // skip writing empty — keeps payload clean
      continue;
    }

    try {
      out[def.key] = coerce(def, raw);
    } catch (e) {
      errors[def.key] = e instanceof Error ? e.message : `Invalid value for ${def.label}`;
    }
  }
  return { values: out, errors };
}

function coerce(def: LeadFieldDefinition, raw: unknown): unknown {
  switch (def.fieldType) {
    case "Text":
    case "TextArea":
    case "Email":
      return String(raw).trim();
    case "Phone":
      return coercePhone(def, raw);
    case "Number": {
      const n = typeof raw === "number" ? raw : Number(String(raw).trim());
      if (Number.isNaN(n)) throw new Error(`${def.label} must be a number`);
      return n;
    }
    case "Date": {
      const d = raw instanceof Date ? raw : new Date(String(raw));
      if (Number.isNaN(d.getTime())) throw new Error(`${def.label} must be a valid date`);
      return d.toISOString();
    }
    case "Boolean":
      return raw === true || raw === "true" || raw === "1" || raw === 1;
    case "Select": {
      const s = String(raw);
      if (def.options && def.options.length > 0 && !def.options.includes(s)) {
        throw new Error(`${def.label} must be one of: ${def.options.join(", ")}`);
      }
      return s;
    }
    case "MultiSelect": {
      const arr = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      if (def.options && def.options.length > 0) {
        const allowed = new Set(def.options);
        for (const v of arr) {
          if (!allowed.has(v)) throw new Error(`${def.label}: "${v}" is not an allowed option`);
        }
      }
      return arr;
    }
  }
}

/**
 * Phone-type dynamic fields are stored as `{ countryIso2, dialCode, number }`.
 * The local `number` part must be exactly 10 digits (matches frontend rule).
 *
 * Accepts a few legacy/loose input shapes:
 *   - object with { countryIso2, dialCode, number }
 *   - string starting with "+" (E.164) — split into dial + number
 *   - bare digit string — treated as IN/+91 number
 */
function coercePhone(def: LeadFieldDefinition, raw: unknown): { countryIso2: string; dialCode: string; number: string } {
  let countryIso2 = "IN";
  let dialCode = "+91";
  let numberPart = "";

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    if (typeof r.countryIso2 === "string") countryIso2 = r.countryIso2.toUpperCase();
    if (typeof r.dialCode === "string") dialCode = r.dialCode.startsWith("+") ? r.dialCode : `+${r.dialCode}`;
    if (typeof r.number === "string") numberPart = r.number;
    else if (typeof r.number === "number") numberPart = String(r.number);
  } else if (typeof raw === "string") {
    const s = raw.trim();
    if (s.startsWith("+")) {
      // Strip leading + and split: assume 1–3 digit dial code, rest is the local number.
      // We can't reliably split without metadata, so default to the trailing 10 digits as number.
      const digits = s.replace(/\D+/g, "");
      if (digits.length >= 10) {
        numberPart = digits.slice(-10);
        const dial = digits.slice(0, digits.length - 10);
        if (dial.length > 0) dialCode = `+${dial}`;
      } else {
        numberPart = digits;
      }
    } else {
      numberPart = s.replace(/\D+/g, "");
    }
  } else {
    throw new Error(`${def.label} must be a phone number.`);
  }

  numberPart = numberPart.replace(/\D+/g, "");
  if (numberPart.length !== 10) {
    throw new Error(`${def.label} must be exactly 10 digits.`);
  }
  if (!/^\+\d{1,4}$/.test(dialCode)) {
    throw new Error(`${def.label} has an invalid dial code.`);
  }
  if (!/^[A-Z]{2}$/.test(countryIso2)) {
    throw new Error(`${def.label} has an invalid country code.`);
  }
  return { countryIso2, dialCode, number: numberPart };
}
