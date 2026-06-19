/**
 * Term sheet template — get/save the tenant's single template.
 *
 *   GET  /api/term-sheet-template — returns the current template (or default starter)
 *   PUT  /api/term-sheet-template — save updated body
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { DEFAULT_TEMPLATE_HTML } from "@/lib/term-sheet/render";
import { FUND_ADMIN_ROLES, requireRoleOrAudit } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const putSchema = z.object({
  bodyHtml: z.string().min(50).max(50_000),
  name: z.string().max(120).optional(),
});

export const GET = withOrgAuth(async ({ orgId }) => {
  const tpl = await db.vCTermSheetTemplate.findFirst({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, bodyHtml: true, updatedAt: true },
  });
  return NextResponse.json({
    success: true,
    data: tpl ?? { id: null, name: "Default Term Sheet", bodyHtml: DEFAULT_TEMPLATE_HTML, updatedAt: null },
  });
});

export const PUT = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const denied = await requireRoleOrAudit(userId, orgId, FUND_ADMIN_ROLES, {
    action: "term-sheet-template.update",
    req,
  });
  if (denied) return denied;

  const parsed = putSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const name = parsed.data.name ?? "Default Term Sheet";

  const existing = await db.vCTermSheetTemplate.findFirst({
    where: { orgId, name },
  });
  if (existing) {
    await db.vCTermSheetTemplate.update({
      where: { id: existing.id },
      data: { bodyHtml: parsed.data.bodyHtml, updatedBy: userId },
    });
  } else {
    await db.vCTermSheetTemplate.create({
      data: {
        orgId,
        name,
        bodyHtml: parsed.data.bodyHtml,
        createdBy: userId,
        updatedBy: userId,
      },
    });
  }
  await audit({
    orgId,
    userId,
    action: "term-sheet-template.update",
    metadata: { name, bytes: parsed.data.bodyHtml.length },
    req,
  });

  return NextResponse.json({ success: true });
});
