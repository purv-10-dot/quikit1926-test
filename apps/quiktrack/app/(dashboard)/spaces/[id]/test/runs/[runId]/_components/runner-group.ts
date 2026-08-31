import type { RunnerTest } from "./runner-types";

/** One folder's worth of tests, plus a pass/fail-style summary for its progress bar. */
export interface RunnerSectionGroup {
  sectionId: string;
  sectionName: string;
  tests: RunnerTest[];
}

/**
 * Groups tests by their case's folder (QUIKTR-341), preserving the order the API
 * already returned them in (sorted server-side) — grouping here is a pure
 * re-bucketing, not a second sort, so it must never reorder tests within a group
 * or reorder which group appears first.
 *
 * A run can be built from hand-picked cases across different suites/folders, not
 * just one suite — grouping by the case's OWN section handles that correctly,
 * since every case has exactly one folder regardless of which suite the run
 * pulled it from (owner-confirmed).
 */
export function groupBySection(tests: RunnerTest[]): RunnerSectionGroup[] {
  const order: string[] = [];
  const bySectionId = new Map<string, RunnerSectionGroup>();

  for (const t of tests) {
    const { id: sectionId, name: sectionName } = t.case.section;
    let group = bySectionId.get(sectionId);
    if (!group) {
      group = { sectionId, sectionName, tests: [] };
      bySectionId.set(sectionId, group);
      order.push(sectionId);
    }
    group.tests.push(t);
  }

  return order.map((id) => bySectionId.get(id)!);
}
