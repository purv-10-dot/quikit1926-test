/**
 * Folder → case selection maths for the "Include Test Cases" picker
 * (QUIKTR-337).
 *
 * Lives in `lib/test/` rather than inside the component so it can be tested
 * directly: getting this wrong does not throw, it silently builds a run over the
 * wrong set of cases, which is the kind of bug nobody notices until a release
 * ships untested.
 */

export interface SectionLike {
  id: string;
  parentId: string | null;
}

export interface CaseLike {
  id: string;
  sectionId: string;
}

/** Sections grouped by parent id (null = root). */
export function groupSections<T extends SectionLike>(
  sections: T[],
): Map<string | null, T[]> {
  const map = new Map<string | null, T[]>();
  for (const s of sections) {
    const key = s.parentId ?? null;
    const list = map.get(key);
    if (list) list.push(s);
    else map.set(key, [s]);
  }
  return map;
}

/** Cases grouped by their section id. */
export function groupCases<T extends CaseLike>(cases: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const c of cases) {
    const list = map.get(c.sectionId);
    if (list) list.push(c);
    else map.set(c.sectionId, [c]);
  }
  return map;
}

/**
 * Every case id at or below `sectionId`.
 *
 * Iterative with a seen-set: `parentId` is user-editable, so a cycle from
 * corrupt data must not hang the picker (the same defensive stance as
 * `sectionTree.ts`). A cycle yields the reachable cases once each rather than
 * looping forever.
 */
export function descendantCaseIds(
  sectionId: string,
  byParent: Map<string | null, SectionLike[]>,
  bySection: Map<string, CaseLike[]>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const stack = [sectionId];

  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const c of bySection.get(id) ?? []) out.push(c.id);
    for (const child of byParent.get(id) ?? []) stack.push(child.id);
  }
  return out;
}

export type TickState = "none" | "some" | "all";

/**
 * Whether a folder reads as unticked, indeterminate, or fully ticked.
 *
 * An EMPTY folder is "none", never "all": `picked === total` is trivially true
 * at 0, which would render an empty folder as fully selected.
 */
export function tickState(all: string[], selected: Set<string>): TickState {
  if (all.length === 0) return "none";
  let picked = 0;
  for (const id of all) if (selected.has(id)) picked++;
  if (picked === 0) return "none";
  return picked === all.length ? "all" : "some";
}

/** Adds or removes `ids` from the selection, returning a new Set. */
export function applyTick(
  selected: Set<string>,
  ids: string[],
  on: boolean,
): Set<string> {
  const next = new Set(selected);
  for (const id of ids) {
    if (on) next.add(id);
    else next.delete(id);
  }
  return next;
}
