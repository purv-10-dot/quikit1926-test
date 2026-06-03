import { requireStoreAction } from "@/lib/auth/requireStoreAction";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  createGatePass,
  listGatePasses,
  nextGatePassSequence,
} from "@/lib/store/gate-pass-repository";

/**
 * Gate Pass API — Postgres-backed via the repository.
 *
 * GET  /api/store/gate-passes
 *      ?status=…    filter (draft | pending_approval | approved | rejected | issued | closed | returned)
 *      ?type=…      filter (inward | outward | returnable | non_returnable)
 *      ?projectId=… filter by project
 *      ?search=…    substring match on gatePassNumber / projectName / vehicleNo / referenceNo
 *
 * POST /api/store/gate-passes
 *      Manual creation from Store → Gate Pass page.
 *      Auto-assigns `gatePassNumber` like GP-IN-<YY>-<seq> /
 *      GP-OUT-<YY>-<seq> per tenant + year + direction so IN and OUT
 *      counters run independently.
 */

function directionFromType(type: string): "IN" | "OUT" {
  return String(type ?? "").toLowerCase() === "inward" ? "IN" : "OUT";
}

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireStoreAction("construction.gatepass", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "";
  const type = searchParams.get("type") ?? "";
  const projectId = searchParams.get("projectId") ?? "";
  const search = searchParams.get("search") ?? "";

  const data = await listGatePasses(ctx.orgId, {
    status: status || null,
    type: type || null,
    projectId: projectId || null,
    search: search || null,
    allowedProjectIds: ctx.projectIds ?? null,
  });

  return NextResponse.json({ data, total: data.length });
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireStoreAction("construction.gatepass", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "store.gate_pass", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for store.gate_pass`, 403);
  }

  const body = await req.json();

  // Resolve the project so we can denormalise the name — optional for
  // gate-house entries that aren't tied to a specific project.
  let projectName: string | null = body.projectName ?? null;
  if (body.projectId && !projectName) {
    const p: any = await (db as any).cnProject.findFirst({
      where: {
        id: body.projectId,
        orgId: ctx.orgId,
      },
      select: { id: true, name: true },
    });
    projectName = p?.name ?? null;
  }

  const gatePassDateStr: string =
    body.gatePassDate ?? new Date().toISOString().slice(0, 10);
  const year4 = gatePassDateStr.slice(0, 4);
  const yy = year4.slice(-2);
  const direction = directionFromType(body.type);

  const seqNumber = await nextGatePassSequence(ctx.orgId, year4, direction);
  const seq = String(seqNumber).padStart(3, "0");
  const gatePassNumber =
    body.gatePassNumber ?? `GP-${direction}-${yy}-${seq}`;

  const lines: any[] = Array.isArray(body.lines) ? body.lines : [];

  const record = await createGatePass({
    orgId: ctx.orgId,
    createdBy: ctx.userId,
    gatePassNumber,
    type: body.type ?? "inward",
    projectId: body.projectId ?? null,
    projectName,
    locationId: body.locationId ?? null,
    locationName: body.locationName ?? null,
    gatePassDate: new Date(gatePassDateStr),
    expectedReturnDate: body.expectedReturnDate
      ? new Date(body.expectedReturnDate)
      : null,
    referenceType: body.referenceType ?? null,
    referenceNo: body.referenceNo ?? null,
    referenceId: body.referenceId ?? null,
    referenceNumber: body.referenceNumber ?? body.referenceNo ?? null,
    vehicleNo: body.vehicleNo ?? null,
    driverName: body.driverName ?? null,
    driverMobileNo: body.driverMobileNo ?? null,
    driverPhone: body.driverPhone ?? body.driverMobileNo ?? null,
    challanNo: body.challanNo ?? null,
    transactionAmount: body.transactionAmount ?? null,
    intercityTransfer:
      body.intercityTransfer === true || body.intercityTransfer === "true",
    ewayBillNo: body.ewayBillNo ?? null,
    securityGuard: body.securityGuard ?? null,
    materialCondition: body.materialCondition ?? null,
    weighbridgeReading: body.weighbridgeReading ?? null,
    vehiclePhoto: body.vehiclePhoto ?? null,
    purpose: body.purpose ?? null,
    remarks: body.remarks ?? null,
    authorizedById: body.authorizedById ?? ctx.userId,
    lines,
    status: body.status ?? "draft",
  });

  return NextResponse.json(record, { status: 201 });
}
