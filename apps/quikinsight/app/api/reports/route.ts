import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateReportInput } from "@/lib/reports/validate";

export const runtime = "nodejs";

/**
 * Saved reports.
 *
 * GET  /api/reports — every report in the caller's org, newest first.
 * POST /api/reports — create one.
 *
 * PER USER. A report is owned by the person who made it: they see it, they edit
 * it, and the scheduled email is built AS them (see /api/cron/insights), so the
 * figures match what they see in the app. orgId is still filtered on every
 * query as a tenant guard — never as the only scope.
 */

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.user.orgId as string | undefined;
  if (!orgId) return NextResponse.json({ error: "No organization selected" }, { status: 400 });

  const reports = await db.qiReport.findMany({
    where: { orgId, userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ success: true, data: reports });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.user.orgId as string | undefined;
  if (!orgId) return NextResponse.json({ error: "No organization selected" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = validateReportInput(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const report = await db.qiReport.create({
    data: { orgId, userId: session.user.id, ...parsed.data },
  });

  return NextResponse.json({ success: true, data: report }, { status: 201 });
}
