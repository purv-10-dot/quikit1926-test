/**
 * Builds the "Team: X · Owner: Y" style label shown on a filter button's
 * closed state. Generalizes the summary Dashboard originally built inline
 * for its Team-tab filter so every module's filter button can show what is
 * actually applied instead of a bare count.
 */

export interface FilterSummaryDimension {
  /** e.g. "Team", "Owner", "Status" */
  label: string;
  /**
   * Resolved display names currently selected for this dimension. Pass an
   * empty array when the dimension isn't filtering anything — including when
   * a "narrows only when partial" dimension (e.g. Status with every option
   * selected) is at its default, all-selected state. Dimensions with no
   * values are skipped entirely, never rendered as "Label: ".
   */
  values: string[];
}

export function buildFilterSummaryLabel(dimensions: FilterSummaryDimension[]): string {
  return dimensions
    .filter((d) => d.values.length > 0)
    .map((d) => `${d.label}: ${d.values.join(", ")}`)
    .join(" · ");
}
