/**
 * Field-level diff engine for the audit system.
 *
 * Pure functions only — no Prisma, no I/O — so they're trivially unit-testable.
 * `diffFields` computes the set of changed fields between a `before` and
 * `after` object and is the basis for the AuditChange rows written by
 * `audit.log` (see ./audit.ts). Only CHANGED fields are emitted; unchanged
 * fields produce no rows (requirement: store only changed fields).
 *
 * Equality is structural and key-order-insensitive (so re-serialized JSON
 * blobs like `weeklyTargets` don't register as spurious changes), and treats
 * `undefined` and `null` as equal (an absent field == an explicit null).
 */

export interface FieldChange {
  fieldName: string;
  /** Normalized so undefined becomes null (JSONB-friendly). */
  oldValue: unknown;
  newValue: unknown;
}

export interface DiffOptions {
  /** Whitelist: only diff these fields. When omitted, every key in either object is considered. */
  include?: string[];
  /** Blacklist: never diff these fields. Applied after `include`. */
  exclude?: string[];
}

function normalize(value: unknown): unknown {
  return value === undefined ? null : value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

/**
 * Deterministic, key-order-insensitive serialization used for equality.
 * Object keys are sorted recursively; array order is preserved (a reorder is
 * treated as a real change, which is the safe/conservative choice).
 */
export function stableStringify(value: unknown): string {
  const v = normalize(value);
  if (v === null) return "null";
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return (
      "{" +
      keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") +
      "}"
    );
  }
  return JSON.stringify(v);
}

/** Structural equality; treats undefined == null and ignores object key order. */
export function valuesEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

/**
 * Compute the changed fields between `before` and `after`.
 * Non-object inputs are treated as empty objects (so a `before` of
 * null/undefined yields every `after` field as a creation diff).
 */
export function diffFields(
  before: unknown,
  after: unknown,
  opts: DiffOptions = {},
): FieldChange[] {
  const b = isPlainObject(before) ? before : {};
  const a = isPlainObject(after) ? after : {};

  let keys: string[];
  if (opts.include && opts.include.length > 0) {
    keys = [...opts.include];
  } else {
    keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  }
  if (opts.exclude && opts.exclude.length > 0) {
    const excluded = new Set(opts.exclude);
    keys = keys.filter((k) => !excluded.has(k));
  }

  const changes: FieldChange[] = [];
  for (const key of keys) {
    if (!valuesEqual(b[key], a[key])) {
      changes.push({
        fieldName: key,
        oldValue: normalize(b[key]),
        newValue: normalize(a[key]),
      });
    }
  }
  return changes;
}
