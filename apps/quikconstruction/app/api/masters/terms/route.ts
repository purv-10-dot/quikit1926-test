import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import { validateRequired, validateMinLength } from "@/lib/validators";
import {
  listTermsConditions,
  countTermsConditions,
  createTermsCondition,
} from "@/lib/masters/terms-repository";
import { parsePagination, paginateDb } from "@/lib/http/pagination";

/**
 * GET  /api/masters/terms — list tenant T&C templates (seeded on first call).
 * POST /api/masters/terms — create a T&C template.
 */

export async function GET(req: NextRequest) {
  try {  
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ data: [], total: 0 });
  
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") ?? "";
    const applicableTo = searchParams.get("applicableTo") ?? "";
    const includeInactive = searchParams.get("includeInactive") === "true";
  
    const baseOpts = {
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      search,
      applicableTo: applicableTo || undefined,
      includeInactive,
    };
    const result = await paginateDb(
      parsePagination(req),
      (paging) => listTermsConditions({ ...baseOpts, ...paging }),
      () => countTermsConditions(baseOpts),
    );
    return NextResponse.json(result);

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[masters/terms.GET] failed:", err);
    return NextResponse.json(
      { ok: false, error: e.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

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
      tenantId: ctx.tenantId,
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
    const e = err as { code?: string; message?: string };
    console.error("[terms.create] failed:", err);
    return NextResponse.json(
      { error: e?.message ?? "Failed to create T&C template" },
      { status: 500 },
    );
  }
}
