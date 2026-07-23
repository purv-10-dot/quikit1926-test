import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { err as envelopeErr } from "@/lib/http/envelope";
import { DomainError } from "@/lib/http";
import {
  listWorkmen,
  countWorkmen,
  createWorkman,
} from "@/lib/masters/workmen-repository";
import { parsePagination, paginateDb, parseSort } from "@/lib/http/pagination";

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const statusParam = (searchParams.get("status") ?? "").toLowerCase();
  const status: "active" | "inactive" | "all" | undefined =
    statusParam === "active" ? "active"
    : statusParam === "inactive" ? "inactive"
    : statusParam === "all" ? "all"
    : undefined;
  const baseOpts = {
    orgId: ctx.orgId,
    createdBy: ctx.userId,
    search: searchParams.get("search") ?? "",
    labourCategoryId: searchParams.get("labourCategoryId") ?? undefined,
    contractorId: searchParams.get("contractorId") ?? undefined,
    engagementType: searchParams.get("engagementType") ?? undefined,
    projectId: searchParams.get("projectId") ?? undefined,
    status,
  };

  const { orderBy } = parseSort(
    searchParams,
    ["workmanCode", "fullName", "engagementType", "status", "createdAt"],
    { field: "workmanCode", order: "asc" },
  );
  const result = await paginateDb(
    parsePagination(req),
    (paging) => listWorkmen({ ...baseOpts, ...paging, orderBy }),
    () => countWorkmen(baseOpts),
  );
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const body = await req.json();
  try {
    const record = await createWorkman({
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      fullName: body.fullName,
      labourCategoryId: body.labourCategoryId,
      engagementType: body.engagementType,
      contractorId: body.contractorId ?? null,
      fatherOrSpouse: body.fatherOrSpouse,
      gender: body.gender,
      dateOfBirth: body.dateOfBirth,
      phone: body.phone,
      photoFileId: body.photoFileId,
      idProofType: body.idProofType,
      idProofLast4: body.idProofLast4,
      dailyWage: body.dailyWage,
      bankAccountLast4: body.bankAccountLast4,
      ifsc: body.ifsc,
      joiningDate: body.joiningDate,
      exitDate: body.exitDate,
      projectIds: body.projectIds,
      safetyInductionDone: body.safetyInductionDone,
      status: body.status ?? "active",
    });
    return NextResponse.json(record, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof DomainError) return envelopeErr(e.code, e.message, e.httpStatus);
    if (getErrorCode(e) === "P2002") {
      return envelopeErr("DUPLICATE", "A workman with this code already exists", 409);
    }
    console.error("[workman.create] failed:", e);
    return envelopeErr("INTERNAL_ERROR", toErrorMessage(e, "Failed to create workman"), 500);
  }
}
