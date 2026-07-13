/**
 * Labour-only work order line helpers.
 *
 * Labour lines are stored as first-class columns on CnWorkOrderLine
 * (lineType = "labour", lineDate, activityName, workCategoryId) plus a
 * `labourCounts` JSON column holding an array of { type, count } — one entry
 * per selected trade. JSON (rather than a column per trade) means new labour
 * types never require a schema change. The line's `quantity` column mirrors the
 * sum of those counts. BOQ-only columns (boqItemId, uomId, negotiatedRate,
 * amount) are left empty/zero for labour rows.
 */

export interface LabourTypeCount {
  type: string;
  count: string;
}

/** Shape stored in the `labourCounts` JSON column. */
export interface LabourCountEntry {
  type: string;
  count: number;
}

export interface LabourScopeLine {
  lineDate: string;
  activityName: string;
  description: string;
  workCategoryId: string;
  labourTypes: LabourTypeCount[];
}

export function isLabourWorkType(workType: string | null | undefined): boolean {
  return (workType ?? "").trim().toLowerCase() === "labour only";
}

export function newLabourScopeLine(): LabourScopeLine {
  return {
    lineDate: "",
    activityName: "",
    description: "",
    workCategoryId: "",
    labourTypes: [],
  };
}

export function sumLabourQty(labourTypes: LabourTypeCount[]): number {
  return labourTypes.reduce((sum, lt) => sum + (parseFloat(lt.count) || 0), 0);
}

/** Parse the raw `labourCounts` JSON value into the UI's {type, count}[] list. */
export function parseLabourCounts(raw: unknown): LabourTypeCount[] {
  if (!Array.isArray(raw)) return [];
  const out: LabourTypeCount[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { type, count } = entry as { type?: unknown; count?: unknown };
    if (typeof type !== "string" || !type) continue;
    out.push({ type, count: count != null ? String(count) : "" });
  }
  return out;
}

/** Build the `labourCounts` JSON value from the UI's {type, count}[] list. */
export function toLabourCounts(
  labourTypes: LabourTypeCount[],
): LabourCountEntry[] {
  return labourTypes
    .filter((lt) => lt.type && (parseFloat(lt.count) || 0) > 0)
    .map((lt) => ({ type: lt.type, count: parseFloat(lt.count) || 0 }));
}

export function labourLineFromWoItem(item: {
  lineDate?: string | Date | null;
  activityName?: string | null;
  description?: string | null;
  workCategoryId?: string | null;
  labourCounts?: unknown;
}): LabourScopeLine {
  return {
    lineDate: item.lineDate ? String(item.lineDate).slice(0, 10) : "",
    activityName: item.activityName ?? "",
    description: item.description ?? "",
    workCategoryId: item.workCategoryId ?? "",
    labourTypes: parseLabourCounts(item.labourCounts),
  };
}

export function labourLineToBoqItem(line: LabourScopeLine) {
  const qty = sumLabourQty(line.labourTypes);
  return {
    lineType: "labour",
    lineDate: line.lineDate || null,
    activityName: line.activityName.trim(),
    description: line.description.trim(),
    workCategoryId: line.workCategoryId,
    labourCounts: toLabourCounts(line.labourTypes),
    // BOQ-only fields — unused for labour lines.
    boqItemId: "",
    boqNo: "",
    uomCode: "",
    quantity: qty,
    rate: 0,
    amount: 0,
  };
}
