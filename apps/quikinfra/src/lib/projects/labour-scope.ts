/**
 * Labour-only work order line helpers.
 *
 * The WO line schema stores BOQ-backed scope. For Labour Only WOs we encode
 * work category + labour types + date in `boqItemId` and keep activity name +
 * description in `description` (JSON) so no schema migration is required.
 */

const LABOUR_DESC_PREFIX = '{"activityName":';

export interface LabourScopeLine {
  lineDate: string;
  activityName: string;
  description: string;
  workCategoryId: string;
  labourName: string;
  labourTypes: string[];
  labourQty: string;
}

const LABOUR_PREFIX = "LABOUR:";

export function isLabourWorkType(workType: string | null | undefined): boolean {
  return (workType ?? "").trim().toLowerCase() === "labour only";
}

function encodeLabourDescription(line: LabourScopeLine): string {
  return JSON.stringify({
    activityName: line.activityName.trim(),
    description: line.description.trim(),
    labourName: line.labourName.trim(),
  });
}

function decodeLabourDescription(raw: string | null | undefined): Pick<
  LabourScopeLine,
  "activityName" | "description" | "labourName"
> {
  const text = (raw ?? "").trim();
  if (!text) return { activityName: "", description: "", labourName: "" };
  if (text.startsWith(LABOUR_DESC_PREFIX)) {
    try {
      const parsed = JSON.parse(text) as {
        activityName?: string;
        description?: string;
        labourName?: string;
      };
      return {
        activityName: parsed.activityName ?? "",
        description: parsed.description ?? "",
        labourName: parsed.labourName ?? "",
      };
    } catch {
      // Fall through — legacy plain-text activity name.
    }
  }
  return { activityName: text, description: "", labourName: "" };
}

export function newLabourScopeLine(): LabourScopeLine {
  return {
    lineDate: "",
    activityName: "",
    description: "",
    workCategoryId: "",
    labourName: "",
    labourTypes: [],
    labourQty: "",
  };
}

export function encodeLabourBoqItemId(line: LabourScopeLine): string {
  const types = line.labourTypes.join("|");
  const base = `${LABOUR_PREFIX}${line.workCategoryId}:${types}`;
  return line.lineDate ? `${base}@${line.lineDate}` : base;
}

export function decodeLabourBoqItemId(boqItemId: string): Pick<
  LabourScopeLine,
  "workCategoryId" | "labourTypes" | "lineDate"
> {
  if (!boqItemId.startsWith(LABOUR_PREFIX)) {
    return { workCategoryId: "", labourTypes: [], lineDate: "" };
  }
  const rest = boqItemId.slice(LABOUR_PREFIX.length);
  const colonIdx = rest.indexOf(":");
  if (colonIdx === -1) {
    return { workCategoryId: rest, labourTypes: [], lineDate: "" };
  }
  const workCategoryId = rest.slice(0, colonIdx);
  const afterCategory = rest.slice(colonIdx + 1);
  const atIdx = afterCategory.lastIndexOf("@");
  const labourTypesPart =
    atIdx === -1 ? afterCategory : afterCategory.slice(0, atIdx);
  const lineDate = atIdx === -1 ? "" : afterCategory.slice(atIdx + 1);
  const labourTypes = labourTypesPart
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  return { workCategoryId, labourTypes, lineDate };
}

export function labourLineFromWoItem(item: {
  boqItemId?: string | null;
  boqNo?: string | null;
  description?: string | null;
  quantity?: number | string | null;
  uomCode?: string | null;
  uomId?: string | null;
}): LabourScopeLine {
  const boqKey = item.boqItemId ?? item.boqNo ?? "";
  const meta = decodeLabourBoqItemId(String(boqKey));
  const desc = decodeLabourDescription(item.description);
  return {
    lineDate: meta.lineDate,
    activityName: desc.activityName,
    description: desc.description,
    workCategoryId: meta.workCategoryId,
    labourName: desc.labourName,
    labourTypes: meta.labourTypes,
    labourQty: item.quantity != null ? String(item.quantity) : "",
  };
}

export function labourLineToBoqItem(line: LabourScopeLine) {
  const qty = parseFloat(line.labourQty) || 0;
  return {
    boqItemId: encodeLabourBoqItemId(line),
    boqNo: encodeLabourBoqItemId(line),
    description: encodeLabourDescription(line),
    uomCode: "",
    quantity: qty,
    rate: 0,
    amount: 0,
  };
}
