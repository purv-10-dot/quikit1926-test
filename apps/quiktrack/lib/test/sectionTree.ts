/**
 * QuikTest — section tree invariants.
 *
 * The section tree is an adjacency list (`parentId`), which SQL cannot
 * constrain against cycles: reparenting A under its own descendant produces a
 * detached loop that is invisible to every FK and CHECK, and then any recursive
 * read hangs. So the guard lives here, and it is a hard requirement on every
 * reparent (TM-2.2: "Reparent creating a cycle -> 400").
 *
 * Pure functions over a parent map so they are unit-testable without a DB.
 */

/** `id → parentId` (null = root). Only needs the sections of one suite. */
export type ParentMap = ReadonlyMap<string, string | null>;

/**
 * Walks from `startId` to the root, yielding each ancestor id.
 *
 * Defensive against a pre-existing cycle in the data (which would otherwise
 * spin forever): a visited set caps the walk at the number of nodes.
 */
export function ancestorsOf(parents: ParentMap, startId: string): string[] {
  const chain: string[] = [];
  const seen = new Set<string>([startId]);

  let cursor = parents.get(startId) ?? null;
  while (cursor !== null && cursor !== undefined) {
    if (seen.has(cursor)) break; // corrupt data — stop rather than loop
    seen.add(cursor);
    chain.push(cursor);
    cursor = parents.get(cursor) ?? null;
  }
  return chain;
}

/**
 * True when making `newParentId` the parent of `sectionId` would create a cycle.
 *
 * Two ways that happens:
 *   1. the section becomes its own parent, or
 *   2. the proposed parent is a DESCENDANT of the section — detected by walking
 *      up from the parent and finding the section in its ancestry.
 */
export function wouldCreateCycle(
  parents: ParentMap,
  sectionId: string,
  newParentId: string | null,
): boolean {
  if (newParentId === null) return false; // moving to root is always safe
  if (newParentId === sectionId) return true;
  return ancestorsOf(parents, newParentId).includes(sectionId);
}

/**
 * Depth of a section, root = 0. Used to keep the UI tree renderable and to
 * reject pathological nesting; the product allows "unlimited" depth, so the cap
 * is a sanity limit, not a modelling constraint.
 */
export function depthOf(parents: ParentMap, sectionId: string): number {
  return ancestorsOf(parents, sectionId).length;
}

/** Ids of `rootId` and everything beneath it, parents before children. */
export function subtreeIds(parents: ParentMap, rootId: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const [id, parentId] of parents) {
    if (parentId === null || parentId === undefined) continue;
    const siblings = childrenOf.get(parentId);
    if (siblings) siblings.push(id);
    else childrenOf.set(parentId, [id]);
  }

  const out: string[] = [];
  const stack = [rootId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue; // corrupt data guard
    seen.add(id);
    out.push(id);
    const kids = childrenOf.get(id);
    if (kids) stack.push(...kids);
  }
  return out;
}

/**
 * Same cycle question for case-to-case dependencies, which have the identical
 * shape (a case may not transitively require itself).
 *
 * `edges` maps a case id to the ids it already depends on.
 */
export function dependencyWouldCycle(
  edges: ReadonlyMap<string, readonly string[]>,
  caseId: string,
  dependsOnCaseId: string,
): boolean {
  if (caseId === dependsOnCaseId) return true;

  // Can we already reach `caseId` from `dependsOnCaseId`? If so, adding the new
  // edge closes a loop.
  const stack = [dependsOnCaseId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === caseId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(edges.get(current) ?? []));
  }
  return false;
}
