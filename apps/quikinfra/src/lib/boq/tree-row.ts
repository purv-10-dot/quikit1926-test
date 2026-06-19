/**
 * Raw BOQ tree row as returned by `GET /api/projects/[projectId]/boq`
 * (and the infinite/paged variant). The payload carries fields under BOTH
 * snake_case and camelCase depending on which layer serialised it, so every
 * field is optional and dual-named. Client consumers normalise this into
 * their own view-model (e.g. the cascading picker's `BoqRow`); this is the
 * shared *input* shape so they don't each redeclare it.
 */
export interface BoqTreeRow {
  id?: string;
  boq_no?: string;
  boqNo?: string;
  parent_boq_no?: string | null;
  parentBoqNo?: string | null;
  depth?: number;
  is_group?: boolean;
  isGroup?: boolean;
  display_name?: string;
  displayName?: string;
  description?: string;
  unit?: string | null;
  uomCode?: string | null;
  tender_qty?: number | string | null;
  tenderQty?: number | string | null;
  category?: string;
  scopeQty?: number | string;
  balanceQty?: number | string;
  done_qty?: number | string | null;
  balance_qty?: number | string | null;
  sort_order?: number;
  sortOrder?: number;
}
