/**
 * Helpers for rendering AuditLog entries in the UI.
 *
 * AuditLog.oldValues / newValues are TEXT columns that hold a JSON-encoded
 * snapshot string (see schema.prisma:AuditLog and lib/api/auditLog.ts where
 * `safeStringify` is applied on write). The route handlers return that raw
 * string in the `oldValue` / `newValue` fields.
 *
 * Passing a string into `Object.entries` / `Object.keys` iterates each
 * character index instead of the JSON keys, producing rows like
 * `0="{", 1="\"", 2="c"`. These helpers parse the string first and provide
 * a single rendering path so every audit-log UI behaves consistently.
 */

const NOISE_KEYS = new Set([
  "id",
  "tenantId",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "deletedAt",
]);

/**
 * Coerce an unknown audit-log value into a plain object.
 *  - object → returned as-is
 *  - JSON string → parsed
 *  - anything else / parse failure → null
 */
export function parseAuditValue(v: unknown): Record<string, unknown> | null {
  if (v == null) return null;
  if (typeof v === "object") return v as Record<string, unknown>;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Format a CREATE-style audit value as `key=value, key=value`.
 * Skips noisy meta keys (id, timestamps, audit fields).
 * If the value can't be parsed, returns the raw string verbatim (or "").
 */
export function fmtAuditPayload(raw: unknown): string {
  const obj = parseAuditValue(raw);
  if (!obj) return typeof raw === "string" ? raw : "";
  return Object.entries(obj)
    .filter(([k]) => !NOISE_KEYS.has(k))
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(", ");
}

/**
 * Diff two audit values (old/new) and return only the keys that changed.
 * Used by the UPDATE rendering block to show field-level changes.
 * Returns [] if either side fails to parse or nothing changed.
 */
export function diffAuditPayload(
  rawOld: unknown,
  rawNew: unknown,
): Array<{ key: string; oldValue: unknown; newValue: unknown }> {
  const oldObj = parseAuditValue(rawOld) ?? {};
  const newObj = parseAuditValue(rawNew) ?? {};
  const keys = new Set<string>([
    ...Object.keys(oldObj),
    ...Object.keys(newObj),
  ]);
  const out: Array<{ key: string; oldValue: unknown; newValue: unknown }> = [];
  for (const k of keys) {
    if (NOISE_KEYS.has(k)) continue;
    const oldV = oldObj[k];
    const newV = newObj[k];
    if (JSON.stringify(oldV) === JSON.stringify(newV)) continue;
    out.push({ key: k, oldValue: oldV, newValue: newV });
  }
  return out;
}
