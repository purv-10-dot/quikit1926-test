import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  validateMobile,
  normalizeMobile,
  validateEmail,
  normalizeEmail,
  validateGSTIN,
  validatePAN,
  validateRequired,
  validateIFSC,
} from "@/lib/validators";
import {
  listContractors,
  countContractors,
  createContractor,
} from "@/lib/masters/contractors-repository";
import { parsePagination, paginateDb, parseSort } from "@/lib/http/pagination";

/**
 * GET  /api/masters/contractors — list tenant contractors (seeded on first call).
 * POST /api/masters/contractors — create a contractor.
 */

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("construction.master_contractor", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const statusParam = (searchParams.get("status") ?? "").toLowerCase();
  const status: "active" | "inactive" | "all" | undefined =
    statusParam === "active" ? "active"
    : statusParam === "inactive" ? "inactive"
    : statusParam === "all" ? "all"
    : undefined;

  const baseOpts = {
    orgId: ctx.orgId,
    createdBy: ctx.userId,
    search,
    status,
  };
  const { orderBy } = parseSort(
    searchParams,
    ["code", "name", "gstin", "contactPerson", "phone", "specialization", "status", "createdAt"],
    { field: "createdAt", order: "desc" },
  );
  const result = await paginateDb(
    parsePagination(req),
    (paging) => listContractors({ ...baseOpts, ...paging, orderBy }),
    () => countContractors(baseOpts),
  );
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("construction.master_contractor", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "master.contractor", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for master.contractor`, 403);
  }

  const body = await req.json();

  const nameCheck = validateRequired(body.name, "Contractor Name");
  if (!nameCheck.valid) {
    return NextResponse.json({ error: nameCheck.error }, { status: 400 });
  }

  const phone = body.phone ?? body.mobile ?? "";
  if (phone) {
    const r = validateMobile(phone);
    if (!r.valid) return NextResponse.json({ error: r.error }, { status: 400 });
  }
  if (body.email) {
    const r = validateEmail(body.email);
    if (!r.valid) return NextResponse.json({ error: r.error }, { status: 400 });
  }
  if (body.gstin) {
    const r = validateGSTIN(body.gstin);
    if (!r.valid) return NextResponse.json({ error: r.error }, { status: 400 });
  }
  if (body.pan) {
    const r = validatePAN(body.pan);
    if (!r.valid) return NextResponse.json({ error: r.error }, { status: 400 });
  }
  if (body.ifscCode) {
    const r = validateIFSC(body.ifscCode);
    if (!r.valid) return NextResponse.json({ error: r.error }, { status: 400 });
  }

  try {
    const record = await createContractor({
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      name: String(body.name).trim(),
      legalName: body.legalName,
      contactPerson: body.contactPerson,
      phone: phone ? normalizeMobile(phone) : undefined,
      email: body.email ? normalizeEmail(body.email) : undefined,
      gstin: body.gstin || undefined,
      pan: body.pan || undefined,
      address: body.address,
      city: body.city,
      state: body.state,
      licenseNo: body.licenseNo,
      specialization: body.specialization,
      bankName: body.bankName,
      branchName: body.branchName,
      accountNo: body.accountNo,
      ifscCode: body.ifscCode,
      accountType: body.accountType,
      status: body.status ?? "active",
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: unknown) {
    if (getErrorCode(err) === "P2002") {
      return NextResponse.json(
        { error: "A contractor with this code already exists" },
        { status: 409 },
      );
    }
    console.error("[contractors.create] failed:", err);
    return NextResponse.json(
      { error: toErrorMessage(err, "Failed to create contractor") },
      { status: 500 },
    );
  }
}
