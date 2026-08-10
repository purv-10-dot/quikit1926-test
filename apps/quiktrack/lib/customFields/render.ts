import type { FieldValue } from "@/lib/customFields/registry";

/** Render a custom field value as a short string for the activity feed. */
export function renderCfValue(v: FieldValue): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (Array.isArray(v)) return v.length ? v.join(", ") : null;
  return String(v);
}
