import { describe, it, expect, beforeAll } from "vitest";
import { applyMapping, inferMappings } from "../engines/mapping-engine";
import { computeDiff, isConflict, resolve } from "../engines/conflict-engine";
import { detectDuplicates, scoreMatch } from "../engines/duplicate-engine";
import { computeHealth } from "../engines/health-engine";
import { stableHash, checksum } from "../util/hash";
import { encryptSecret, decryptSecret, maskSecret } from "../secrets";
import type { FieldMapping } from "../types";

describe("mapping engine", () => {
  const maps: FieldMapping[] = [
    { entity: "customers", sourceField: "Name", targetField: "display_name", direction: "pull", transform: { type: "trim" } },
    { entity: "customers", sourceField: "PartyGSTIN", targetField: "tax_id", direction: "pull", transform: { type: "uppercase" } },
    { entity: "customers", sourceField: "OnlyPush", targetField: "ignored", direction: "push", transform: { type: "none" } }
  ];

  it("maps + transforms on pull and respects direction", () => {
    const out = applyMapping({ Name: "  Acme  ", PartyGSTIN: "22aaaaa0000a1z5", OnlyPush: "x" }, maps, "pull").output;
    expect(out.display_name).toBe("Acme");
    expect(out.tax_id).toBe("22AAAAA0000A1Z5");
    expect(out.ignored).toBeUndefined(); // push-only mapping skipped on pull
  });

  it("inverts source/target on push for bidirectional maps", () => {
    const bidi: FieldMapping[] = [{ entity: "customers", sourceField: "Name", targetField: "display_name", direction: "bidirectional", transform: { type: "none" } }];
    const out = applyMapping({ display_name: "Acme" }, bidi, "push").output;
    expect(out.Name).toBe("Acme");
  });

  it("applies default transform even when source is missing", () => {
    const out = applyMapping({}, [{ entity: "customers", sourceField: "currency", targetField: "currency", direction: "pull", transform: { type: "default", value: "INR" } }], "pull").output;
    expect(out.currency).toBe("INR");
  });

  it("infers identity mappings from a sample", () => {
    const inferred = inferMappings("products", { name: "Widget", rate: 10 });
    expect(inferred).toHaveLength(2);
    expect(inferred[0].sourceField).toBe(inferred[0].targetField);
  });
});

describe("conflict engine", () => {
  it("computes a field-level diff", () => {
    const diffs = computeDiff({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 });
    expect(diffs.map((d) => d.field).sort()).toEqual(["b", "c"]);
  });

  it("flags a conflict only when both sides diverged", () => {
    const base = stableHash({ name: "A" });
    expect(isConflict({ internal: { name: "B" }, external: { name: "C" }, lastSyncedHash: base })).toBe(true);
    expect(isConflict({ internal: { name: "A" }, external: { name: "C" }, lastSyncedHash: base })).toBe(false);
  });

  it("resolves by strategy", () => {
    const input = { internal: { name: "Q" }, external: { name: "E" }, internalModifiedAt: "2026-01-01", externalModifiedAt: "2026-02-01" };
    expect(resolve("quikfinance_wins", input)).toMatchObject({ outcome: "internal" });
    expect(resolve("external_wins", input)).toMatchObject({ outcome: "external" });
    expect(resolve("latest_wins", input)).toMatchObject({ outcome: "external" }); // external is newer
    expect(resolve("manual", input)).toMatchObject({ outcome: "manual" });
  });

  it("merges with per-field selection", () => {
    const r = resolve("merge", { internal: { a: 1, b: 1 }, external: { a: 2, b: 2 } }, { a: "internal" });
    expect(r).toMatchObject({ outcome: "merge" });
    if (r.outcome === "merge") {
      expect(r.data.a).toBe(1); // picked internal
      expect(r.data.b).toBe(2); // defaulted external
    }
  });
});

describe("duplicate engine", () => {
  it("matches on GSTIN with high score", () => {
    const m = scoreMatch({ id: "1", gstin: "22AAAAA0000A1Z5" }, { id: "2", gstin: "22aaaaa0000a1z5" });
    expect(m?.reasons).toContain("gstin");
    expect(m?.recommend).toBe("merge");
  });

  it("derives PAN from GSTIN when PAN missing", () => {
    const m = scoreMatch({ id: "1", gstin: "22AAAAA0000A1Z5" }, { id: "2", pan: "AAAAA0000A" });
    expect(m?.reasons).toContain("pan");
  });

  it("matches phone on last 10 digits", () => {
    const m = scoreMatch({ id: "1", phone: "+91 98765 43210" }, { id: "2", phone: "9876543210" });
    expect(m?.reasons).toContain("phone");
  });

  it("returns no match when nothing aligns", () => {
    expect(scoreMatch({ id: "1", name: "Acme" }, { id: "2", name: "Globex" })).toBeNull();
  });

  it("picks the best existing match per incoming", () => {
    const matches = detectDuplicates(
      [{ id: "in1", email: "a@x.com" }],
      [{ id: "ex1", email: "other@x.com" }, { id: "ex2", email: "a@x.com" }]
    );
    expect(matches[0].existingId).toBe("ex2");
  });
});

describe("health engine", () => {
  it("scores a healthy connection near 100", () => {
    const r = computeHealth({ successRate: 1, avgSyncMs: 500, apiLatencyMs: 300, failedRequests: 0, retryCount: 0, queueLength: 0, tokenExpiresInHours: 72, lastFailureAgeHours: null });
    expect(r.score).toBeGreaterThanOrEqual(95);
    expect(r.band).toBe("excellent");
  });

  it("penalises failures, latency, and expiring tokens", () => {
    const r = computeHealth({ successRate: 0.6, avgSyncMs: 5000, apiLatencyMs: 4000, failedRequests: 10, retryCount: 8, queueLength: 120, tokenExpiresInHours: -2, lastFailureAgeHours: 1 });
    expect(r.score).toBeLessThan(50);
    expect(r.recommendations.length).toBeGreaterThan(1);
  });
});

describe("hashing", () => {
  it("is order-independent and stable", () => {
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }));
    expect(checksum({ a: 1 })).toHaveLength(12);
  });
  it("differs when content changes", () => {
    expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 2 }));
  });
});

describe("secrets", () => {
  beforeAll(() => { process.env.INTEGRATIONS_ENCRYPTION_KEY = "test-integration-key-123456"; process.env.CONTACT_ENCRYPTION_KEY = "test-integration-key-123456"; });
  it("round-trips an encrypted secret", () => {
    const enc = encryptSecret("super-secret-token");
    expect(enc).not.toContain("super-secret-token");
    expect(decryptSecret(enc)).toBe("super-secret-token");
  });
  it("masks for display", () => {
    expect(maskSecret("abcdef1234")).toMatch(/1234$/);
  });
});
