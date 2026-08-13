import type { ProductFieldDefinition } from "@/types/product-field-definition";
import { STANDARD_PRODUCT_KEYS } from "@/types/product-field-definition";

export interface DynamicFieldsValidationResult {
  values: Record<string, unknown>;
  errors: Record<string, string>;
}

export function validateProductDynamicFields(opts: {
  defs: ProductFieldDefinition[];
  input: Record<string, unknown> | null | undefined;
  requireMissing?: boolean;
}): DynamicFieldsValidationResult {
  const customDefs = opts.defs.filter((d) => !d.isStandard && !STANDARD_PRODUCT_KEYS.has(d.key));
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

function coerce(def: ProductFieldDefinition, raw: unknown): unknown {
  switch (def.fieldType) {
    case "Text":
    case "TextArea":
    case "Email":
      return String(raw).trim();
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
      if (def.options?.length && !def.options.includes(s)) {
        throw new Error(`${def.label} must be one of: ${def.options.join(", ")}`);
      }
      return s;
    }
    case "MultiSelect": {
      const arr = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      if (def.options?.length) {
        const allowed = new Set(def.options);
        for (const v of arr) {
          if (!allowed.has(v)) throw new Error(`${def.label}: "${v}" is not allowed`);
        }
      }
      return arr;
    }
    case "Phone":
      return String(raw).trim();
  }
}
