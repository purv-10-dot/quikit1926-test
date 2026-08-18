import { describe, expect, it } from "vitest";
import { TEST_STATUSES, TEST_STATUS_SEED } from "@/lib/test/statuses";

/**
 * The provisioning seed must stay in step with the migration and with the render
 * vocabulary.
 *
 * Context: the migration seeded `QtTestStatus` with a `CROSS JOIN quikit."Org"` — a
 * one-shot over orgs existing at the time. Every org created afterwards had NO
 * statuses, and creating a test run failed with "No default test status is
 * configured for this organisation." `ensureTestStatuses` provisions from
 * TEST_STATUS_SEED instead, so these invariants are what keep a provisioned org
 * identical to a seeded one.
 */

describe("TEST_STATUS_SEED", () => {
  it("has all nine statuses", () => {
    expect(TEST_STATUS_SEED).toHaveLength(9);
  });

  it("has exactly one default", () => {
    // A partial unique index (QtTestStatus_orgId_default_uniq) permits exactly one
    // default per org — two would make the insert fail and restore nothing.
    expect(TEST_STATUS_SEED.filter((s) => s.isDefault)).toHaveLength(1);
  });

  it("makes `untested` the default", () => {
    expect(TEST_STATUS_SEED.find((s) => s.isDefault)?.key).toBe("untested");
  });

  it("uses 6-digit hex colours, not Tailwind classes", () => {
    // QtTestStatus.color is a hex string. TEST_STATUSES carries the Tailwind
    // classes for rendering; mixing the two up would store "bg-green-500".
    for (const s of TEST_STATUS_SEED) {
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("has unique keys", () => {
    expect(new Set(TEST_STATUS_SEED.map((s) => s.key)).size).toBe(9);
  });

  it("has unique, 1-based, contiguous orderNo values", () => {
    const orders = TEST_STATUS_SEED.map((s) => s.orderNo).sort((a, b) => a - b);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("covers exactly the same keys as the render vocabulary", () => {
    // If these drift, a status could exist in the DB with no colour/label mapping
    // (or vice versa) — statusMeta() throws on an unknown key.
    const seedKeys = [...TEST_STATUS_SEED.map((s) => s.key)].sort();
    const renderKeys = [...TEST_STATUSES.map((s) => s.key)].sort();
    expect(seedKeys).toEqual(renderKeys);
  });

  it("agrees with the render vocabulary on the flags", () => {
    for (const seed of TEST_STATUS_SEED) {
      const meta = TEST_STATUSES.find((s) => s.key === seed.key);
      expect(meta, `missing meta for ${seed.key}`).toBeDefined();
      expect(meta?.isFinal).toBe(seed.isFinal);
      expect(meta?.isAutomation).toBe(seed.isAutomation);
      expect(meta?.isDefault).toBe(seed.isDefault);
    }
  });

  it("marks the three automation buckets", () => {
    expect(TEST_STATUS_SEED.filter((s) => s.isAutomation)).toHaveLength(3);
  });

  it("treats untested and retest as not-yet-final", () => {
    // isFinal drives the "still to execute" maths, so these two must stay false.
    expect(TEST_STATUS_SEED.find((s) => s.key === "untested")?.isFinal).toBe(false);
    expect(TEST_STATUS_SEED.find((s) => s.key === "retest")?.isFinal).toBe(false);
  });
});
