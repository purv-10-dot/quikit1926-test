import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { validateRequired, validateMinLength } from "@/lib/validators";
import {
  listTermsConditions,
  countTermsConditions,
  createTermsCondition,
} from "@/lib/masters/terms-repository";
import { parsePagination, paginateDb, parseSort } from "@/lib/http/pagination";

/**
 * GET  /api/masters/terms — list tenant T&C templates (seeded on first call).
 * POST /api/masters/terms — create a T&C template.
 */

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("construction.org_terms", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const applicableTo = searchParams.get("applicableTo") ?? "";
  const includeInactive = searchParams.get("includeInactive") === "true";
  const statusParam = (searchParams.get("status") ?? "").toLowerCase();
  const status: "active" | "inactive" | "all" | undefined =
    statusParam === "active" ? "active"
    : statusParam === "inactive" ? "inactive"
    : statusParam === "all" ? "all"
    : undefined;

  const baseOpts = {
    orgId: ctx.orgId,
    search,
    applicableTo: applicableTo || undefined,
    includeInactive,
    status,
  };
  const { orderBy } = parseSort(
    searchParams,
    ["title", "applicableTo", "status", "createdAt"],
    { field: "createdAt", order: "desc" },
  );
  const result = await paginateDb(
    parsePagination(req),
    (paging) => listTermsConditions({ ...baseOpts, ...paging, orderBy }),
    () => countTermsConditions(baseOpts),
  );
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("construction.org_terms", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "org.terms", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for org.terms`, 403);
  }

  const body = await req.json();

  const titleCheck = validateRequired(body.title, "Title");
  if (!titleCheck.valid) {
    return NextResponse.json({ error: titleCheck.error }, { status: 400 });
  }
  const titleLen = validateMinLength(String(body.title ?? ""), 3, "Title");
  if (!titleLen.valid) {
    return NextResponse.json({ error: titleLen.error }, { status: 400 });
  }
  const bodyCheck = validateRequired(body.body, "Terms body");
  if (!bodyCheck.valid) {
    return NextResponse.json({ error: bodyCheck.error }, { status: 400 });
  }
  const bodyLen = validateMinLength(String(body.body ?? ""), 10, "Terms body");
  if (!bodyLen.valid) {
    return NextResponse.json({ error: bodyLen.error }, { status: 400 });
  }
  const applicableCheck = validateRequired(body.applicableTo, "Applicable to");
  if (!applicableCheck.valid) {
    return NextResponse.json({ error: applicableCheck.error }, { status: 400 });
  }

  try {
    const record = await createTermsCondition({
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      title: String(body.title),
      body: String(body.body),
      applicableTo: String(body.applicableTo),
      isDefault: !!body.isDefault,
      status: body.status ?? "active",
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: unknown) {
    console.error("[terms.create] failed:", err);
    return NextResponse.json(
      { error: toErrorMessage(err, "Failed to create T&C template") },
      { status: 500 },
    );
  }
}
