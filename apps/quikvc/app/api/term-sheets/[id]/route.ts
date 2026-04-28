/**
 * Term sheet for a deal.
 *
 *   POST /api/term-sheets/[id] — generate (or regenerate) the term sheet
 *                                 for the deal. Increments version each time.
 *   GET  /api/term-sheets/[id] — fetch the latest rendered HTML.
 *
 * Where [id] = dealId.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";
import { renderTermSheet, DEFAULT_TEMPLATE_HTML, type TermSheetVars } from "@/lib/term-sheet/render";
import { notifyRole } from "@/lib/notifications";
import { PARTNER_ROLES, requireRoleOrAudit } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export const GET = withTenantAuth(
  async ({ tenantId }, _req: NextRequest, { params }: { params: { id: string } }) => {
    const ts = await db.vCTermSheet.findFirst({
      where: { tenantId, dealId: params.id },
      select: {
        id: true, version: true, status: true,
        renderedBodyHtml: true, sentAt: true, signedAt: true, updatedAt: true,
      },
    });
    if (!ts) {
      return NextResponse.json({ success: true, data: null });
    }
    return NextResponse.json({ success: true, data: ts });
  },
);

export const POST = withTenantAuth(
  async ({ tenantId, userId }, req: NextRequest, { params }: { params: { id: string } }) => {
    const denied = await requireRoleOrAudit(userId, tenantId, PARTNER_ROLES, {
      action: "term-sheet.generate",
      resource: params.id,
      req,
    });
    if (denied) return denied;

    const dealId = params.id;
    const deal = await db.vCDeal.findFirst({
      where: { id: dealId, tenantId },
      include: {
        application: {
          select: { startupName: true, contactName: true, contactEmail: true, fundingAsk: true, loanType: true, tenureMonths: true, purpose: true },
        },
      },
    });
    if (!deal) {
      return NextResponse.json({ success: false, error: "Deal not found" }, { status: 404 });
    }

    const [template, fundProfile] = await Promise.all([
      db.vCTermSheetTemplate.findFirst({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        select: { bodyHtml: true },
      }),
      db.vCFundProfile.findUnique({
        where: { tenantId },
        select: { fundName: true },
      }),
    ]);

    const askLakhs = deal.application.fundingAsk
      ? Number(deal.application.fundingAsk / BigInt(10_000_000))
      : 0;

    const vars: Partial<TermSheetVars> = {
      "startup.name": deal.application.startupName,
      "startup.contactName": deal.application.contactName,
      "startup.contactEmail": deal.application.contactEmail,
      "deal.fundingAskLakhs": String(askLakhs),
      "deal.fundingAskFormatted": `₹${askLakhs.toLocaleString("en-IN")}L`,
      "deal.loanType": deal.application.loanType ?? "—",
      "deal.tenureMonths": deal.application.tenureMonths?.toString() ?? "—",
      "deal.purpose": deal.application.purpose ?? "—",
      "fund.name": fundProfile?.fundName ?? "Fund I",
      today: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
    };

    const rendered = renderTermSheet(template?.bodyHtml ?? DEFAULT_TEMPLATE_HTML, vars);

    // Increment version on regen
    const existing = await db.vCTermSheet.findUnique({
      where: { dealId },
      select: { version: true },
    });
    const nextVersion = (existing?.version ?? 0) + 1;

    const ts = await db.vCTermSheet.upsert({
      where: { dealId },
      update: {
        version: nextVersion,
        renderedBodyHtml: rendered,
        status: "draft",
        updatedBy: userId,
      },
      create: {
        tenantId,
        dealId,
        version: nextVersion,
        renderedBodyHtml: rendered,
        status: "draft",
        createdBy: userId,
        updatedBy: userId,
      },
      select: { id: true, version: true, status: true },
    });

    await db.vCTimelineEvent.create({
      data: {
        tenantId,
        dealId,
        type: "term-sheet-generated",
        actorId: userId,
        summary: `Term sheet generated (v${nextVersion})`,
        visibility: "internal",
      },
    });

    await audit({
      tenantId,
      userId,
      action: "term-sheet.generate",
      resource: dealId,
      metadata: { version: nextVersion },
      req,
    });

    await notifyRole(tenantId, "partner", {
      type: "term-sheet-generated",
      title: `Term sheet v${nextVersion} generated`,
      body: `${deal.application.startupName}`,
      href: `/deals/${dealId}/workbench/term-sheet`,
    });

    return NextResponse.json({ success: true, data: ts }, { status: 201 });
  },
);
