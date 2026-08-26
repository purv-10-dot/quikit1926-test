import { describe, expect, it } from "vitest";
import { orphanFolderCount, suiteCaseCount } from "@/lib/test/suiteTree";

/**
 * Sidebar badge arithmetic.
 *
 * The suites-and-folders sidebar shows a per-suite total beside per-folder counts.
 * A wrong total does not throw — it just displays a different number — and these
 * badges are what a QA lead reads before building a run, so the maths is pinned
 * here rather than left inside the component.
 */

const suite = {
  sections: [
    { id: "a", parentId: null, caseCount: 1 },
    { id: "b", parentId: null, caseCount: 2 },
    { id: "c", parentId: "b", caseCount: 3 },
    { id: "d", parentId: null, caseCount: 0 },
  ],
};

describe("suiteCaseCount", () => {
  it("sums every folder, nested included", () => {
    expect(suiteCaseCount(suite)).toBe(6);
  });

  it("treats a missing count as 0 rather than NaN", () => {
    expect(suiteCaseCount({ sections: [{ id: "x", parentId: null }] })).toBe(0);
  });

  it("is 0 for a suite with no folders", () => {
    expect(suiteCaseCount({ sections: [] })).toBe(0);
  });

  it("counts an empty folder as 0, not as absent", () => {
    expect(
      suiteCaseCount({ sections: [{ id: "x", parentId: null, caseCount: 0 }] }),
    ).toBe(0);
  });
});

describe("orphanFolderCount", () => {
  it("is 0 when every folder is reachable from the root", () => {
    expect(orphanFolderCount(suite)).toBe(0);
  });

  it("counts a folder whose parent no longer exists", () => {
    // Such a folder still contributes to suiteCaseCount but cannot be rendered
    // anywhere in the tree, so the badge would disagree with the screen.
    const broken = {
      sections: [
        { id: "a", parentId: null, caseCount: 1 },
        { id: "z", parentId: "deleted-row", caseCount: 5 },
      ],
    };
    expect(orphanFolderCount(broken)).toBe(1);
    expect(suiteCaseCount(broken)).toBe(6);
  });

  it("counts a whole orphaned subtree", () => {
    const broken = {
      sections: [
        { id: "z", parentId: "gone", caseCount: 1 },
        { id: "y", parentId: "z", caseCount: 1 },
      ],
    };
    expect(orphanFolderCount(broken)).toBe(2);
  });

  it("terminates on a parentId cycle instead of hanging", () => {
    // parentId is user-editable, so corrupt data must not lock the sidebar.
    const cyclic = {
      sections: [
        { id: "a", parentId: "b" },
        { id: "b", parentId: "a" },
      ],
    };
    // Neither is reachable from the root, so both are orphans — and critically,
    // this returns at all.
    expect(orphanFolderCount(cyclic)).toBe(2);
  });

  it("is 0 for an empty suite", () => {
    expect(orphanFolderCount({ sections: [] })).toBe(0);
  });
});
