import { NextRequest, NextResponse } from "next/server";
import { getTenantContext, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  listGSTCodes,
  countGSTCodes,
  createGSTCode,
} from "@/lib/masters/gst-codes-repository";
import { parsePagination, paginateDb } from "@/lib/http/pagination";

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ data: [], total: 0 });

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
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
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
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json(
        { error: "A GST code with this HSN/SAC already exists" },
        { status: 409 },
      );
    }
    console.error("[gst.create] failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to create GST code" },
      { status: 500 },
    );
  }
}
