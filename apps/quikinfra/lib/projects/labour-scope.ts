/**
 * Labour-only work order line helpers.
 *
 * A labour line is stored on CnWorkOrderLine as lineType="labour" with
 * lineDate, activityName, description, workCategoryId (group), labourCategoryId
 * (labour category), labourCount (workers), quantity (= days), negotiatedRate
 * (rate/day). Amount = count × days × rate. BOQ-only columns (boqItemId, uomId)
 * are empty for labour.
 */

export interface LabourScopeLine {
  lineDate: string;
  activityName: string;
  description: string;
  workCategoryId: string;
  labourCategoryId: string;
  count: string;
  days: string;
  rate: string;
}

export function isLabourWorkType(workType: string | null | undefined): boolean {
  return (workType ?? "").trim().toLowerCase() === "labour only";
}

export function labourLineAmount(line: LabourScopeLine): number {
  return (parseFloat(line.count) || 0) * (parseFloat(line.days) || 0) * (parseFloat(line.rate) || 0);
}

export function newLabourScopeLine(): LabourScopeLine {
  return {
    lineDate: "",
    activityName: "",
    description: "",
    workCategoryId: "",
    labourCategoryId: "",
    count: "",
    days: "",
    rate: "",
  };
}

export function labourLineFromWoItem(item: {
  lineDate?: string | Date | null;
  activityName?: string | null;
  description?: string | null;
  workCategoryId?: string | null;
  labourCategoryId?: string | null;
  labourCount?: string | number | null;
  quantity?: string | number | null;
  rate?: string | number | null;
  negotiatedRate?: string | number | null;
}): LabourScopeLine {
  const rate = item.rate ?? item.negotiatedRate;
  return {
    lineDate: item.lineDate ? String(item.lineDate).slice(0, 10) : "",
    activityName: item.activityName ?? "",
    description: item.description ?? "",
    workCategoryId: item.workCategoryId ?? "",
    labourCategoryId: item.labourCategoryId ?? "",
    count: item.labourCount != null ? String(item.labourCount) : "",
    days: item.quantity != null ? String(item.quantity) : "",
    rate: rate != null ? String(rate) : "",
  };
}

export function labourLineToBoqItem(line: LabourScopeLine) {
  const count = parseFloat(line.count) || 0;
  const days = parseFloat(line.days) || 0;
  const rate = parseFloat(line.rate) || 0;
  return {
    lineType: "labour",
    lineDate: line.lineDate || null,
    activityName: line.activityName.trim(),
    description: line.description.trim(),
    workCategoryId: line.workCategoryId,
    labourCategoryId: line.labourCategoryId || null,
    labourCount: count,
    // BOQ-only fields — unused for labour lines.
    boqItemId: "",
    boqNo: "",
    uomCode: "DAY",
    quantity: days,
    rate,
    amount: count * days * rate,
  };
}
