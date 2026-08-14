import { describe, expect, it } from "vitest";
import {
  ancestorsOf,
  dependencyWouldCycle,
  depthOf,
  subtreeIds,
  wouldCreateCycle,
  type ParentMap,
} from "@/lib/test/sectionTree";

/**
 * TM-2.2 — the section tree's cycle guard.
 *
 * SQL cannot constrain an adjacency list against cycles, so this is the only
 * thing standing between a reparent and a detached loop that hangs every
 * recursive read. Worth over-testing.
 */

//   root
//    ├── a
//    │    ├── a1
//    │    └── a2
//    │         └── a2x
//    └── b
const TREE: ParentMap = new Map<string, string | null>([
  ["root", null],
  ["a", "root"],
  ["a1", "a"],
  ["a2", "a"],
  ["a2x", "a2"],
  ["b", "root"],
]);

describe("ancestorsOf", () => {
  it("walks from a leaf to the root", () => {
    expect(ancestorsOf(TREE, "a2x")).toEqual(["a2", "a", "root"]);
  });

  it("returns nothing for a root node", () => {
    expect(ancestorsOf(TREE, "root")).toEqual([]);
  });

  it("does not spin forever on pre-existing corrupt data", () => {
    // x → y → x is already invalid; the walk must terminate, not hang.
    const corrupt: ParentMap = new Map([
      ["x", "y"],
      ["y", "x"],
    ]);
    expect(ancestorsOf(corrupt, "x").length).toBeLessThanOrEqual(2);
  });

  it("stops at an unknown parent rather than throwing", () => {
    const orphan: ParentMap = new Map([["lonely", "ghost"]]);
    expect(ancestorsOf(orphan, "lonely")).toEqual(["ghost"]);
  });
});

describe("wouldCreateCycle", () => {
  it("rejects making a section its own parent", () => {
    expect(wouldCreateCycle(TREE, "a", "a")).toBe(true);
  });

  it("rejects moving a section under its own direct child", () => {
    expect(wouldCreateCycle(TREE, "a", "a1")).toBe(true);
  });

  it("rejects moving a section under a deep descendant", () => {
    // a → a2 → a2x; making a2x the parent of a closes the loop.
    expect(wouldCreateCycle(TREE, "a", "a2x")).toBe(true);
  });

  it("allows moving to an unrelated branch", () => {
    expect(wouldCreateCycle(TREE, "a1", "b")).toBe(false);
  });

  it("allows moving a subtree up to the root", () => {
    expect(wouldCreateCycle(TREE, "a2", null)).toBe(false);
  });

  it("allows moving a parent under a sibling of its own subtree", () => {
    expect(wouldCreateCycle(TREE, "a2", "a1")).toBe(false);
  });

  it("allows a no-op reparent to the current parent", () => {
    expect(wouldCreateCycle(TREE, "a1", "a")).toBe(false);
  });
});

describe("depthOf", () => {
  it("reports 0 for a root", () => {
    expect(depthOf(TREE, "root")).toBe(0);
  });

  it("counts every ancestor", () => {
    expect(depthOf(TREE, "a2x")).toBe(3);
  });
});

describe("subtreeIds", () => {
  it("includes the root and all descendants", () => {
    expect(subtreeIds(TREE, "a").sort()).toEqual(["a", "a1", "a2", "a2x"]);
  });

  it("returns just the node for a leaf", () => {
    expect(subtreeIds(TREE, "a2x")).toEqual(["a2x"]);
  });

  it("covers the whole tree from the root", () => {
    expect(subtreeIds(TREE, "root")).toHaveLength(6);
  });

  it("terminates on corrupt cyclic data", () => {
    const corrupt: ParentMap = new Map([
      ["x", "y"],
      ["y", "x"],
    ]);
    expect(subtreeIds(corrupt, "x").length).toBeLessThanOrEqual(2);
  });
});

describe("dependencyWouldCycle", () => {
  // c1 → c2 → c3  (c1 depends on c2, c2 depends on c3)
  const edges = new Map<string, readonly string[]>([
    ["c1", ["c2"]],
    ["c2", ["c3"]],
  ]);

  it("rejects a self-dependency", () => {
    expect(dependencyWouldCycle(edges, "c1", "c1")).toBe(true);
  });

  it("rejects a direct back-edge", () => {
    expect(dependencyWouldCycle(edges, "c2", "c1")).toBe(true);
  });

  it("rejects a transitive back-edge", () => {
    // c3 depending on c1 would close c1 → c2 → c3 → c1.
    expect(dependencyWouldCycle(edges, "c3", "c1")).toBe(true);
  });

  it("allows an unrelated new dependency", () => {
    expect(dependencyWouldCycle(edges, "c1", "c9")).toBe(false);
  });

  it("allows a diamond (shared prerequisite, no cycle)", () => {
    // c1 → c2 → c3 and c1 → c4; adding c4 → c3 is a diamond, not a loop.
    const diamond = new Map<string, readonly string[]>([
      ["c1", ["c2", "c4"]],
      ["c2", ["c3"]],
    ]);
    expect(dependencyWouldCycle(diamond, "c4", "c3")).toBe(false);
  });
});
