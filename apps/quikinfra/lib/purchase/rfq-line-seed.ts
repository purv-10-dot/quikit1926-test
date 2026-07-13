/**
 * Maps a source Indent's lines into the seeded RFQ line-grid rows used by
 * the "New RFQ" drawer.
 *
 * Kept pure (no React / item-master deps — the caller passes a `resolve`
 * closure) so the Indent → RFQ link (`sourceIndentLineId`) is unit-testable
 * in isolation. Dropping that field is what left every RFQ-sourced PO with a
 * null indent link, which broke the PR → Indent → PO rollup and left the
 * source PR / Indent stuck reading "Not ordered".
 */

export interface IndentSeedLine {
  id?: string | null;
  lineId?: string | null;
  qtyRequested?: number | string | null;
  indentedQty?: number | string | null;
  quantity?: number | string | null;
  uomCode?: string | null;
}

/** Item-master resolution for one indent line, produced by the caller. */
export interface ResolvedSeedItem {
  itemId: string;
  prefillGroupId: string;
  uomCode: string;
}

export interface SeededRfqLine {
  itemId: string;
  prefillGroupId: string;
  quantity: string;
  uomCode: string;
  /** The indent line's id — carries the chain link through to the PO. */
  sourceIndentLineId: string | null;
}

export function buildRfqLinesFromIndent<T extends IndentSeedLine>(
  lines: T[] | null | undefined,
  resolve: (line: T) => ResolvedSeedItem,
): SeededRfqLine[] {
  return (lines ?? []).map((l) => {
    const r = resolve(l);
    return {
      itemId: r.itemId,
      prefillGroupId: r.prefillGroupId,
      quantity: String(l.qtyRequested ?? l.indentedQty ?? l.quantity ?? ""),
      uomCode: l.uomCode ?? r.uomCode ?? "",
      sourceIndentLineId: l.id ?? l.lineId ?? null,
    };
  });
}
