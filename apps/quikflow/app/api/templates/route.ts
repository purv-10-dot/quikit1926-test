import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import type { TemplateDTO } from "@/types";

/**
 * GET /api/templates?category=Sales — the global template gallery. Templates
 * are org-agnostic starting points; auth still required so only signed-in
 * QuikFlow users reach them.
 */
export const GET = withOrgAuth(async (_ctx, req) => {
  const category = req.nextUrl.searchParams.get("category");

  const rows = await db.wfTemplate.findMany({
    where: category ? { category } : {},
    orderBy: { name: "asc" },
  });

  const data: TemplateDTO[] = rows.map((r) => ({
    id: r.id,
    app: r.app,
    name: r.name,
    category: r.category,
    description: r.description,
    triggerLabel: r.triggerLabel,
    actionLabel: r.actionLabel,
    isTested: r.isTested,
    lastTestedAt: r.lastTestedAt ? r.lastTestedAt.toISOString() : null,
  }));

  return NextResponse.json({ success: true, data });
});
