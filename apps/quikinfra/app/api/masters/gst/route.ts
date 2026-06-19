import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  listGSTCodes,
  countGSTCodes,
  createGSTCode,
} from "@/lib/masters/gst-codes-repository";
import { parsePagination, paginateDb } from "@/lib/http/pagination";

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const baseOpts = {
    orgId: ctx.orgId,
    createdBy: ctx.userId,
    search,
  };

  const result = await paginateDb(
    parsePagination(req),
    (paging) => listGSTCodes({ ...baseOpts, ...paging }),
    () => countGSTCodes(baseOpts),
  );
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "org.gst", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for org.gst`, 403);
  }

  const body = await req.json();
  if (!body?.code || !String(body.code).trim()) {
    return NextResponse.json({ error: "HSN/SAC code is required" }, { status: 400 });
  }
  if (!body?.description || !String(body.description).trim()) {
    return NextResponse.json({ error: "Description is required" }, { status: 400 });
  }
  if (body.igstRate === undefined || body.igstRate === null || body.igstRate === "") {
    return NextResponse.json({ error: "IGST rate is required" }, { status: 400 });
  }

  try {
    const record = await createGSTCode({
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      code: body.code,
      codeType: body.codeType,
      description: body.description,
      igstRate: body.igstRate,
      isRcm: body.isRcm,
      effectiveFrom: body.effectiveFrom,
      effectiveTo: body.effectiveTo,
      itemGroupId: body.itemGroupId,
      itemGroupName: body.itemGroupName,
      status: body.status ?? "active",
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: unknown) {
    if (getErrorCode(err) === "P2002") {
      return NextResponse.json(
        { error: "A GST code with this HSN/SAC already exists" },
        { status: 409 },
      );
    }
    console.error("[gst.create] failed:", err);
    return NextResponse.json(
      { error: toErrorMessage(err, "Failed to create GST code") },
      { status: 500 },
    );
  }
}
