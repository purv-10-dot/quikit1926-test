import type { ConflictStrategy } from "../types";
import { stableHash } from "../util/hash";

/**
 * Conflict Resolution Engine — pure decision logic. Detects when both sides of
 * a sync changed since the last reconciled state, computes a field-level diff,
 * and resolves per the configured strategy (or defers to manual review).
 */

export type ConflictInput = {
  internal: Record<string, unknown> | null;
  external: Record<string, unknown> | null;
  internalModifiedAt?: string | null;
  externalModifiedAt?: string | null;
  /** Hash captured at the last successful sync. */
  lastSyncedHash?: string | null;
};

export type FieldDiff = { field: string; internal: unknown; external: unknown };

export function computeDiff(internal: Record<string, unknown> | null, external: Record<string, unknown> | null): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const keys = new Set([...Object.keys(internal ?? {}), ...Object.keys(external ?? {})]);
  for (const field of keys) {
    const a = internal?.[field];
    const b = external?.[field];
    if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push({ field, internal: a, external: b });
  }
  return diffs;
}

/** True when BOTH sides diverged from the last reconciled snapshot. */
export function isConflict(input: ConflictInput): boolean {
  if (!input.internal || !input.external) return false;
  const internalChanged = input.lastSyncedHash ? stableHash(input.internal) !== input.lastSyncedHash : true;
  const externalChanged = input.lastSyncedHash ? stableHash(input.external) !== input.lastSyncedHash : true;
  return internalChanged && externalChanged && computeDiff(input.internal, input.external).length > 0;
}

export type Resolution =
  | { outcome: "internal"; data: Record<string, unknown> }
  | { outcome: "external"; data: Record<string, unknown> }
  | { outcome: "merge"; data: Record<string, unknown> }
  | { outcome: "manual" };

export function resolve(strategy: ConflictStrategy, input: ConflictInput, selectedFields?: Record<string, "internal" | "external">): Resolution {
  const internal = input.internal ?? {};
  const external = input.external ?? {};
  switch (strategy) {
    case "quikfinance_wins":
      return { outcome: "internal", data: internal };
    case "external_wins":
      return { outcome: "external", data: external };
    case "latest_wins": {
      const ti = input.internalModifiedAt ? Date.parse(input.internalModifiedAt) : 0;
      const te = input.externalModifiedAt ? Date.parse(input.externalModifiedAt) : 0;
      return te > ti ? { outcome: "external", data: external } : { outcome: "internal", data: internal };
    }
    case "merge": {
      // Selective merge: per-field pick (defaults to external when unspecified).
      const merged: Record<string, unknown> = { ...internal };
      for (const { field } of computeDiff(internal, external)) {
        const pick = selectedFields?.[field] ?? "external";
        merged[field] = pick === "internal" ? internal[field] : external[field];
      }
      return { outcome: "merge", data: merged };
    }
    case "manual":
    default:
      return { outcome: "manual" };
  }
}
