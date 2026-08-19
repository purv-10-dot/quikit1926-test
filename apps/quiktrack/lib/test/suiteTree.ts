import { groupSections, type SectionLike } from "./caseSelection";

/**
 * Counting helpers for the suites-and-folders sidebar.
 *
 * Pure functions in `lib/` rather than inside the component so the arithmetic is
 * testable: a wrong count does not throw, it just shows a different number, and
 * the sidebar's badges are what a QA lead reads before building a run.
 */

export interface SuiteLike {
  sections: Array<SectionLike & { caseCount?: number }>;
}

/** Total cases in a suite — the sum over ALL its folders, nested included. */
export function suiteCaseCount(suite: SuiteLike): number {
  return suite.sections.reduce((sum, s) => sum + (s.caseCount ?? 0), 0);
}

/**
 * Folders that cannot be reached from the suite root, i.e. whose `parentId` points
 * at a row that no longer exists.
 *
 * They still contribute to `suiteCaseCount`, so without surfacing them the badge
 * would silently disagree with the folders on screen. Walks with a seen-set:
 * `parentId` is user-editable and a cycle must not hang the sidebar (same stance as
 * `sectionTree.ts`).
 */
export function orphanFolderCount(suite: SuiteLike): number {
  const byParent = groupSections(suite.sections);
  const seen = new Set<string>();
  const stack: Array<string | null> = [null];

  while (stack.length > 0) {
    const parentId = stack.pop() as string | null;
    for (const node of byParent.get(parentId) ?? []) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      stack.push(node.id);
    }
  }

  return suite.sections.length - seen.size;
}
