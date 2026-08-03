import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenantContext } from "@/lib/auth/context";
import { generateDprPdf, type DprPdfInput } from "@/lib/projects/dpr-pdf";

/**
 * GET /api/projects/dpr/[id]/pdf
 *
 * Streams the full Daily Progress Report as `application/pdf` with an
 * `inline` disposition so the client opens it in a new tab. Mirrors the
 * Work Order preview route: fetch the DPR + all its section rows, resolve
 * the id → label lookups (BOQ nos, item/uom/contractor/location names),
 * then hand a flat, display-ready payload to `generateDprPdf`.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await getTenantContext();
  if (!auth) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const row = await db.cnDailyProgressReport.findFirst({
    where: { id: params.id, orgId: auth.orgId },
    include: {
      project: { select: { id: true, name: true } },
      workItems: true,
      labourEntries: true,
      machineryEntries: true,
      materialEntries: true,
      staffEntries: true,
    },
  });
  if (!row || row.status === "inactive") {
    return NextResponse.json({ error: "DPR not found" }, { status: 404 });
  }

  // ── Resolve id → label lookups in batch ──
  const boqIds = Array.from(
    new Set(row.workItems.map((w) => w.boqItemId).filter(Boolean)),
  ) as string[];
  const itemIds = Array.from(
    new Set(row.materialEntries.map((m) => m.itemId).filter(Boolean)),
  ) as string[];
  const uomIds = Array.from(
    new Set([
      ...row.workItems.map((w) => w.uomId),
      ...row.materialEntries.map((m) => m.uomId),
    ].filter(Boolean)),
  ) as string[];
  const contractorIds = Array.from(
    new Set(row.labourEntries.map((l) => l.contractorId).filter(Boolean)),
  ) as string[];
  // FREE_SCOPE work items anchor on an activity (scopeId) instead of a BOQ
  // item — boqItemId is null for these, so target qty must come from
  // CnActivityItem.scopeQty, not the BOQ lookup.
  const activityIds = Array.from(
    new Set(
      row.workItems
        .filter((w) => w.scopeType === "ACTIVITY")
        .map((w) => w.scopeId)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  );

  const [boqRows, itemRows, uomRows, contractorRows, locationRow, activityRows] =
    await Promise.all([
      boqIds.length
        ? db.cnBOQItemV2.findMany({
            where: { id: { in: boqIds }, orgId: auth.orgId },
            select: { id: true, boqNo: true, unit: true, scopeQty: true },
          })
        : Promise.resolve([]),
      itemIds.length
        ? db.cnItem.findMany({
            where: { id: { in: itemIds }, orgId: auth.orgId },
            select: { id: true, code: true, name: true },
          })
        : Promise.resolve([]),
      uomIds.length
        ? db.cnUOM.findMany({
            where: { id: { in: uomIds } },
            select: { id: true, code: true },
          })
        : Promise.resolve([]),
      contractorIds.length
        ? db.cnContractor.findMany({
            where: { id: { in: contractorIds }, orgId: auth.orgId },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      row.consumptionLocationId
        ? db.cnLocation.findFirst({
            where: { id: row.consumptionLocationId, orgId: auth.orgId },
            select: { name: true },
          })
        : Promise.resolve(null),
      activityIds.length
        ? db.cnActivityItem.findMany({
            where: { id: { in: activityIds }, orgId: auth.orgId },
            select: {
              id: true,
              activityCode: true,
              uomId: true,
              tenderQty: true,
              scopeQty: true,
            },
          })
        : Promise.resolve([]),
    ]);

  // Activity rows carry their own uomId, which is not on the work item —
  // resolve the codes the first uom query didn't already cover.
  const extraUomIds = Array.from(
    new Set(
      activityRows
        .map((a) => a.uomId)
        .filter((v): v is string => typeof v === "string" && v.length > 0 && !uomIds.includes(v)),
    ),
  );
  const extraUomRows = extraUomIds.length
    ? await db.cnUOM.findMany({
        where: { id: { in: extraUomIds } },
        select: { id: true, code: true },
      })
    : [];

  const boqNoById = new Map(boqRows.map((b) => [b.id, b.boqNo]));
  const boqUnitById = new Map(boqRows.map((b) => [b.id, b.unit ?? ""]));
  const boqScopeById = new Map(
    boqRows.map((b) => [b.id, Number(b.scopeQty?.toString?.() ?? 0) || 0]),
  );
  const itemNameById = new Map(
    itemRows.map((i) => [i.id, i.code ? `${i.code} — ${i.name}` : i.name]),
  );
  const uomById = new Map(
    [...uomRows, ...extraUomRows].map((u) => [u.id, u.code]),
  );
  const activityCodeById = new Map(activityRows.map((a) => [a.id, a.activityCode ?? ""]));
  const activityUnitById = new Map(
    activityRows.map((a) => [a.id, (a.uomId ? uomById.get(a.uomId) : "") ?? ""]),
  );
  // A revised scope qty supersedes the tender baseline — same precedence the
  // DPR read path applies, so the PDF and the edit form agree on the
  // denominator behind % Completed.
  const activityScopeById = new Map(
    activityRows.map((a) => {
      const revised = Number(a.scopeQty?.toString?.() ?? 0) || 0;
      return [a.id, revised > 0 ? revised : Number(a.tenderQty?.toString?.() ?? 0) || 0];
    }),
  );
  const contractorNameById = new Map(contractorRows.map((c) => [c.id, c.name]));

  const num = (v: unknown) => Number(v?.toString?.() ?? v ?? 0) || 0;

  const TRADES: Array<[string, keyof (typeof row.labourEntries)[number]]> = [
    ["Messan", "messan"],
    ["Male Helper", "maleHelper"],
    ["Female Helper", "femaleHelper"],
    ["Carpenter", "carpenter"],
    ["Fitter", "fitter"],
    ["Painter", "painter"],
    ["Plumber", "plumber"],
    ["Electrician", "electrician"],
    ["Operator", "operator"],
  ];

  const input: DprPdfInput = {
    dpr: {
      dprNumber: row.dprNumber,
      reportDate: row.reportDate?.toISOString?.().slice(0, 10) ?? null,
      projectName: row.project?.name ?? null,
      status: row.status ?? "draft",
      weather: row.weatherCondition ?? null,
      consumptionLocationName: locationRow?.name ?? null,
      siteRemarks: row.remarks ?? null,
    },
    workItems: row.workItems.map((w) => {
      const prev = num(w.cumulativeQty) - num(w.todayQty);
      const total = num(w.cumulativeQty);
      const isActivity = w.scopeType === "ACTIVITY";
      const scopeUnit = isActivity
        ? (w.scopeId ? activityUnitById.get(w.scopeId) : "")
        : (w.boqItemId ? boqUnitById.get(w.boqItemId) : "");
      const target = isActivity
        ? (w.scopeId ? activityScopeById.get(w.scopeId) ?? 0 : 0)
        : (w.boqItemId ? boqScopeById.get(w.boqItemId) ?? 0 : 0);
      return {
        boqNo:
          (isActivity
            ? (w.scopeId ? activityCodeById.get(w.scopeId) : "")
            : (w.boqItemId ? boqNoById.get(w.boqItemId) : "")) || "—",
        description: w.description ?? "",
        unit: scopeUnit || uomById.get(w.uomId ?? "") || "",
        prevQty: prev < 0 ? 0 : prev,
        todayQty: num(w.todayQty),
        totalTillDate: total,
        pctCompleted: target > 0 ? Math.min(100, (total / target) * 100) : 0,
        remarks: w.remarks ?? "",
      };
    }),
    materials: row.materialEntries.map((m) => ({
      name: (m.itemId ? itemNameById.get(m.itemId) : "") || m.itemId || "—",
      unit: uomById.get(m.uomId ?? "") ?? "",
      consumedQty: num(m.consumedQty),
      remarks: m.remarks ?? "",
    })),
    manpower: row.labourEntries.map((l) => {
      const tradeTotal = TRADES.reduce((s, [, key]) => s + num(l[key]), 0);
      return {
        contractor:
          (l.contractorId ? contractorNameById.get(l.contractorId) : "") ||
          l.category ||
          "Self",
        workingArea: l.workingArea ?? "",
        messan: num(l.messan),
        male: num(l.maleHelper),
        female: num(l.femaleHelper),
        carpenter: num(l.carpenter),
        fitter: num(l.fitter),
        painter: num(l.painter),
        plumber: num(l.plumber),
        electrician: num(l.electrician),
        operator: num(l.operator),
        total: tradeTotal > 0 ? tradeTotal : num(l.count),
      };
    }),
    staff: row.staffEntries.map((s) => ({
      name: s.name ?? "",
      designation: s.designation ?? "",
      present: s.present !== false,
      reason: s.reason ?? "",
    })),
    machinery: row.machineryEntries.map((m) => ({
      description: m.description ?? "",
      condition: m.condition ?? "",
      requiredQty: num(m.requiredQty),
      actualQty: num(m.actualQty),
      remarks: m.remarks ?? "",
    })),
  };

  const pdf = await generateDprPdf(input);
  const safeNo = String(row.dprNumber ?? "dpr").replace(/[^A-Za-z0-9_-]+/g, "_");
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeNo}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}