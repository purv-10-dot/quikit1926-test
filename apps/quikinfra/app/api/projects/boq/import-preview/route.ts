import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextResponse } from "next/server";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import * as XLSX from "xlsx";

const withOrgAuth = withOrgAuthForModule("projects");

/**
 * POST /api/projects/boq/import-preview
 * multipart/form-data with field "file" (.xlsx / .csv)
 *
 * Expected columns (case-insensitive):
 *   Code, Description, Kind (item|group), UOM, Quantity, Rate, GST, Group
 *
 * Returns a parsed rows preview without persisting. User confirms, then calls
 * /import-commit with the sanitized rows + target project/boq info.
 */
export const POST = withOrgAuth(async (_ctx, req) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: "Missing file upload (field 'file')" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  let parsedRows: Array<Record<string, unknown>>;
  try {
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    parsedRows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: `Parse error: ${err instanceof Error ? err.message : String(err)}` }, { status: 400 });
  }

  // Normalize: lowercase keys
  const normalized = parsedRows.map((r, idx) => {
    const m: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) m[k.toString().trim().toLowerCase()] = v;
    const kind = String(m["kind"] ?? "item").toLowerCase().trim() === "group" ? "group" : "item";
    const description = (m["description"] ?? m["item"] ?? "").toString().trim();
    const code = m["code"] != null ? String(m["code"]).trim() : null;
    const uomCode = m["uom"] != null ? String(m["uom"]).trim() : null;
    const group = m["group"] != null ? String(m["group"]).trim() : null;
    const quantity = kind === "item" && m["quantity"] != null ? Number(m["quantity"]) : null;
    const rate = kind === "item" && m["rate"] != null ? Number(m["rate"]) : null;
    const gstRate = m["gst"] != null ? Number(m["gst"]) : null;

    const errors: string[] = [];
    if (!description) errors.push("description is required");
    if (kind === "item" && (quantity == null || !Number.isFinite(quantity) || quantity <= 0)) {
      errors.push("quantity required (> 0)");
    }
    if (kind === "item" && (rate == null || !Number.isFinite(rate) || rate < 0)) {
      errors.push("rate required (>= 0)");
    }
    if (kind === "item" && !uomCode) errors.push("uom required");

    return {
      rowIndex: idx + 2, // +2 because row 1 is header, index is 0-based
      kind,
      code,
      description,
      uomCode,
      group,
      quantity,
      rate,
      gstRate,
      errors,
    };
  });

  const summary = {
    total: normalized.length,
    valid: normalized.filter((r) => r.errors.length === 0).length,
    invalid: normalized.filter((r) => r.errors.length > 0).length,
    items: normalized.filter((r) => r.kind === "item" && r.errors.length === 0).length,
    groups: normalized.filter((r) => r.kind === "group").length,
  };
  return NextResponse.json({ success: true, summary, rows: normalized });
}, { permission: { resource: "construction.boq", action: "import" } });
