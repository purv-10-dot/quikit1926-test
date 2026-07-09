/**
 * Group DPR/RAB work items by their BOQ hierarchy.
 *
 * A saved work item only stores its leaf `boqItemId`; BOQ groups can nest
 * (e.g. B → B.3.1 → B.3.1.1), so we resolve the full ancestor-group chain
 * for each leaf from the project BOQ tree and cluster by the top-level
 * group, injecting indented sub-group headers above their line items.
 *
 * Shared by the DPR form (Work Done table) and the DPR detail page so both
 * render the identical grouped structure. The item type is generic — the
 * only field required is `boqItemId`; each rendered row keeps the original
 * item reference (`w`) and its index into the source array.
 */

import type { BoqTreeRow } from "@/lib/boq/tree-row";

export type WorkGroupRow<T> =
  | { kind: "subgroup"; no: string; name: string; depth: number }
  | { kind: "item"; w: T; idx: number; depth: number };

export interface WorkGroup<T> {
  key: string;
  topNo: string | null;
  topName: string;
  leafCount: number;
  rendered: WorkGroupRow<T>[];
}

export function groupWorkItemsByBoq<T extends { boqItemId?: string | null }>(
  items: T[],
  boqRows: BoqTreeRow[],
): WorkGroup<T>[] {
  const boqById = new Map<string, BoqTreeRow>();
  for (const r of boqRows) if (r.id) boqById.set(r.id, r);
  const boqByNo = new Map<string, BoqTreeRow>();
  for (const r of boqRows) boqByNo.set(r.boq_no ?? r.boqNo ?? "", r);

  // Ancestor groups for a leaf BOQ id, ordered top → immediate parent.
  const chainFor = (boqItemId: string) => {
    const chain: { no: string; name: string }[] = [];
    const guard = new Set<string>();
    let cur = boqById.get(boqItemId);
    while (cur) {
      const pNo = cur.parent_boq_no ?? cur.parentBoqNo ?? null;
      if (!pNo || guard.has(pNo)) break;
      guard.add(pNo);
      const pRow = boqByNo.get(pNo);
      chain.unshift({
        no: pNo,
        name: pRow?.display_name ?? pRow?.displayName ?? "",
      });
      if (!pRow) break;
      cur = pRow;
    }
    return chain;
  };

  // Cluster by the top-level ancestor, preserving first-appearance order.
  const groups: {
    key: string;
    topNo: string | null;
    topName: string;
    items: { w: T; idx: number; chain: { no: string; name: string }[] }[];
  }[] = [];
  const seen = new Map<string, number>();
  items.forEach((w, idx) => {
    const chain = chainFor(w.boqItemId ?? "");
    const topNo = chain.length ? chain[0].no : null;
    const key = topNo ?? "__ungrouped__";
    let pos = seen.get(key);
    if (pos === undefined) {
      pos = groups.length;
      seen.set(key, pos);
      groups.push({
        key,
        topNo,
        topName: chain.length ? chain[0].name : "",
        items: [],
      });
    }
    groups[pos].items.push({ w, idx, chain });
  });

  // Within each top group, flatten into a render list that injects a
  // sub-group header the first time a deeper ancestor (depth ≥ 1) appears.
  return groups.map((g) => {
    const rendered: WorkGroupRow<T>[] = [];
    const emitted = new Set<string>();
    let leafCount = 0;
    g.items.forEach(({ w, idx, chain }) => {
      for (let d = 1; d < chain.length; d++) {
        if (!emitted.has(chain[d].no)) {
          emitted.add(chain[d].no);
          rendered.push({
            kind: "subgroup",
            no: chain[d].no,
            name: chain[d].name,
            depth: d,
          });
        }
      }
      rendered.push({ kind: "item", w, idx, depth: chain.length });
      leafCount += 1;
    });
    return { key: g.key, topNo: g.topNo, topName: g.topName, leafCount, rendered };
  });
}