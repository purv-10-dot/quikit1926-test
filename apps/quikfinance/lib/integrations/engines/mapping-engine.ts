import type { FieldMapping, SyncDirection, TransformRule } from "../types";

/**
 * Mapping Engine — pure, deterministic field mapping + transformation. Given a
 * source record and a set of field mappings, produce the target-shaped record.
 * No I/O, fully unit-testable. Direction-aware so the same map set drives both
 * pull (external→internal) and push (internal→external).
 */

function applyTransform(value: unknown, rule: TransformRule | null | undefined, record: Record<string, unknown>): unknown {
  if (!rule || rule.type === "none") return value;
  const str = value == null ? "" : String(value);
  switch (rule.type) {
    case "uppercase": return str.toUpperCase();
    case "lowercase": return str.toLowerCase();
    case "trim": return str.trim();
    case "number": {
      const n = Number(str.replace(/[, ]/g, ""));
      return Number.isFinite(n) ? n : null;
    }
    case "default": return value == null || str === "" ? rule.value : value;
    case "concat": {
      const other = record[rule.with];
      return [str, other == null ? "" : String(other)].filter(Boolean).join(rule.separator ?? " ");
    }
    case "lookup": return rule.map[str] ?? value;
    case "date_format": {
      const d = new Date(str);
      if (Number.isNaN(d.getTime())) return value;
      // Minimal formatter supporting YYYY, MM, DD tokens.
      const pad = (x: number) => String(x).padStart(2, "0");
      return rule.to
        .replace(/YYYY/g, String(d.getUTCFullYear()))
        .replace(/MM/g, pad(d.getUTCMonth() + 1))
        .replace(/DD/g, pad(d.getUTCDate()));
    }
    default: return value;
  }
}

function directionApplies(mapDir: SyncDirection, runDir: SyncDirection): boolean {
  if (mapDir === "bidirectional" || runDir === "bidirectional") return true;
  return mapDir === runDir;
}

export type MappingResult = {
  output: Record<string, unknown>;
  appliedFields: string[];
  skippedFields: string[];
};

export function applyMapping(
  source: Record<string, unknown>,
  mappings: FieldMapping[],
  direction: SyncDirection
): MappingResult {
  const output: Record<string, unknown> = {};
  const appliedFields: string[] = [];
  const skippedFields: string[] = [];

  for (const m of mappings) {
    if (m.enabled === false) continue;
    if (!directionApplies(m.direction, direction)) continue;
    // For pull we read sourceField and write targetField; for push we invert.
    const from = direction === "push" ? m.targetField : m.sourceField;
    const to = direction === "push" ? m.sourceField : m.targetField;
    const raw = source[from];
    if (raw === undefined && m.transform?.type !== "default") {
      skippedFields.push(from);
      continue;
    }
    output[to] = applyTransform(raw, m.transform, source);
    appliedFields.push(to);
  }
  return { output, appliedFields, skippedFields };
}

/** Default identity mappings for an entity from a sample record's keys. */
export function inferMappings(entity: FieldMapping["entity"], sample: Record<string, unknown>): FieldMapping[] {
  return Object.keys(sample).map((key) => ({
    entity,
    sourceField: key,
    targetField: key,
    direction: "bidirectional" as SyncDirection,
    transform: { type: "none" } as TransformRule,
    enabled: true
  }));
}
