import { createHash } from "crypto";

/** Deterministic, key-sorted JSON serialization so equal objects hash equally. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

/** SHA-256 content hash of an object — the basis of incremental sync diffing. */
export function stableHash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

/** Short checksum (first 12 hex chars) for compact storage/display. */
export function checksum(value: unknown): string {
  return stableHash(value).slice(0, 12);
}
