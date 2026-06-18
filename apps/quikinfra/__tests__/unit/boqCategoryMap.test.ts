import { describe, it, expect } from "vitest";
import {
  resolveCategory,
  shouldIgnoreSheet,
  CANONICAL_CATEGORIES,
} from "@/lib/boq/import/category-map";

describe("shouldIgnoreSheet", () => {
  it("ignores instructions / cover / reference / summary / notes / index / toc tabs", () => {
    expect(shouldIgnoreSheet("Instructions")).toBe(true);
    expect(shouldIgnoreSheet("instruction")).toBe(true);
    expect(shouldIgnoreSheet("Quick Reference")).toBe(true);
    expect(shouldIgnoreSheet("Quick_Reference")).toBe(true);
    expect(shouldIgnoreSheet("Summary")).toBe(true);
    expect(shouldIgnoreSheet("Notes")).toBe(true);
    expect(shouldIgnoreSheet("Cover")).toBe(true);
    expect(shouldIgnoreSheet("Index")).toBe(true);
    expect(shouldIgnoreSheet("TOC")).toBe(true);
  });
  it("does not ignore real data sheets", () => {
    expect(shouldIgnoreSheet("Civil")).toBe(false);
    expect(shouldIgnoreSheet("Summary of Works")).toBe(false); // exact match required
  });
});

describe("resolveCategory — known buckets", () => {
  it("maps civil variants", () => {
    expect(resolveCategory("Civil").canonical).toBe(CANONICAL_CATEGORIES.CIVIL);
    expect(resolveCategory("Civil_Building").canonical).toBe(CANONICAL_CATEGORIES.CIVIL);
    expect(resolveCategory("Building Works").canonical).toBe(CANONICAL_CATEGORIES.CIVIL);
    expect(resolveCategory("structural").matched).toBe(true);
  });
  it("maps electrical variants including prefix 'ele'", () => {
    expect(resolveCategory("Ele,").canonical).toBe(CANONICAL_CATEGORIES.ELECTRICAL);
    expect(resolveCategory("Electrical").canonical).toBe(CANONICAL_CATEGORIES.ELECTRICAL);
    expect(resolveCategory("electricals").matched).toBe(true);
  });
  it("maps road variants", () => {
    expect(resolveCategory("Road Works").canonical).toBe(CANONICAL_CATEGORIES.ROAD);
    expect(resolveCategory("Highway").canonical).toBe(CANONICAL_CATEGORIES.ROAD);
    expect(resolveCategory("pavement").matched).toBe(true);
  });
  it("sets matched=true and preserves the raw source name", () => {
    const m = resolveCategory("  Civil_Building  ");
    expect(m.matched).toBe(true);
    expect(m.source).toBe("Civil_Building");
  });
});

describe("resolveCategory — passthrough", () => {
  it("returns the trimmed raw name with matched=false for unknown disciplines", () => {
    const m = resolveCategory("HVAC");
    expect(m.matched).toBe(false);
    expect(m.canonical).toBe("HVAC");
    expect(m.source).toBe("HVAC");
  });
  it("falls back to 'Uncategorised' for an empty / null sheet name", () => {
    expect(resolveCategory("").canonical).toBe("Uncategorised");
    // @ts-expect-error testing nullish input
    expect(resolveCategory(null).canonical).toBe("Uncategorised");
  });
});
