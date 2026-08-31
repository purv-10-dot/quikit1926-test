import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateReportInput } from "@/lib/reports/validate";

export const runtime = "nodejs";

/**
 * One saved report.
 *
 * GET / PATCH / DELETE — scoped to the OWNER. Every query filters on the
 * caller's userId and orgId as well as the id, so another user's report (or
 * another tenant's) 404s rather than leaking or mutating.
 */

async function requireOrg() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const orgId = session.user.orgId as string | undefined;
  if (!orgId) return { error: NextResponse.json({ error: "No organization selected" }, { status: 400 }) };
  return { orgId, userId: session.user.id };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth_ = await requireOrg();
  if ("error" in auth_) return auth_.error;
  const { id } = await ctx.params;

  const report = await db.qiReport.findFirst({ where: { id, orgId: auth_.orgId, userId: auth_.userId } });
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  return NextResponse.json({ success: true, data: report });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth_ = await requireOrg();
  if ("error" in auth_) return auth_.error;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = validateReportInput(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // Scope the update through updateMany so a cross-org id changes nothing.
  const result = await db.qiReport.updateMany({
    where: { id, orgId: auth_.orgId, userId: auth_.userId },
    data: parsed.data,
  });
  if (result.count === 0) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const report = await db.qiReport.findFirst({ where: { id, orgId: auth_.orgId, userId: auth_.userId } });
  return NextResponse.json({ success: true, data: report });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth_ = await requireOrg();
  if ("error" in auth_) return auth_.error;
  const { id } = await ctx.params;

  const result = await db.qiReport.deleteMany({ where: { id, orgId: auth_.orgId, userId: auth_.userId } });
  if (result.count === 0) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}
