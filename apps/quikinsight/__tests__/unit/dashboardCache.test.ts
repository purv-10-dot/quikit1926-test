import { beforeEach, describe, expect, it } from "vitest";
import { clearCache, getAggCache, setAggCache } from "@/lib/dashboardCache";
import { periodCacheKey, resolvePeriod } from "@/lib/period/resolve";
import type { DashboardData } from "@/lib/types";

const NOW = new Date("2026-08-17T12:00:00Z");
const data = (tag: string) => ({ tag } as unknown as DashboardData);
const keyFor = (compare: Parameters<typeof resolvePeriod>[0]["compare"]) =>
  periodCacheKey(resolvePeriod({ preset: 7, compare }, NOW));

beforeEach(() => clearCache());

describe("aggregation cache keying", () => {
  it("does not serve a comparison request from a no-comparison entry", () => {
    // The regression this guards: keying on a day count alone meant turning
    // comparison on reused a payload built without any baseline.
    setAggCache("u1", keyFor("none"), data("no-compare"), "w1");
    expect(getAggCache("u1", keyFor("wow"), "w1")).toBeNull();
  });

  it("keeps two comparison modes over the same window apart", () => {
    setAggCache("u1", keyFor("previous"), data("prev"), "w1");
    expect(getAggCache("u1", keyFor("mom"), "w1")).toBeNull();
    expect(getAggCache("u1", keyFor("previous"), "w1")).toEqual(data("prev"));
  });

  it("scopes entries per user and per workspace", () => {
    setAggCache("u1", keyFor("none"), data("a"), "w1");
    expect(getAggCache("u2", keyFor("none"), "w1")).toBeNull();
    expect(getAggCache("u1", keyFor("none"), "w2")).toBeNull();
  });

  it("returns the entry on an exact match", () => {
    setAggCache("u1", keyFor("wow"), data("hit"), "w1");
    expect(getAggCache("u1", keyFor("wow"), "w1")).toEqual(data("hit"));
  });

  it("evicts rather than growing without bound as custom ranges accumulate", () => {
    // Custom ranges make the keyspace unbounded; without eviction the process
    // leaks one entry per distinct window a user ever picks.
    for (let i = 0; i < 260; i++) {
      setAggCache("u1", `synthetic-key-${i}`, data(`d${i}`), "w1");
    }
    expect(getAggCache("u1", "synthetic-key-0", "w1")).toBeNull();
    expect(getAggCache("u1", "synthetic-key-259", "w1")).toEqual(data("d259"));
  });

  it("clearCache empties everything", () => {
    setAggCache("u1", keyFor("none"), data("x"), "w1");
    clearCache();
    expect(getAggCache("u1", keyFor("none"), "w1")).toBeNull();
  });
});
