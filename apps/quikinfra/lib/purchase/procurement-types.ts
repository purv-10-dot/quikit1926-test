/**
 * Downstream procurement status for a single requirement line — used by
 * the PR and Indent detail views to answer "have we ordered this?" and
 * "has it arrived?". Kept free of server imports so the client-facing
 * detail types can reference it without pulling `db` into the bundle.
 */

export interface PoRef {
  id: string;
  poNumber: string;
  status: string;
}

export interface GrnRef {
  id: string;
  grnNumber: string;
  status: string;
}

export interface LineProcurement {
  /** Sum of ordered qty across every PO line linked to this requirement. */
  orderedQty: number;
  /** Sum of received qty across those PO lines (from approved GRNs). */
  receivedQty: number;
  poStatus: "none" | "ordered";
  grnStatus: "none" | "partial" | "received";
  poRefs: PoRef[];
  grnRefs: GrnRef[];
}
