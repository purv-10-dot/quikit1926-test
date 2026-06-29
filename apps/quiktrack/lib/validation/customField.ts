import { z } from "zod";
import { FIELD_TYPES, fieldConfig, isBlank, type FieldValue } from "@/lib/customFields/registry";

/**
 * Validation for custom field DEFINITIONS (admin create/edit) and for field
 * VALUES written onto issues. Scope (global vs space) and projectId are derived
 * from the route, never trusted from the body.
 */

const optionInputSchema = z.object({
  id: z.string().min(1).optional(), // present = existing option being renamed/toggled
  label: z.string().min(1).max(100),
  isActive: z.boolean().optional(),
});

export const createCustomFieldSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    type: z.enum(FIELD_TYPES),
    description: z.string().max(300).optional(),
    isRequired: z.boolean().optional().default(false),
    defaultValue: z.unknown().optional(),
    placeholder: z.string().max(200).optional(),
    helpText: z.string().max(200).optional(),
    options: z.array(optionInputSchema).optional(),
  })
  .superRefine((data, ctx) => {
    const cfg = fieldConfig(data.type);
    if (cfg.hasOptions && (!data.options || data.options.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Dropdown fields need at least one option.",
      });
    }
  });

export const updateCustomFieldSchema = z.object({
  // Type and key are immutable (FRD §5.4) — intentionally absent.
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(300).nullable().optional(),
  isRequired: z.boolean().optional(),
  defaultValue: z.unknown().optional(),
  placeholder: z.string().max(200).nullable().optional(),
  helpText: z.string().max(200).nullable().optional(),
  position: z.number().int().min(0).optional(),
  status: z.enum(["active", "archived"]).optional(),
  options: z.array(optionInputSchema).optional(),
});

export type CreateCustomFieldInput = z.infer<typeof createCustomFieldSchema>;
export type UpdateCustomFieldInput = z.infer<typeof updateCustomFieldSchema>;

/** A field definition as needed to validate a value (subset of QtCustomField). */
export interface FieldForValidation {
  id: string;
  name: string;
  type: string;
  isRequired: boolean;
  options?: { value: string; isActive: boolean }[];
}

export interface ValueValidationResult {
  ok: boolean;
  /** Normalized value to persist when ok. */
  value?: FieldValue;
  error?: string;
}

/**
 * Validate + normalize a single value against its field definition.
 * Used server-side (authoritative — NFR-05) on issue create/update and mirrored
 * on the client for instant feedback.
 */
export function validateFieldValue(field: FieldForValidation, raw: FieldValue): ValueValidationResult {
  const cfg = fieldConfig(field.type);
  const blank = isBlank(raw);

  if (blank) {
    if (field.isRequired) return { ok: false, error: `${field.name} is required.` };
    return { ok: true, value: null };
  }

  switch (field.type) {
    case "NUMBER": {
      const n = Number(raw);
      if (!Number.isFinite(n)) return { ok: false, error: `${field.name} must be a number.` };
      return { ok: true, value: n };
    }
    case "CHECKBOX":
      return { ok: true, value: Boolean(raw) };
    case "DATE": {
      const d = new Date(String(raw));
      if (Number.isNaN(d.getTime())) return { ok: false, error: `${field.name} must be a valid date.` };
      return { ok: true, value: String(raw) };
    }
    case "URL": {
      const s = String(raw).trim();
      try {
        // Accept bare domains by prefixing https:// for the check only.
        const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
        // `new URL` treats any single word as a hostname ("ZXCZXCZ" → valid),
        // so additionally require a real domain: a dot + 2+ char TLD (or an
        // explicit localhost / IP host). This is what makes plain text fail.
        const host = u.hostname;
        const looksLikeDomain = /\.[a-z]{2,}$/i.test(host) || host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
        if (!looksLikeDomain) {
          return { ok: false, error: `${field.name} must be a valid URL.` };
        }
      } catch {
        return { ok: false, error: `${field.name} must be a valid URL.` };
      }
      return { ok: true, value: s };
    }
    case "DROPDOWN_SINGLE": {
      const active = (field.options ?? []).filter((o) => o.isActive).map((o) => o.value);
      if (!active.includes(String(raw))) return { ok: false, error: `Invalid option for ${field.name}.` };
      return { ok: true, value: String(raw) };
    }
    case "DROPDOWN_MULTI": {
      if (!Array.isArray(raw)) return { ok: false, error: `${field.name} must be a list.` };
      const active = new Set((field.options ?? []).filter((o) => o.isActive).map((o) => o.value));
      if (!raw.every((v) => active.has(String(v)))) return { ok: false, error: `Invalid option for ${field.name}.` };
      return { ok: true, value: raw.map(String) };
    }
    case "LABELS": {
      if (!Array.isArray(raw)) return { ok: false, error: `${field.name} must be a list.` };
      const cleaned = raw.map((v) => String(v).trim()).filter(Boolean);
      return { ok: true, value: cleaned };
    }
    case "USER_PICKER_MULTI": {
      // Array of userIds — no option list to validate against; just normalize.
      if (!Array.isArray(raw)) return { ok: false, error: `${field.name} must be a list.` };
      const ids = Array.from(new Set(raw.map((v) => String(v)).filter(Boolean)));
      return { ok: true, value: ids };
    }
    case "USER_PICKER":
    case "SHORT_TEXT":
    case "LONG_TEXT":
    default: {
      const s = String(raw);
      if (cfg.isMulti) return { ok: false, error: `${field.name} has an unexpected shape.` };
      return { ok: true, value: s };
    }
  }
}
